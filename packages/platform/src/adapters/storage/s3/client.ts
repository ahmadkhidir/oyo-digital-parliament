/**
 * The S3-compatible object-store client (`C-036`, `C-088`).
 *
 * A private bucket reached over the S3 REST API with SigV4 authentication: `PUT` refuses to overwrite
 * an existing key (`If-None-Match: *`), `GET` proves a miss with a `404` rather than an empty body,
 * and a read for a client is a presigned URL for one object. No vendor SDK is imported, so the single
 * object store dependency is Node's own crypto and the HTTP seam.
 *
 * A provider error is translated into one of three named failures and never re-thrown with its raw
 * payload, which can echo the key or the credential scope.
 *
 * @module adapters/storage/s3/client
 */
import type { ClockPort } from '../../../../../domain/src/ports/clock.ts';
import { type HttpClient, type HttpResponse } from '../../../ports/http.ts';
import {
  ObjectAlreadyExistsError,
  ObjectStoreUnavailableError,
  type ObjectStoreClient,
  type StoredObjectResponse,
} from '../../../ports/object-store.ts';
import { amzDate, canonicalUri, presignGet, sha256Hex, signRequest } from './sign.ts';

/** The service name in the credential scope for S3. */
const SERVICE = 's3';

/** The upper bound on one object-store exchange. */
const DEFAULT_TIMEOUT_MS = 15_000;

/** What the client needs. */
export interface S3ClientConfig {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
  readonly http: HttpClient;
  readonly clock: ClockPort;
  /** Override for a test; production uses {@link DEFAULT_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

interface Target {
  readonly url: string;
  readonly host: string;
  readonly path: string;
}

/** Where one key lives, for both addressing styles. */
function targetFor(config: S3ClientConfig, key: string): Target {
  const endpoint = new URL(config.endpoint);
  const path = config.forcePathStyle ? `/${config.bucket}/${key}` : `/${key}`;
  const host = config.forcePathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
  return {
    url: `${endpoint.protocol}//${host}${canonicalUri(path)}`,
    host,
    path,
  };
}

/** Whether a status means the object is absent rather than the store being broken. */
function isNotFound(response: HttpResponse): boolean {
  return response.status === 404;
}

/** Whether a status means the key is already taken. */
function isConflict(response: HttpResponse): boolean {
  return response.status === 409 || response.status === 412;
}

/** Read a header, or a default. */
function header(response: HttpResponse, name: string): string | null {
  const value = response.headers[name];
  return value === undefined || value === '' ? null : value;
}

/**
 * Create the object-store client.
 *
 * @param config - Endpoint, credentials, addressing style, the HTTP seam and the clock.
 */
export function createS3Client(config: S3ClientConfig): ObjectStoreClient {
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  /** Sign and send one request. */
  const send = async (
    method: 'GET' | 'PUT' | 'DELETE',
    key: string,
    options: {
      readonly body?: Uint8Array;
      readonly contentType?: string;
      readonly extraHeaders?: Readonly<Record<string, string>>;
    } = {},
  ): Promise<HttpResponse> => {
    const target = targetFor(config, key);
    const payloadHash = options.body === undefined ? sha256Hex('') : sha256Hex(options.body);
    const instant = config.clock.now();

    const headers: Record<string, string> = {
      host: target.host,
      'x-amz-date': amzDate(instant),
      'x-amz-content-sha256': payloadHash,
      ...options.extraHeaders,
    };
    if (options.contentType !== undefined) headers['content-type'] = options.contentType;

    const signed = signRequest({
      method,
      path: target.path,
      query: {},
      headers,
      payloadHash,
      region: config.region,
      service: SERVICE,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      instant,
    });

    // The unsigned headers travel after signing: `If-None-Match` is not an `x-amz-` header, so the
    // provider accepts it without a signature. `host` is not sent explicitly: the transport derives
    // it from the URL, and the signature compares against that same value.
    const sentHeaders: Record<string, string> = {
      ...headers,
      authorization: signed.authorization,
    };
    delete sentHeaders.host;

    try {
      return await config.http.send({
        method,
        url: target.url,
        headers: sentHeaders,
        ...(options.body === undefined ? {} : { body: options.body }),
        timeoutMs,
      });
    } catch {
      // A timeout and a connection failure are both "the store did not answer"; the caller retries or
      // reports degraded, and neither case can be mistaken for a missing object.
      throw new ObjectStoreUnavailableError();
    }
  };

  return {
    async put(key, body, contentType) {
      const response = await send('PUT', key, {
        body,
        contentType,
        extraHeaders: { 'if-none-match': '*' },
      });

      if (response.status >= 200 && response.status < 300) {
        return { etag: header(response, 'etag') };
      }
      if (isConflict(response)) throw new ObjectAlreadyExistsError();
      throw new ObjectStoreUnavailableError();
    },

    async get(key): Promise<StoredObjectResponse | null> {
      const response = await send('GET', key);
      if (response.status === 200) {
        return {
          body: response.body,
          contentType: header(response, 'content-type') ?? 'application/octet-stream',
          etag: header(response, 'etag'),
        };
      }
      if (isNotFound(response)) return null;
      throw new ObjectStoreUnavailableError();
    },

    async delete(key) {
      const response = await send('DELETE', key);
      if (response.status >= 200 && response.status < 300) return { deleted: true };
      if (isNotFound(response)) return { deleted: false };
      throw new ObjectStoreUnavailableError();
    },

    async presignGet(key, ttlSeconds) {
      const endpoint = new URL(config.endpoint);
      const target = targetFor(config, key);
      return presignGet({
        method: 'GET',
        scheme: endpoint.protocol === 'https:' ? 'https' : 'http',
        path: target.path,
        host: target.host,
        ttlSeconds,
        region: config.region,
        service: SERVICE,
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
        instant: config.clock.now(),
      });
    },
  };
}
