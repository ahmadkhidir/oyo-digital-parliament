/**
 * Cache keys and invalidation (`C-075`, `C-086`).
 *
 * A key carries a family, an opaque scope, a generation and a fixed variant. These tests prove the
 * shape, refuse free text, and show that invalidation advances the generation so every older copy is
 * unreachable without a scan.
 */
import { describe, expect, it } from 'vitest';

import { createMemoryCache } from '../../../testing/memory-cache.ts';
import { cacheKey, generationKey, pageVariant, requireQueryHash } from './keys.ts';
import { createCacheInvalidator, currentGeneration } from './invalidate.ts';

const hash = 'a'.repeat(64);

describe('cache keys', () => {
  it('builds a namespaced key from fixed parts', () => {
    expect(
      cacheKey({
        family: 'ward_report',
        scope: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
        generation: 2,
        variant: pageVariant('ward-report', 'en-NG'),
      }),
    ).toBe('odp:v1:ward_report:wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM:v2:ward-report~en-ng');
  });

  it('refuses a scope that is not an identifier or a fixed token', () => {
    expect(() =>
      cacheKey({ family: 'public_page', scope: 'Adaeze Okafor', generation: 0, variant: 'x' }),
    ).toThrow(/opaque identifier/);
    expect(() =>
      cacheKey({ family: 'public_page', scope: 'global', generation: 0, variant: 'Free Text' }),
    ).toThrow(/fixed token/);
  });

  it('refuses a search key that carries the query instead of a digest', () => {
    expect(() => requireQueryHash('borehole agbowo')).toThrow(/SHA-256/);
    expect(requireQueryHash(hash)).toBe(hash);
    expect(
      cacheKey({
        family: 'search_results',
        scope: 'global',
        generation: 0,
        variant: requireQueryHash(hash),
      }),
    ).toContain(hash);
  });

  it('names a generation per family and scope', () => {
    expect(generationKey('public_ledger', '2026-11')).toBe(
      'odp:v1:generation:public_ledger:2026-11',
    );
  });
});

describe('cache invalidation', () => {
  it('advances the generation and leaves the old copy to expire', async () => {
    const cache = createMemoryCache();
    const invalidator = createCacheInvalidator(cache);
    const oldKey = cacheKey({
      family: 'public_page',
      scope: 'sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST',
      generation: 0,
      variant: pageVariant('submission-detail', 'en-NG'),
    });
    await cache.set(oldKey, 'rendered', 60);

    await expect(
      invalidator.invalidate({ family: 'public_page', scopeId: 'sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST' }),
    ).resolves.toEqual({ generation: 1 });

    await expect(
      currentGeneration(cache, 'public_page', 'sub_01J9Z7D8F1H3J5L7N9P1Q3R5ST'),
    ).resolves.toBe(1);

    // The old copy is still stored; no reader asks for generation 0 any more, and it expires.
    await expect(cache.get(oldKey)).resolves.toBe('rendered');
  });

  it('reads a never-invalidated family as generation zero', async () => {
    const cache = createMemoryCache();
    await expect(currentGeneration(cache, 'commitment_register', 'global')).resolves.toBe(0);
  });

  it('treats a corrupt generation counter as cold', async () => {
    const cache = createMemoryCache();
    await cache.set(generationKey('search_results', 'global'), 'not-a-number', 60);
    await expect(currentGeneration(cache, 'search_results', 'global')).resolves.toBe(0);
  });
});
