/**
 * The object-store seam (`C-036`, `C-088`).
 *
 * Narrower than the domain's storage port: it knows an object key, a body, an entity tag and a
 * signed URL, and nothing about what an artefact means. A second S3-compatible provider implements
 * this interface and nothing above it changes.
 *
 * @module ports/object-store
 */
/** One object as the store returned it. */
export interface StoredObjectResponse {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly etag: string | null;
}

/** The provider-level object operations. */
export interface ObjectStoreClient {
  /**
   * Write an object only if the key is free.
   *
   * @returns The entity tag, when the provider reports one.
   * @throws ObjectAlreadyExistsError when the key is taken, and ObjectStoreUnavailableError on a
   *   transport or provider failure. Nothing is overwritten.
   */
  put(
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<{ readonly etag: string | null }>;

  /** @returns The object, or `null` when the key does not exist. */
  get(key: string): Promise<StoredObjectResponse | null>;

  /** @returns Whether a key existed and was removed. */
  delete(key: string): Promise<{ readonly deleted: boolean }>;

  /** Mint a presigned GET URL for one key. */
  presignGet(key: string, ttlSeconds: number): Promise<string>;
}

/** A write refused because a published artefact already occupies the key. */
export class ObjectAlreadyExistsError extends Error {
  constructor() {
    super('an object already exists at this key');
    this.name = 'ObjectAlreadyExistsError';
  }
}

/** The store could not be reached, or refused the request for a non-conflict reason. */
export class ObjectStoreUnavailableError extends Error {
  constructor() {
    super('the object store is unavailable');
    this.name = 'ObjectStoreUnavailableError';
  }
}

/** A read of an object that does not exist. */
export class ObjectNotFoundError extends Error {
  constructor() {
    super('the object does not exist');
    this.name = 'ObjectNotFoundError';
  }
}
