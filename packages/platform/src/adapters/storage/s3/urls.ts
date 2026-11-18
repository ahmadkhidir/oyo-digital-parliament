/**
 * Signed read access to one object (`C-036`).
 *
 * The bucket is private. A client reads an artefact only through a URL minted for one object with a
 * lifetime bounded by configuration, and the URL is never logged, cached or embedded in a stored
 * page — a URL that outlives its use is a credential. This module is the single place the bound and
 * the default are applied, so a caller cannot ask for a week-long URL by passing a large number.
 *
 * @module adapters/storage/s3/urls
 */
import type { ObjectStoreClient } from '../../../ports/object-store.ts';

/** A function that mints a read URL for one key. */
export type SignedReadUrl = (key: string, ttlSeconds?: number) => Promise<string>;

/** What the URL factory needs. */
export interface SignedReadUrlOptions {
  readonly client: Pick<ObjectStoreClient, 'presignGet'>;
  /** The deployment's maximum lifetime, from `S3_SIGNED_URL_TTL_SECONDS`. */
  readonly maxTtlSeconds: number;
}

/**
 * Create the read-URL factory.
 *
 * @param options - The client and the maximum lifetime.
 * @returns A function that uses the maximum when no lifetime is given, and refuses any larger one.
 */
export function createSignedReadUrl(options: SignedReadUrlOptions): SignedReadUrl {
  if (!Number.isSafeInteger(options.maxTtlSeconds) || options.maxTtlSeconds < 1) {
    throw new Error('signed-URL lifetime must be a positive whole number of seconds');
  }

  return async (key: string, ttlSeconds?: number): Promise<string> => {
    const ttl = ttlSeconds ?? options.maxTtlSeconds;
    if (!Number.isSafeInteger(ttl) || ttl < 1 || ttl > options.maxTtlSeconds) {
      throw new Error(`signed-URL lifetime must be between 1 and ${options.maxTtlSeconds} seconds`);
    }
    return options.client.presignGet(key, ttl);
  };
}
