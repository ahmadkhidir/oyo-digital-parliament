/**
 * AWS Signature Version 4, implemented once for the S3-compatible object store.
 *
 * The workspace carries no cloud SDK: the only object store it talks to is reached through this
 * signer and a plain HTTP request, which keeps the vendor surface small and lets the signing
 * algorithm be tested offline against AWS's published test vector (see `sign.test.ts`).
 *
 * Two forms are needed:
 *
 * - Header signing, for `PUT`, `GET` and `DELETE`. The payload hash is the SHA-256 of the body.
 * - Query signing, for a presigned read. The payload hash is `UNSIGNED-PAYLOAD`, which is what a
 *   browser's plain `GET` can honour.
 *
 * The functions here are pure: the instant is an argument, never read from the clock, so a signed
 * request is reproducible and a test can pin the date.
 *
 * @module adapters/storage/s3/sign
 */
import { createHash, createHmac } from 'node:crypto';

/** The version marker every signed request carries. */
export const ALGORITHM = 'AWS4-HMAC-SHA256';

/** The terminal scope component. */
const TERMINATOR = 'aws4_request';

/** A lower-case hexadecimal SHA-256 digest of the given bytes or text. */
export function sha256Hex(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** An HMAC-SHA256 digest. */
function hmac(key: Uint8Array | string, value: string): Buffer {
  return createHmac('sha256', key).update(value).digest();
}

/** `YYYYMMDD'T'HHMMSS'Z'` in UTC. */
export function amzDate(instant: Date): string {
  return instant
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

/** `YYYYMMDD` in UTC. */
export function dateStamp(instant: Date): string {
  return amzDate(instant).slice(0, 8);
}

/**
 * Percent-encode one path segment or query component the way SigV4 requires.
 *
 * Unreserved characters (`A-Z a-z 0-9 - . _ ~`) pass through; everything else is upper-case
 * percent-encoded. `encodeURIComponent` is not used because it leaves `!'()*` unescaped, which AWS
 * requires encoded.
 */
export function encodeComponent(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * Canonicalise a path, encoding each segment and preserving the separators.
 *
 * The caller supplies the key as plain text; the signer owns encoding, so a key and its signature
 * cannot disagree about what was sent.
 */
export function canonicalUri(path: string): string {
  const trimmed = path.startsWith('/') ? path : `/${path}`;
  return trimmed
    .split('/')
    .map((segment) => encodeComponent(segment))
    .join('/');
}

/** Sort and encode the query parameters. An absent value is an empty value, not an omitted `=`. */
export function canonicalQuery(parameters: Readonly<Record<string, string>>): string {
  return Object.entries(parameters)
    .map(([key, value]) => [encodeComponent(key), encodeComponent(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey === rightKey ? (leftValue < rightValue ? -1 : 1) : leftKey < rightKey ? -1 : 1,
    )
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
}

/** The lowercase header name/value pairs that are actually signed. */
function canonicalHeaders(headers: Readonly<Record<string, string>>): {
  canonical: string;
  signedHeaders: string;
} {
  const entries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), value.trim().replace(/\s+/g, ' ')] as const)
    .sort(([left], [right]) => (left < right ? -1 : 1));

  return {
    canonical: entries.map(([name, value]) => `${name}:${value}\n`).join(''),
    signedHeaders: entries.map(([name]) => name).join(';'),
  };
}

/** Everything a signature needs. */
export interface SignatureInput {
  readonly method: string;
  /** The plain path, without the query. */
  readonly path: string;
  readonly query: Readonly<Record<string, string>>;
  /** The headers to sign, including `host`. */
  readonly headers: Readonly<Record<string, string>>;
  /** The hexadecimal SHA-256 of the body, or `UNSIGNED-PAYLOAD` for a presigned read. */
  readonly payloadHash: string;
  readonly region: string;
  readonly service: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly instant: Date;
}

/** The canonical request and its signature, with the scope and signed-header list. */
export interface SignatureResult {
  readonly authorization: string;
  readonly canonicalRequest: string;
  readonly stringToSign: string;
  readonly signature: string;
  readonly scope: string;
  readonly signedHeaders: string;
}

/**
 * Build the canonical request.
 *
 * Exported because it is the one artefact a reviewer can compare with the provider's documentation
 * when a signature is rejected.
 */
export function buildCanonicalRequest(
  input: Omit<SignatureInput, 'accessKeyId' | 'secretAccessKey' | 'instant'>,
): {
  canonicalRequest: string;
  signedHeaders: string;
} {
  const { canonical, signedHeaders } = canonicalHeaders(input.headers);
  const canonicalRequest = [
    input.method.toUpperCase(),
    canonicalUri(input.path),
    canonicalQuery(input.query),
    canonical,
    signedHeaders,
    input.payloadHash,
  ].join('\n');
  return { canonicalRequest, signedHeaders };
}

/**
 * Derive the signing key for one scope.
 *
 * `AWS4` + secret, then the date, the region, the service and the terminator, each as an HMAC of the
 * previous result.
 */
function signingKey(
  secretAccessKey: string,
  date: string,
  region: string,
  service: string,
): Buffer {
  const day = hmac(`AWS4${secretAccessKey}`, date);
  const scopedRegion = hmac(day, region);
  const scopedService = hmac(scopedRegion, service);
  return hmac(scopedService, TERMINATOR);
}

/**
 * Sign one request.
 *
 * @returns The `Authorization` header value and the intermediates, so a rejection can be diagnosed
 *   without re-deriving them.
 */
export function signRequest(input: SignatureInput): SignatureResult {
  const date = dateStamp(input.instant);
  const scope = `${date}/${input.region}/${input.service}/${TERMINATOR}`;
  const { canonicalRequest, signedHeaders } = buildCanonicalRequest(input);
  const stringToSign = [ALGORITHM, amzDate(input.instant), scope, sha256Hex(canonicalRequest)].join(
    '\n',
  );
  const signature = hmac(
    signingKey(input.secretAccessKey, date, input.region, input.service),
    stringToSign,
  ).toString('hex');

  return {
    authorization:
      `${ALGORITHM} Credential=${input.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    canonicalRequest,
    stringToSign,
    signature,
    scope,
    signedHeaders,
  };
}

/** What a presigned URL needs. */
export interface PresignInput {
  readonly method: 'GET';
  /** The URL scheme the endpoint is reached with; the local store is plain `http`. */
  readonly scheme: 'http' | 'https';
  readonly path: string;
  readonly host: string;
  readonly ttlSeconds: number;
  readonly region: string;
  readonly service: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly instant: Date;
}

/**
 * Mint a presigned URL.
 *
 * The signature travels as query parameters, so the URL can be handed to a browser that only issues
 * a plain `GET`. The expiry is the provider's clock plus `X-Amz-Expires`; the caller keeps it short
 * (`C-036`) and never logs, caches or embeds the result.
 */
export function presignGet(input: PresignInput): string {
  const date = dateStamp(input.instant);
  const scope = `${date}/${input.region}/${input.service}/${TERMINATOR}`;
  const signedHeaders = 'host';
  const parameters: Record<string, string> = {
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate(input.instant),
    'X-Amz-Expires': String(input.ttlSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  };

  const canonical = buildCanonicalRequest({
    method: input.method,
    path: input.path,
    query: parameters,
    headers: { host: input.host },
    payloadHash: 'UNSIGNED-PAYLOAD',
    region: input.region,
    service: input.service,
  });

  const stringToSign = [
    ALGORITHM,
    amzDate(input.instant),
    scope,
    sha256Hex(canonical.canonicalRequest),
  ].join('\n');
  const signature = hmac(
    signingKey(input.secretAccessKey, date, input.region, input.service),
    stringToSign,
  ).toString('hex');

  const query = canonicalQuery({ ...parameters, 'X-Amz-Signature': signature });
  return `${input.scheme}://${input.host}${canonicalUri(input.path)}?${query}`;
}
