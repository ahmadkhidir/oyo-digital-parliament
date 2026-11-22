/**
 * The server-side echo of a refused correction (`C-033`).
 *
 * A refused save must put the member's values back without putting them in a URL, and a malformed
 * or unreachable echo must render as an empty form rather than a second failure.
 */
import { describe, expect, it } from 'vitest';
import { readRecordEcho, recordEchoKey, saveRecordEcho, type RecordEchoStore } from './echo';

/** A memory store matching the cache seam. */
function store(): RecordEchoStore & { readonly entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    async get(key) {
      return entries.get(key) ?? null;
    },
    async set(key, value) {
      entries.set(key, value);
    },
  };
}

const ECHO = {
  displayName: 'Seun Adeyemi',
  fullName: 'Oluwaseun Adeyemi',
  locale: 'yo-NG' as const,
  fields: { displayName: 'ALREADY_SET' },
};

describe('record echo', () => {
  it('round-trips one refused submission', async () => {
    const cache = store();
    const key = recordEchoKey('a'.repeat(64));
    await saveRecordEcho(cache, key, ECHO);

    expect(await readRecordEcho(cache, key)).toEqual(ECHO);
  });

  it('returns null on a miss and on a malformed record', async () => {
    const cache = store();
    expect(await readRecordEcho(cache, 'missing')).toBeNull();

    cache.entries.set('bad', JSON.stringify({ displayName: 4 }));
    expect(await readRecordEcho(cache, 'bad')).toBeNull();
  });

  it('drops a field reason that is not a C-001 token', async () => {
    const cache = store();
    cache.entries.set(
      'echo',
      JSON.stringify({ ...ECHO, fields: { displayName: 'Oluwaseun', fullName: 'REQUIRED' } }),
    );
    const echo = await readRecordEcho(cache, 'echo');
    expect(echo?.fields).toEqual({ fullName: 'REQUIRED' });
  });

  it('treats an unreachable store as a miss and never throws into the action', async () => {
    const cache: RecordEchoStore = {
      async get() {
        throw new Error('redis is down');
      },
      async set() {
        throw new Error('redis is down');
      },
    };
    await expect(saveRecordEcho(cache, 'key', ECHO)).resolves.toBeUndefined();
    expect(await readRecordEcho(cache, 'key')).toBeNull();
  });

  it('namespaces the key by the screen, never by a member value', () => {
    expect(recordEchoKey('abc')).toBe('web:me-echo:abc');
    expect(recordEchoKey('abc')).not.toContain('Seun');
  });
});
