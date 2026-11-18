/**
 * Private, write-once object storage (`C-036`, `C-088`).
 *
 * The bucket holds export files, generated report cards, the handover snapshot and evaluation
 * artefacts. It is private, encrypted at rest and never publicly readable: a client reads one object
 * through a short-lived signed URL minted for that object and nothing else. A published artefact is
 * written once; a correction is a new object under a new key, never an overwrite of the old one.
 *
 * The key is opaque and carries no personal data — the platform's `keys.ts` owns the naming scheme,
 * so a caller never composes a path itself.
 */
export interface ObjectWrite {
  /** The key the platform's scheme produced. Not a path a caller invents. */
  readonly key: string;
  /** The bytes to store. */
  readonly body: Uint8Array;
  /** The media type recorded with the object. */
  readonly contentType: string;
}

/** A stored object, read back in full. */
export interface StoredObject {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  /** The provider's entity tag, when it reported one. */
  readonly etag: string | null;
}

/** The object store's effect surface. */
export interface ObjectStoragePort {
  /**
   * Write one object under a key that must not already exist.
   *
   * @throws when the key is taken, when the write did not commit, or when the provider refused it.
   *   An adapter never overwrites a published artefact: a correction is a new key.
   */
  put(object: ObjectWrite): Promise<{ readonly key: string; readonly etag: string | null }>;

  /**
   * Read one object in full.
   *
   * @returns The object, or `null` when the key does not exist. A not-found is never invented as an
   *   empty object.
   */
  get(key: string): Promise<StoredObject | null>;

  /**
   * Remove an object that has not been published.
   *
   * Published exports, report cards and handover snapshots are never deleted to settle a dispute;
   * the record changes state instead (`AGENTS.md` Boundaries). This method exists for a failed or
   * abandoned write and for lifecycle expiry, and reports whether a key was present.
   */
  delete(key: string): Promise<{ readonly deleted: boolean }>;

  /**
   * Mint a short-lived URL that grants read access to one object.
   *
   * @param key - The object to authorise.
   * @param ttlSeconds - How long the URL stays valid; the platform bounds it to its configured
   *   maximum and the contract's short-lived requirement.
   * @returns The signed URL. It is never logged, cached or embedded in a page.
   */
  signedReadUrl(key: string, ttlSeconds: number): Promise<string>;
}
