/**
 * The member sign-out action's `C-001` surface (`C-008`, `NFR-026`).
 *
 * Sign-out is a contract surface like any other, so a caller-supplied `X-Correlation-Id` outside
 * the contract's pattern is refused rather than replaced. The test drives the real action and
 * asserts both halves of that: the failure envelope comes back with its `meta`, and nothing was
 * read or ended.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The `C-001` failure envelope the action answers a direct caller with.
 *
 * The action's form-facing type is `void`, so a test reads the serialised answer through this
 * shape rather than through the overloads.
 */
interface FailureAnswer {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly cause: string;
    readonly correlationId: string;
    readonly fields: Readonly<Record<string, string>>;
  };
  readonly meta: {
    readonly correlationId: string;
    readonly asAt: string;
    readonly rateLimit: {
      readonly limit: number;
      readonly remaining: number;
      readonly resetAt: string;
    };
  };
}

/** The request facts a test seeds; swapped per test. */
const holder = vi.hoisted(() => ({
  headers: new Headers(),
  sessionReads: 0,
  cookiesCleared: 0,
}));

vi.mock('next/headers', () => ({
  headers: async () => holder.headers,
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
  }),
}));

vi.mock('./deps', () => ({
  getSignInDependencies: async () => {
    holder.sessionReads += 1;
    throw new Error('the action must not reach the ports for a refused identifier');
  },
}));

vi.mock('./session-cookies', () => ({
  presentedMemberSessionToken: async () => {
    holder.sessionReads += 1;
    return 'opaque-token';
  },
  clearMemberSessionCookie: async () => {
    holder.cookiesCleared += 1;
  },
}));

import { signOutAction } from './actions';

describe('signOutAction (C-008, C-001)', () => {
  beforeEach(() => {
    holder.headers = new Headers();
    holder.sessionReads = 0;
    holder.cookiesCleared = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a malformed X-Correlation-Id with the C-001 failure envelope (C-001)', async () => {
    holder.headers = new Headers({ 'x-correlation-id': 'not-a-correlation-id' });

    const answer = (await signOutAction()) as unknown as FailureAnswer;

    expect(answer.ok).toBe(false);
    expect(answer.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      cause: 'CORRELATION_ID_INVALID',
      fields: { 'X-Correlation-Id': 'PATTERN_MISMATCH' },
    });
    // The refused value is never echoed: the refusal is labelled with a minted identifier.
    expect(answer.error.correlationId).toMatch(/^req_[0-9A-Z]{4,32}$/);
    expect(answer.meta.correlationId).toBe(answer.error.correlationId);
    expect(answer.meta.rateLimit).toMatchObject({ limit: 120, remaining: 120 });
    expect(answer.meta.rateLimit.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('ends nothing and clears no cookie when it refuses (NFR-026)', async () => {
    holder.headers = new Headers({ 'x-correlation-id': 'not-a-correlation-id' });

    await signOutAction();

    expect(holder.sessionReads).toBe(0);
    expect(holder.cookiesCleared).toBe(0);
  });
});
