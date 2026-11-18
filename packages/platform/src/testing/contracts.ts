/**
 * The shared contract suites (`packages/platform/AGENTS.md`: a double passes the same contract).
 *
 * One suite per external system. The S3 adapter and the memory store run the storage suite; the
 * Redis adapter and the memory cache run the cache suite; the production and deterministic
 * identifier factories run the identifier suite. A method added to a port without a test in its
 * suite, or a failure mapped in one implementation and not the other, fails here.
 *
 * The suites are only imported by tests. They are exported through the `./testing` subpath beside
 * the doubles so a later adapter in another area can run the same contract.
 *
 * @module testing/contracts
 */
import { describe, expect, it } from 'vitest';

import { ObjectKeyTakenError } from '../adapters/storage/s3/adapter.ts';
import type { CacheStore } from '../ports/cache-store.ts';
import type { ObjectStoragePort } from '../../../domain/src/ports/object-store.ts';
import { IDENTIFIER_PATTERN, type IdFactory } from '../ids/ids.ts';
import type { FixedClock } from './fixed-clock.ts';

/** What a cache implementation needs to expose for the suite. */
export interface CacheContractSubject {
  readonly store: CacheStore;
  readonly clock: FixedClock;
}

/** A cache store, proven against the shared contract. */
export function describeCacheStoreContract(name: string, create: () => CacheContractSubject): void {
  describe(`${name}: cache store contract`, () => {
    it('returns null for a miss rather than an empty value', async () => {
      const { store } = create();
      await expect(store.get('odp:v1:public_page:global:v0:record-home~en-ng')).resolves.toBeNull();
    });

    it('stores a value with its expiry and reads it back', async () => {
      const { store } = create();
      await store.set('key', 'value', 60);
      await expect(store.get('key')).resolves.toBe('value');
      await expect(store.ttl('key')).resolves.toBeGreaterThan(0);
    });

    it('drops a value once its lifetime has passed', async () => {
      const { store, clock } = create();
      await store.set('key', 'value', 10);
      clock.advance(10_000);
      await expect(store.get('key')).resolves.toBeNull();
      await expect(store.ttl('key')).resolves.toBe(-2);
    });

    it('refuses an entry without a positive lifetime', async () => {
      const { store } = create();
      await expect(store.set('key', 'value', 0)).rejects.toThrow(TypeError);
      await expect(store.set('key', 'value', -1)).rejects.toThrow(TypeError);
    });

    it('reports whether a delete removed anything', async () => {
      const { store } = create();
      await store.set('key', 'value', 60);
      await expect(store.delete('key')).resolves.toBe(true);
      await expect(store.delete('key')).resolves.toBe(false);
    });

    it('deletes many keys and counts the ones that existed', async () => {
      const { store } = create();
      await store.set('a', '1', 60);
      await store.set('b', '2', 60);
      await expect(store.deleteMany(['a', 'b', 'c'])).resolves.toBe(2);
    });

    it('starts a counter at one and does not slide its window', async () => {
      const { store, clock } = create();
      await expect(store.increment('counter', 30)).resolves.toBe(1);
      const firstTtl = await store.ttl('counter');
      clock.advance(5_000);
      await expect(store.increment('counter', 30)).resolves.toBe(2);
      await expect(store.ttl('counter')).resolves.toBe(firstTtl - 5);
    });

    it('answers a ping', async () => {
      const { store } = create();
      await expect(store.ping()).resolves.toBe(true);
    });
  });
}

/** An object store, proven against the shared contract. */
export function describeObjectStorageContract(name: string, create: () => ObjectStoragePort): void {
  describe(`${name}: object storage contract`, () => {
    it('writes one object and reads it back byte for byte', async () => {
      const store = create();
      const body = new Uint8Array([1, 2, 3, 4]);
      await store.put({ key: 'exports/request/drq_example', body, contentType: 'application/zip' });
      const stored = await store.get('exports/request/drq_example');
      expect(stored?.contentType).toBe('application/zip');
      expect(stored?.body).toEqual(body);
    });

    it('refuses to overwrite a key that already holds an artefact', async () => {
      const store = create();
      const object = {
        key: 'report-cards/2026-Q4/stamp',
        body: new Uint8Array([1]),
        contentType: 'application/json',
      };
      await store.put(object);
      await expect(store.put({ ...object, body: new Uint8Array([2]) })).rejects.toBeInstanceOf(
        ObjectKeyTakenError,
      );
    });

    it('reports an absent object as null, never as an empty object', async () => {
      const store = create();
      await expect(store.get('exports/request/drq_missing')).resolves.toBeNull();
    });

    it('deletes one object and reports an absent key', async () => {
      const store = create();
      await store.put({
        key: 'evaluations/k',
        body: new Uint8Array([9]),
        contentType: 'text/plain',
      });
      await expect(store.delete('evaluations/k')).resolves.toEqual({ deleted: true });
      await expect(store.delete('evaluations/k')).resolves.toEqual({ deleted: false });
    });

    it('mints a signed read URL that carries an expiry', async () => {
      const store = create();
      await store.put({
        key: 'exports/request/drq_example',
        body: new Uint8Array([1]),
        contentType: 'application/zip',
      });
      const url = await store.signedReadUrl('exports/request/drq_example', 60);
      expect(url).toContain('expires');
      expect(url).not.toContain('secret');
    });
  });
}

/** An identifier factory, proven against the shared contract. */
export function describeIdentifierContract(name: string, create: () => IdFactory): void {
  describe(`${name}: identifier contract`, () => {
    it('mints the C-001 shape for every kind', () => {
      const factory = create();
      const value = factory.generate('submission');
      expect(value).toMatch(IDENTIFIER_PATTERN);
      expect(value.startsWith('sub_')).toBe(true);
    });

    it('never repeats an identifier', () => {
      const factory = create();
      const values = new Set<string>();
      for (let index = 0; index < 500; index += 1) values.add(factory.next('sub'));
      expect(values.size).toBe(500);
    });

    it('sorts in creation order', () => {
      const factory = create();
      const values = [factory.next('sub'), factory.next('sub'), factory.next('sub')];
      expect([...values].sort()).toEqual(values);
    });
  });
}
