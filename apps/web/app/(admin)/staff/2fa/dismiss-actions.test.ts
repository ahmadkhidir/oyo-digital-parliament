/**
 * The recovery-code dismissal action's `C-001` surface (`screens/25-staff-totp.md` Enrolled state).
 *
 * The action clears the sealed cookies and changes no record, but it is still a server-action
 * surface: a caller-supplied `X-Correlation-Id` outside the contract's pattern is refused with the
 * failure envelope before anything is cleared.
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

/** The request facts and cookie writes a test inspects; swapped per test. */
const holder = vi.hoisted(() => ({
  headers: new Headers(),
  clears: 0,
  redirects: [] as string[],
}));

vi.mock('next/headers', () => ({
  headers: async () => holder.headers,
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    holder.redirects.push(url);
    throw new Error(`redirected to ${url}`);
  },
}));

vi.mock('../../../../lib/staff-session/cookies', () => ({
  clearRecoveryCookie: async () => {
    holder.clears += 1;
  },
  clearEnrolmentCookie: async () => {
    holder.clears += 1;
  },
  clearStaffFlow: async () => {
    holder.clears += 1;
  },
}));

import { dismissRecoveryCodesAction } from './dismiss-actions';

describe('dismissRecoveryCodesAction (C-001)', () => {
  beforeEach(() => {
    holder.headers = new Headers();
    holder.clears = 0;
    holder.redirects = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a malformed X-Correlation-Id with the C-001 failure envelope (C-001)', async () => {
    holder.headers = new Headers({ 'x-correlation-id': 'not-a-correlation-id' });

    const answer = (await dismissRecoveryCodesAction()) as unknown as FailureAnswer;

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

  it('clears nothing and moves nowhere when it refuses (screens/25)', async () => {
    holder.headers = new Headers({ 'x-correlation-id': 'not-a-correlation-id' });

    await dismissRecoveryCodesAction();

    expect(holder.clears).toBe(0);
    expect(holder.redirects).toEqual([]);
  });
});
