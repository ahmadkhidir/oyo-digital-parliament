/**
 * The `confirmWard` action's tests (`C-011`, `screens/05-ward-confirmation.md`).
 *
 * Each test drives the real server action against a transactional-runner double, catches the
 * redirect the action answers with, and reads the echo it leaves behind. The session decides the
 * member; the form never names one.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmWardResult, SessionMemberProjection } from '@odp/domain';

/** The redirect the action answers with; Next throws it out of the action. */
class Redirected extends Error {
  readonly url: string;

  constructor(url: string) {
    super(url);
    this.url = url;
  }
}

vi.mock('next/navigation', () => ({
  redirect: (url: string): never => {
    throw new Redirected(url);
  },
}));

/** A `C-001` idempotency key. */
const KEY = '3f9c2b1a-4d5e-4f6a-8b7c-9d0e1f2a3b4c';
const DIGEST = createHash('sha256').update(`ward.confirm:${KEY}`, 'utf8').digest('hex');

const MEMBER: SessionMemberProjection = {
  id: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
  displayName: 'Seun A.',
  identityState: 'registered',
  wardStatus: 'unresolved',
  locale: 'en-NG',
  sharedNumber: false,
};

/** The state a test seeds: the session, the echo store and the runner's answer. */
const holder = vi.hoisted(() => ({
  member: null as SessionMemberProjection | null,
  cache: new Map<string, string>(),
  run: null as
    null | ((caller: unknown, input: unknown, options: unknown) => Promise<ConfirmWardResult>),
}));

vi.mock('../../../../lib/session/session-cookies', () => ({
  presentedMemberSessionToken: async () => 'opaque-token',
}));

vi.mock('./_lib/runtime', () => ({
  getWardDependencies: async () => ({
    platform: {
      cache: {
        get: async (key: string) => holder.cache.get(key) ?? null,
        set: async (key: string, value: string) => {
          holder.cache.set(key, value);
        },
      },
    },
  }),
  resolveMemberSession: async () => holder.member,
}));

vi.mock('./_lib/confirm-transaction', () => ({
  createConfirmWardRunner: () => ({
    run: (caller: unknown, input: unknown, options: unknown) => {
      if (holder.run === null) throw new Error('the runner is not seeded');
      return holder.run(caller, input, options);
    },
  }),
}));

import { confirmWardAction } from './actions';
import { SIGN_IN_PATH } from './_lib/confirm';

/** A confirmed answer. */
const CONFIRMED: ConfirmWardResult = {
  ok: true,
  member: { id: MEMBER.id, wardId: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM', wardStatus: 'resolved' },
  wardDescriptionReview: null,
  nextScreen: '/',
};

/** A queued answer. */
const QUEUED: ConfirmWardResult = {
  ok: true,
  member: { id: MEMBER.id, wardStatus: 'unresolved' },
  wardDescriptionReview: {
    id: 'wdr_01J9Z7A3B5C7D9E1F3G5H7J9KM',
    status: 'queued',
    createdAt: '2026-11-18T09:20:00Z',
  },
  nextScreen: '/',
};

/** A form with the fields the screen posts. */
function formWith(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set('description', 'Behind Agbowo market, near the express');
  form.set('localGovernmentArea', 'Ibadan North');
  form.set('confirmedWardId', 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM');
  form.set('confirmedRank', '1');
  form.set('idempotencyKey', KEY);
  for (const [name, value] of Object.entries(overrides)) {
    if (value === '') form.delete(name);
    else form.set(name, value);
  }
  return form;
}

/** Runs the action and captures its redirect. */
async function run(formData: FormData): Promise<Redirected> {
  try {
    await confirmWardAction(formData);
    throw new Error('the action was expected to redirect');
  } catch (error) {
    if (error instanceof Redirected) return error;
    throw error;
  }
}

describe('confirmWardAction (C-011, screens/05)', () => {
  beforeEach(() => {
    holder.member = MEMBER;
    holder.cache.clear();
    holder.run = async () => CONFIRMED;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('sends a signed-out visitor through sign-in', async () => {
    holder.member = null;
    const redirect = await run(formWith());
    expect(redirect.url).toBe(SIGN_IN_PATH);
  });

  it('refuses a form with no idempotency key before anything writes', async () => {
    holder.run = async () => {
      throw new Error('the runner must not run');
    };
    const redirect = await run(formWith({ idempotencyKey: '' }));
    expect(redirect.url).toBe('/join/ward?e=idempotency_required');
  });

  it('records a confirmation and follows nextScreen', async () => {
    const redirect = await run(formWith());
    expect(redirect.url).toBe('/');
    expect(holder.cache.size).toBe(0);
  });

  it('keeps the resident on the screen with the area-sent sheet when the words are queued', async () => {
    holder.run = async () => QUEUED;
    const redirect = await run(
      formWith({ confirmedWardId: '', confirmedRank: '', noneOfThese: '1' }),
    );
    expect(redirect.url).toBe('/join/ward?sent=review');
  });

  it('echoes the words server-side when the write is refused, never into the URL', async () => {
    holder.run = async () => ({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'MEMBER_RECORD_UNAVAILABLE',
      message: 'The account could not be read.',
      fields: {},
    });
    const redirect = await run(formWith());

    expect(redirect.url).toBe(`/join/ward?e=write_failed&k=${DIGEST}`);
    expect(redirect.url).not.toContain('Agbowo');
    const echo = JSON.parse(holder.cache.get(`web:ward-echo:confirm:${DIGEST}`) ?? 'null') as {
      description: string;
      localGovernmentArea: string;
    };
    expect(echo).toEqual({
      description: 'Behind Agbowo market, near the express',
      localGovernmentArea: 'Ibadan North',
    });
  });

  it('treats a store that threw as the write-failed state and keeps the words', async () => {
    holder.run = async () => {
      throw new Error('the transaction could not open');
    };
    const redirect = await run(formWith());
    expect(redirect.url).toBe(`/join/ward?e=write_failed&k=${DIGEST}`);
    expect(holder.cache.has(`web:ward-echo:confirm:${DIGEST}`)).toBe(true);
  });

  it('names a too-long description on the field that produced it and keeps the words', async () => {
    const redirect = await run(formWith({ description: 'a'.repeat(501) }));
    expect(redirect.url).toBe(`/join/ward?e=description_long&k=${DIGEST}`);
    expect(holder.cache.has(`web:ward-echo:confirm:${DIGEST}`)).toBe(true);
  });
});
