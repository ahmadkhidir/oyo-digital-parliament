/**
 * The Contact screen's language write (`screens.md` Footer; `C-039`, `C-033`, `C-001`).
 *
 * The switch is the page's only write, so it is held to the same boundary as every other action:
 * a malformed `X-Correlation-Id` is refused with the `C-001` failure envelope before anything is
 * read or stored, an anonymous choice is held for the session, and a member's choice is written to
 * the account through `C-033` with the names the record already holds.
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

type Session =
  | { readonly kind: 'signed-out' }
  | { readonly kind: 'degraded' }
  | { readonly kind: 'member'; readonly token: string; readonly member: { readonly id: string } };

/** The request facts, session, record and domain answers a test seeds. */
const holder = vi.hoisted(() => ({
  headers: new Headers(),
  jar: new Map<string, string>(),
  session: { kind: 'signed-out' } as Session,
  member: null as null | { readonly displayName: string; readonly fullName: string },
  correct: { calls: 0, input: null as null | Record<string, unknown>, answer: null as unknown },
}));

vi.mock('next/headers', () => ({
  headers: async () => holder.headers,
  cookies: async () => ({
    get: (name: string) => {
      const value = holder.jar.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      holder.jar.set(name, value);
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    throw new Error(url);
  },
}));

vi.mock('../me/_lib/runtime', () => ({
  resolveMyRecordSession: async () => holder.session,
  getMyRecordRuntime: async () => ({
    ports: {
      members: {
        get: async () => holder.member,
      },
    },
  }),
  readWardName: async () => null,
}));

vi.mock('@odp/domain', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@odp/domain')>();
  return {
    ...actual,
    correctMyDetails: async (_caller: unknown, _ports: unknown, input: Record<string, unknown>) => {
      holder.correct.calls += 1;
      holder.correct.input = input;
      return holder.correct.answer;
    },
  };
});

import { changeLocaleAction } from './actions';

/** The action as a direct caller sees it: the refusal envelope, or nothing on the redirect path. */
const callAction = changeLocaleAction as unknown as (
  formData: FormData,
) => Promise<FailureAnswer | undefined>;

/** A footer form with one locale. */
function formWith(locale: string): FormData {
  const form = new FormData();
  form.set('locale', locale);
  return form;
}

describe('changeLocaleAction (C-039, C-033, C-001)', () => {
  beforeEach(() => {
    holder.headers = new Headers();
    holder.jar.clear();
    holder.session = { kind: 'signed-out' };
    holder.member = null;
    holder.correct = {
      calls: 0,
      input: null,
      answer: { ok: true, member: { id: 'mbr_1', locale: 'yo-NG' } },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a malformed X-Correlation-Id with the C-001 failure envelope', async () => {
    holder.headers = new Headers({ 'x-correlation-id': 'not-a-correlation-id' });

    const answer = await callAction(formWith('yo-NG'));

    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: 'VALIDATION_FAILED',
        cause: 'CORRELATION_ID_INVALID',
        fields: { 'X-Correlation-Id': 'PATTERN_MISMATCH' },
      },
    });
    expect(answer?.error.correlationId).toMatch(/^req_[0-9A-Z]{4,32}$/);
    expect(answer?.meta.rateLimit).toMatchObject({ limit: 120, remaining: 120 });
    // A refused call writes nothing: the previous language stays in force.
    expect(holder.jar.has('odp_locale')).toBe(false);
    expect(holder.correct.calls).toBe(0);
  });

  it('holds an anonymous choice for the session and returns to the screen', async () => {
    await expect(changeLocaleAction(formWith('yo-NG'))).rejects.toThrow('/contact');

    expect(holder.jar.get('odp_locale')).toBe('yo-NG');
    expect(holder.correct.calls).toBe(0);
  });

  it("writes a member's choice to the account, keeping the names the record holds", async () => {
    holder.session = { kind: 'member', token: 'opaque-token', member: { id: 'mbr_1' } };
    holder.member = { displayName: 'Seun A.', fullName: 'Oluwaseun Adeyemi' };

    await expect(changeLocaleAction(formWith('yo-NG'))).rejects.toThrow('/contact');

    expect(holder.correct.calls).toBe(1);
    expect(holder.correct.input).toEqual({
      displayName: 'Seun A.',
      fullName: 'Oluwaseun Adeyemi',
      locale: 'yo-NG',
    });
    expect(holder.jar.get('odp_locale')).toBe('yo-NG');
  });

  it('ignores a locale outside the two launch locales', async () => {
    await expect(changeLocaleAction(formWith('fr-FR'))).rejects.toThrow('/contact');

    expect(holder.jar.has('odp_locale')).toBe(false);
    expect(holder.correct.calls).toBe(0);
  });

  it('holds the session choice when the session store cannot answer', async () => {
    holder.session = { kind: 'degraded' };

    await expect(changeLocaleAction(formWith('yo-NG'))).rejects.toThrow('/contact');

    expect(holder.jar.get('odp_locale')).toBe('yo-NG');
    expect(holder.correct.calls).toBe(0);
  });
});
