/**
 * Deletion propagation for analytics (`analytics.md` Deletion propagation, `C-077`
 * `analytics.replaceUserToken`).
 */
import { describe, expect, it } from 'vitest';

import { replaceAnalyticsUserToken, type ReplaceUserTokenDeps } from './replace-user-token.ts';

const USER_ID = 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA';

/** A store that records the replacement and reports a fixed count. */
function fakeStore(
  options: { throws?: boolean; replaced?: number } = {},
): ReplaceUserTokenDeps['store'] & {
  calls: Array<{ userId: string; token: string }>;
} {
  const calls: Array<{ userId: string; token: string }> = [];
  return {
    calls,
    async replaceUserToken(userId, token) {
      calls.push({ userId, token });
      if (options.throws === true) throw new Error('store unavailable');
      return { replaced: options.replaced ?? 42 };
    },
  };
}

const pseudonym = {
  async derive(userId: string) {
    return `ano_${userId.slice(4)}`;
  },
};

describe('analytics deletion propagation', () => {
  it('replaces the member id with a token and reports the count', async () => {
    const store = fakeStore();
    const result = await replaceAnalyticsUserToken(
      { store, pseudonymTokens: pseudonym },
      { userId: USER_ID },
    );
    expect(result).toEqual({
      ok: true,
      userIdToken: `ano_${USER_ID.slice(4)}`,
      replacedEvents: 42,
    });
    expect(store.calls).toEqual([{ userId: USER_ID, token: `ano_${USER_ID.slice(4)}` }]);
  });

  it('derives the same token on a retry, so a second attempt cannot fork the history', async () => {
    const store = fakeStore();
    const deps = { store, pseudonymTokens: pseudonym };
    const first = await replaceAnalyticsUserToken(deps, { userId: USER_ID });
    const second = await replaceAnalyticsUserToken(deps, { userId: USER_ID });
    expect(first.ok && second.ok && first.userIdToken === second.userIdToken).toBe(true);
  });

  it('refuses a value that is not a member id', async () => {
    for (const userId of ['', 'Oluwaseun', 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9K@']) {
      const result = await replaceAnalyticsUserToken(
        { store: fakeStore(), pseudonymTokens: pseudonym },
        { userId },
      );
      expect(result.ok, userId).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe('VALIDATION_FAILED');
        expect(result.cause).toBe('USER_ID_INVALID');
      }
    }
  });

  it('reports a store that did not confirm, because the request is not complete without it', async () => {
    const result = await replaceAnalyticsUserToken(
      { store: fakeStore({ throws: true }), pseudonymTokens: pseudonym },
      { userId: USER_ID },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('SERVICE_DEGRADED');
      expect(result.cause).toBe('ANALYTICS_STORE_UNAVAILABLE');
    }
  });
});
