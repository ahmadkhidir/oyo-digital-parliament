/**
 * The subject every identity event carries (`C-089`, `EVT-002`, `EVT-003`, `EVT-004`, `EVT-036`,
 * `EVT-042`, `EVT-046`).
 *
 * `C-089` requires exactly one of `user_id` and `anonymous_id` on every event. A use case that names
 * no subject leaves the adapter with nothing to envelope, and the event is lost; so the subject is a
 * required part of the event, and these tests pin which identifier each flow names: the pending
 * registration or the challenge before an account is chosen, the member from then on.
 */
import { describe, expect, it } from 'vitest';
import { confirmRegistration, registerResident, requestSignInCode } from '../index.ts';
import { FAKE_CODE, FAKE_NOW, createIdentityHarness, fakeMember } from '../fakes.ts';
import type { PendingRegistration } from '../entities.ts';

const publicCaller = { kind: 'public' as const, locale: 'en-NG' as const };

const pendingRow = (overrides: Partial<PendingRegistration> = {}): PendingRegistration => ({
  id: 'prg_0001',
  telephoneNumber: '+2348031234567',
  fullName: 'Oluwaseun Adeyemi',
  displayName: 'Seun A.',
  declaredAge: 24,
  locale: 'en-NG',
  codeSentAt: FAKE_NOW,
  expiresAt: '2026-11-19T09:00:00Z',
  createdAt: FAKE_NOW,
  ...overrides,
});

/** A harness holding one live pending registration and its code. */
function harnessWithPending() {
  const fakes = createIdentityHarness({ pending: [pendingRow()] });
  fakes.codes.set('prg_0001', { code: FAKE_CODE, attempts: 0 });
  return fakes;
}

describe('identity analytics subject (C-089)', () => {
  it('attributes the confirmation and the registration to the member the code created', async () => {
    const fakes = harnessWithPending();
    const result = await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });
    expect(result.ok).toBe(true);

    const memberId = fakes.members[0]?.id;
    expect(memberId).toBeDefined();
    expect(fakes.analytics).toHaveLength(2);
    for (const event of fakes.analytics) {
      // One identifier only: an event with both, or with neither, is refused by the envelope.
      expect(event.subject).toEqual({ kind: 'member', memberId });
    }
    expect(fakes.analytics.map((event) => event.name)).toEqual([
      'number_confirmed',
      'account_registered',
    ]);
  });

  it('carries no personal field into either payload', async () => {
    const fakes = harnessWithPending();
    await confirmRegistration(publicCaller, fakes.ports, {
      pendingRegistrationId: 'prg_0001',
      code: FAKE_CODE,
    });

    // The taxonomy allows a locale and fixed tokens; a name, a number or an age would break it, and
    // `C-089` refuses such an event at the boundary rather than redacting it.
    const serialised = JSON.stringify(fakes.analytics);
    expect(serialised).not.toContain('+2348031234567');
    expect(serialised).not.toContain('Oluwaseun');
    expect(serialised).not.toContain('Seun A.');
    expect(serialised).not.toContain('declaredAge');
  });

  it('attributes registration_started to the pending registration, before any account exists', async () => {
    const fakes = createIdentityHarness();
    const result = await registerResident(publicCaller, fakes.ports, {
      fullName: 'Oluwaseun Adeyemi',
      declaredAge: 24,
      telephoneNumber: '0803 123 4567',
      displayName: 'Seun A.',
    });
    expect(result.ok).toBe(true);

    const pendingId = fakes.pending[0]?.id;
    expect(pendingId).toBeDefined();
    expect(fakes.analytics).toHaveLength(1);
    expect(fakes.analytics[0]?.subject).toEqual({
      kind: 'anonymous',
      anonymousId: pendingId,
    });
    expect(fakes.analytics[0]?.name).toBe('registration_started');
  });

  it('attributes sign-in to the one member that holds the number', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001', displayName: 'Seun A.' })],
    });
    const result = await requestSignInCode(publicCaller, fakes.ports, {
      telephoneNumber: '+2348031234567',
    });
    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty('accountCount');

    expect(fakes.analytics).toHaveLength(1);
    expect(fakes.analytics[0]?.subject).toEqual({ kind: 'member', memberId: 'mbr_0001' });
  });
});
