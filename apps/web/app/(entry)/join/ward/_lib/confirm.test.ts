/**
 * The `confirmWard` boundary's tests (`C-011`, `screens/05-ward-confirmation.md`).
 *
 * The action's Next wrapper is covered by its own suite; this file drives the parsing and outcome
 * mapping that decide every state the screen renders — the field reasons, the queue branch, the
 * confirmation's `nextScreen` and the degraded write.
 */
import { describe, expect, it } from 'vitest';
import { wardFailure, type ConfirmWardResult, type WardCaller } from '@odp/domain';
import {
  CONFIRM_IDEMPOTENCY_SCOPE,
  SIGN_IN_PATH,
  parseConfirmWardForm,
  processConfirmWard,
  type ConfirmWardRawForm,
  type ConfirmWardRunner,
  type ParsedConfirmWardForm,
} from './confirm';

/** A `C-001` idempotency key. */
const KEY = '3f9c2b1a-4d5e-4f6a-8b7c-9d0e1f2a3b4c';
const MEMBER: WardCaller = { kind: 'member', memberId: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA' };

/** A raw form with the fields a browser would send. */
function rawForm(overrides: Partial<ConfirmWardRawForm> = {}): ConfirmWardRawForm {
  return {
    description: 'Behind Agbowo market, near the express',
    localGovernmentArea: 'Ibadan North',
    confirmedWardId: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
    confirmedRank: '1',
    noneOfThese: null,
    idempotencyKey: KEY,
    ...overrides,
  };
}

/** The parsed form, when the test needs one without re-testing the parser. */
function parsedForm(overrides: Partial<ParsedConfirmWardForm> = {}): ParsedConfirmWardForm {
  return {
    description: 'Behind Agbowo market, near the express',
    localGovernmentArea: 'Ibadan North',
    confirmedWardId: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
    confirmedRank: 1,
    noneOfThese: false,
    idempotencyKey: KEY,
    ...overrides,
  };
}

/** A runner that answers with one fixed result and records how often it ran. */
function runnerAnswering(result: ConfirmWardResult): ConfirmWardRunner & { calls: number } {
  const runner = {
    calls: 0,
    async run(): Promise<ConfirmWardResult> {
      runner.calls += 1;
      return result;
    },
  };
  return runner;
}

describe('parseConfirmWardForm (C-011 request)', () => {
  it('reads a confirmed candidate and its rank', () => {
    const parsed = parseConfirmWardForm(rawForm());
    expect(parsed).toEqual({
      description: 'Behind Agbowo market, near the express',
      localGovernmentArea: 'Ibadan North',
      confirmedWardId: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
      confirmedRank: 1,
      noneOfThese: false,
      idempotencyKey: KEY,
    });
  });

  it('drops a previously selected candidate when None of these wins', () => {
    const parsed = parseConfirmWardForm(rawForm({ noneOfThese: '1' }));
    expect(parsed).toMatchObject({
      confirmedWardId: null,
      confirmedRank: undefined,
      noneOfThese: true,
    });
  });

  it('refuses a missing idempotency key', () => {
    expect(parseConfirmWardForm(rawForm({ idempotencyKey: null }))).toEqual({
      reason: 'idempotency_required',
    });
  });

  it('requires the resident’s words', () => {
    expect(parseConfirmWardForm(rawForm({ description: '   ' }))).toEqual({
      reason: 'description_required',
    });
  });

  it('refuses a description longer than the column allows', () => {
    expect(parseConfirmWardForm(rawForm({ description: 'a'.repeat(501) }))).toEqual({
      reason: 'description_long',
    });
  });

  it('refuses an area longer than the column allows', () => {
    expect(parseConfirmWardForm(rawForm({ localGovernmentArea: 'a'.repeat(121) }))).toEqual({
      reason: 'area_long',
    });
  });
});

describe('processConfirmWard (C-011 outcomes)', () => {
  it('sends a signed-out visitor through sign-in', async () => {
    const runner = runnerAnswering({
      ok: true,
      member: { id: 'mbr_x', wardStatus: 'unresolved' },
      wardDescriptionReview: null,
      nextScreen: '/',
    });
    expect(await processConfirmWard(runner, null, parsedForm(), 'digest')).toEqual({
      kind: 'signed-out',
      redirectTo: SIGN_IN_PATH,
    });
    expect(runner.calls).toBe(0);
  });

  it('records a confirmed candidate and follows nextScreen', async () => {
    const runner = runnerAnswering({
      ok: true,
      member: {
        id: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
        wardId: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
        wardStatus: 'resolved',
      },
      wardDescriptionReview: null,
      nextScreen: '/',
    });
    expect(await processConfirmWard(runner, MEMBER, parsedForm(), 'digest')).toEqual({
      kind: 'confirmed',
      redirectTo: '/',
    });
  });

  it('queues a rejected suggestion and keeps the resident on the screen', async () => {
    const runner = runnerAnswering({
      ok: true,
      member: { id: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA', wardStatus: 'unresolved' },
      wardDescriptionReview: {
        id: 'wdr_01J9Z7A3B5C7D9E1F3G5H7J9KM',
        status: 'queued',
        createdAt: '2026-11-18T09:20:00Z',
      },
      nextScreen: '/',
    });
    expect(
      await processConfirmWard(runner, MEMBER, parsedForm({ noneOfThese: true }), 'digest'),
    ).toEqual({
      kind: 'queued',
      redirectTo: '/join/ward?sent=review',
    });
  });

  it('names the description field when the use case refuses the words', async () => {
    const runner = runnerAnswering(
      wardFailure(
        'VALIDATION_FAILED',
        'WARD_CONFIRMATION_INVALID',
        'The description is too long.',
        { description: 'TOO_LONG' },
      ),
    );
    expect(await processConfirmWard(runner, MEMBER, parsedForm(), 'digest')).toEqual({
      kind: 'invalid',
      reason: 'description_long',
      echoKey: 'digest',
    });
  });

  it('names the choice when no candidate was confirmed', async () => {
    const runner = runnerAnswering(
      wardFailure('VALIDATION_FAILED', 'WARD_CHOICE_REQUIRED', 'Choose a candidate.', {
        confirmedWardId: 'REQUIRED',
      }),
    );
    expect(await processConfirmWard(runner, MEMBER, parsedForm(), 'digest')).toMatchObject({
      kind: 'invalid',
      reason: 'choice_required',
    });
  });

  it('reports a vanished ward as a choice to redo', async () => {
    const runner = runnerAnswering(
      wardFailure('NOT_FOUND', 'WARD_NOT_FOUND', 'That ward is not in the reference.', {
        confirmedWardId: 'NOT_FOUND',
      }),
    );
    expect(await processConfirmWard(runner, MEMBER, parsedForm(), 'digest')).toMatchObject({
      kind: 'invalid',
      reason: 'ward_unknown',
    });
  });

  it('maps a degraded write to the write-failed state and keeps the words', async () => {
    const runner = runnerAnswering(
      wardFailure(
        'SERVICE_DEGRADED',
        'WARD_REFERENCE_UNAVAILABLE',
        'The reference could not be read.',
      ),
    );
    expect(await processConfirmWard(runner, MEMBER, parsedForm(), 'digest')).toEqual({
      kind: 'invalid',
      reason: 'write_failed',
      echoKey: 'digest',
    });
  });

  it('uses one idempotency scope for the action', () => {
    expect(CONFIRM_IDEMPOTENCY_SCOPE).toBe('ward.confirm');
  });
});
