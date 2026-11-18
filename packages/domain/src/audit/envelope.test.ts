/**
 * The `C-090` audit envelope: what an admitted record looks like, and every way a submission is
 * refused. Each refusal asserts its `C-001` code, its stable cause and the field that produced it.
 */
import { describe, expect, it } from 'vitest';

import { validateAuditEventInput } from './envelope.ts';

/** The contract's own example, which must be admitted unchanged. */
const DECISION_PUBLISHED = {
  id: 'aud_01J9ZN2Q4R6S8T1V3W5X7Y9ZA',
  actorId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP',
  actorRole: 'response_staff',
  action: 'decision.published',
  entityType: 'Decision',
  entityId: 'dec_01J9ZB1C3D5E7F9G1H3J5K7LMP',
  reason: 'Commit published against ODP-004821.',
  occurredAt: '2026-11-25T12:00:00Z',
  correlationId: 'req_01J9Z6M2V4',
} as const;

/** A minimal submission: the fields `schema.md` requires and nothing else. */
function minimal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    actorId: 'stf_01J9Z4C8D1E2F3G4H5J6K7M8NP',
    actorRole: 'response_staff',
    action: 'member.registered',
    entityType: 'Member',
    entityId: 'usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
    occurredAt: '2026-11-25T12:00:00Z',
    ...overrides,
  };
}

describe('audit envelope', () => {
  it("admits the schema's required fields, with the reason and correlation carried along", () => {
    const result = validateAuditEventInput(DECISION_PUBLISHED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.accepted.event).toEqual({
      id: DECISION_PUBLISHED.id,
      actorId: DECISION_PUBLISHED.actorId,
      actorRole: 'response_staff',
      action: 'decision.published',
      entityType: 'Decision',
      entityId: DECISION_PUBLISHED.entityId,
      reason: DECISION_PUBLISHED.reason,
      occurredAt: DECISION_PUBLISHED.occurredAt,
    });
    expect(result.accepted.correlationId).toBe('req_01J9Z6M2V4');
  });

  it('admits a record with no reason, because only some changes need one', () => {
    const result = validateAuditEventInput(minimal());
    expect(result.ok && result.accepted.event.reason).toBeUndefined();
  });

  it('names every missing required field', () => {
    const result = validateAuditEventInput({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(result.fields).toMatchObject({
        actorId: 'REQUIRED',
        actorRole: 'REQUIRED',
        action: 'REQUIRED',
        entityType: 'REQUIRED',
        entityId: 'REQUIRED',
        occurredAt: 'REQUIRED',
      });
    }
  });

  it('refuses a role outside the schema enum', () => {
    for (const actorRole of ['admin', 'member ', 'SYSTEM', '']) {
      const result = validateAuditEventInput(minimal({ actorRole }));
      expect(result.ok, actorRole).toBe(false);
      if (!result.ok) expect(result.fields['actorRole'], actorRole).toBeDefined();
    }
  });

  it('accepts every role the schema declares', () => {
    for (const actorRole of [
      'member',
      'ward_organiser',
      'response_staff',
      'moderator',
      'external_reviewer',
      'legal_reviewer',
      'operator',
      'system',
    ]) {
      expect(validateAuditEventInput(minimal({ actorRole })).ok, actorRole).toBe(true);
    }
  });

  it('refuses an action that is not a stable dotted verb', () => {
    for (const action of [
      'Removed a comment',
      'published',
      'decision.',
      '.published',
      'Decision.Published',
    ]) {
      const result = validateAuditEventInput(minimal({ action }));
      expect(result.ok, action).toBe(false);
      if (!result.ok) expect(result.fields['action'], action).toBe('PATTERN_MISMATCH');
    }
  });

  it('refuses an action longer than the schema allows', () => {
    const result = validateAuditEventInput(minimal({ action: `member.${'a'.repeat(80)}` }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields['action']).toBe('TOO_LONG');
  });

  it('refuses an entity type that is not a single capitalised word', () => {
    for (const entityType of ['decision record', 'decision', 'Decision Record']) {
      const result = validateAuditEventInput(minimal({ entityType }));
      expect(result.ok, entityType).toBe(false);
      if (!result.ok) expect(result.fields['entityType'], entityType).toBe('PATTERN_MISMATCH');
    }
  });

  it('refuses an actor or target that is not a record identifier, and a time that is not UTC', () => {
    const badActor = validateAuditEventInput(minimal({ actorId: 'Oluwaseun Adeyemi' }));
    expect(badActor.ok).toBe(false);
    if (!badActor.ok) expect(badActor.fields['actorId']).toBe('PATTERN_MISMATCH');

    const badTarget = validateAuditEventInput(minimal({ entityId: 'the road behind the school' }));
    expect(badTarget.ok).toBe(false);
    if (!badTarget.ok) expect(badTarget.fields['entityId']).toBe('PATTERN_MISMATCH');

    const badTime = validateAuditEventInput(minimal({ occurredAt: '25/11/2026 12:00' }));
    expect(badTime.ok).toBe(false);
    if (!badTime.ok) expect(badTime.fields['occurredAt']).toBe('PATTERN_MISMATCH');
  });

  it('refuses a reason that copies a telephone number, an email or a held item', () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ['0803 123 4567', 'telephone'],
      ['Member reached on +234-803-123-4567', 'telephone'],
      ['Written to seun@example.com about the reply', 'email'],
      [
        `Quoted the comment: "${'the road behind the school has flooded every rainy season since twenty nineteen and nobody has come'.slice(0, 70)}"`,
        'excerpt',
      ],
    ];
    for (const [reason, label] of cases) {
      const result = validateAuditEventInput(minimal({ reason }));
      expect(result.ok, label).toBe(false);
      if (!result.ok) {
        expect(result.code, label).toBe('POLICY_VIOLATION');
        expect(result.cause, label).toBe('PERSONAL_DATA_IN_AUDIT_REASON');
        expect(result.fields['reason'], label).toBe('PATTERN_MISMATCH');
      }
    }
  });

  it('admits a reason that cites identifiers', () => {
    const result = validateAuditEventInput(
      minimal({
        reason: 'Removed under rule DEFAMATION_NAMED_PERSON; appeal path stated in the notice.',
      }),
    );
    expect(result.ok).toBe(true);
  });

  it('refuses a field the contract does not declare', () => {
    const result = validateAuditEventInput(minimal({ memberName: 'Oluwaseun Adeyemi' }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.cause).toBe('ENVELOPE_FIELD_NOT_DECLARED');
      expect(result.fields['memberName']).toBe('UNKNOWN_FIELD');
    }
  });

  it('refuses a body that is not an object', () => {
    for (const body of [null, 'audit.append', [], 7]) {
      const result = validateAuditEventInput(body);
      expect(result.ok, String(body)).toBe(false);
      if (!result.ok) expect(result.cause).toBe('ENVELOPE_MALFORMED');
    }
  });
});
