/**
 * The staff sign-out action's `C-001` surface (`C-092`, `NFR-026`, screen 26 Sign out).
 *
 * A caller-supplied `X-Correlation-Id` outside the contract's pattern is refused with the failure
 * envelope before the staff session is read, so a refused call ends nothing and clears no cookie.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** The `C-001` failure envelope a direct caller receives through the action's `void` surface. */
interface FailureAnswer {
  readonly ok: false;
  readonly error: {
    readonly code: string;
    readonly cause: string;
    readonly correlationId: string;
    readonly fields: Readonly<Record<string, string>>;
  };
  readonly meta: {
    readonly rateLimit: {
      readonly limit: number;
      readonly remaining: number;
      readonly resetAt: string;
    };
  };
}

/** The request and session facts a test seeds; swapped per test. */
const holder = vi.hoisted(() => ({
  headers: new Headers(),
  accessReads: 0,
  calls: 0,
}));

vi.mock('next/headers', () => ({
  headers: async () => holder.headers,
}));

vi.mock('./deps', () => ({
  getStaffAdminDependencies: async () => {
    holder.calls += 1;
    throw new Error('the action must not reach the ports for a refused identifier');
  },
}));

vi.mock('./session', () => ({
  readStaffAccess: async () => {
    holder.accessReads += 1;
    throw new Error('the action must not read the session for a refused identifier');
  },
  staffCaller: () => {
    holder.calls += 1;
    throw new Error('the action must not build a caller for a refused identifier');
  },
}));

vi.mock('./cookies', () => ({
  clearStaffSessionCookie: async () => {
    holder.calls += 1;
  },
  clearStaffFlow: async () => {
    holder.calls += 1;
  },
  clearEnrolmentCookie: async () => {
    holder.calls += 1;
  },
  clearRecoveryCookie: async () => {
    holder.calls += 1;
  },
}));

import { signOutStaffAction } from './actions';

describe('signOutStaffAction (C-092, C-001)', () => {
  beforeEach(() => {
    holder.headers = new Headers();
    holder.accessReads = 0;
    holder.calls = 0;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a malformed X-Correlation-Id with the C-001 failure envelope (C-001)', async () => {
    holder.headers = new Headers({ 'x-correlation-id': 'not-a-correlation-id' });

    const answer = (await signOutStaffAction()) as unknown as FailureAnswer;

    expect(answer.ok).toBe(false);
    expect(answer.error).toMatchObject({
      code: 'VALIDATION_FAILED',
      cause: 'CORRELATION_ID_INVALID',
      fields: { 'X-Correlation-Id': 'PATTERN_MISMATCH' },
    });
    expect(answer.error.correlationId).toMatch(/^req_[0-9A-Z]{4,32}$/);
    expect(answer.meta.rateLimit).toMatchObject({ limit: 120, remaining: 120 });
    expect(answer.meta.rateLimit.resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('ends nothing and clears no cookie when it refuses (NFR-026)', async () => {
    holder.headers = new Headers({ 'x-correlation-id': 'not-a-correlation-id' });

    await signOutStaffAction();

    expect(holder.accessReads).toBe(0);
    expect(holder.calls).toBe(0);
  });
});
