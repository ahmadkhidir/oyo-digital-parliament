/**
 * Deterministic factories for the database suites.
 *
 * Identifiers come from a monotonic counter in the `C-001` form, so a failing test reproduces with
 * the same keys on every run. Timestamps are fixed instants; nothing here reads the clock or draws a
 * random value.
 *
 * A factory supplies exactly the columns the specification makes required. Anything a test varies is
 * passed as an override, which keeps each test's data visible in the test rather than buried in a
 * default.
 */
import type { TestDatabaseClient } from './database.ts';
import { auditEvent } from '../schema/audit-event.ts';
import { decision } from '../schema/decision.ts';
import { member } from '../schema/member.ts';
import { staffUser } from '../schema/staff-user.ts';
import { submission } from '../schema/submission.ts';
import { ward } from '../schema/ward.ts';

/** A fixed instant used wherever the specification does not need a different one. */
export const T0 = '2026-01-05T09:00:00Z';

let counter = 0;
let submissionCounter = 0;
let memberNumberCounter = 0;

/** A deterministic `C-001` identifier with the given three-letter prefix. */
export function testId(prefix: string): string {
  counter += 1;
  return `${prefix}_${counter.toString(36).toUpperCase().padStart(4, '0')}`;
}

/** Resets the identifier counter. Called by a suite that asserts exact values. */
export function resetTestIds(): void {
  counter = 0;
  memberNumberCounter = 0;
}

export interface WardOverrides {
  readonly id?: string;
  readonly name?: string;
  readonly localGovernmentArea?: string;
  readonly source?: 'seeded' | 'confirmed' | 'reviewed';
  readonly createdAt?: string;
}

/** Inserts a ward and returns its identifier. */
export async function createWard(
  db: TestDatabaseClient,
  overrides: WardOverrides = {},
): Promise<string> {
  const id = overrides.id ?? testId('wrd');
  await db.insert(ward).values({
    id,
    name: overrides.name ?? `Ward ${id}`,
    localGovernmentArea: overrides.localGovernmentArea ?? 'Ibadan North',
    aliases: [],
    source: overrides.source ?? 'seeded',
    createdAt: overrides.createdAt ?? T0,
  });
  return id;
}

export interface StaffOverrides {
  readonly id?: string;
  readonly fullName?: string;
  readonly role?:
    | 'ward_organiser'
    | 'response_staff'
    | 'moderator'
    | 'external_reviewer'
    | 'legal_reviewer'
    | 'operator';
  readonly external?: boolean;
}

/** Inserts a staff user and returns its identifier. */
export async function createStaffUser(
  db: TestDatabaseClient,
  overrides: StaffOverrides = {},
): Promise<string> {
  const id = overrides.id ?? testId('stf');
  const role = overrides.role ?? 'response_staff';
  await db.insert(staffUser).values({
    id,
    fullName: overrides.fullName ?? `Staff ${id}`,
    role,
    external: overrides.external ?? role === 'external_reviewer',
    authorisedWardIds: null,
    secondFactorEnrolled: true,
    active: true,
    createdAt: T0,
  });
  return id;
}

export interface MemberOverrides {
  readonly id?: string;
  readonly wardId?: string | null;
  readonly telephoneNumber?: string;
  readonly fullName?: string;
  readonly displayName?: string;
  readonly declaredAge?: number;
  readonly identityState?: 'registered' | 'checked';
  readonly createdAt?: string;
}

/** Inserts a member and returns its identifier. */
export async function createMember(
  db: TestDatabaseClient,
  overrides: MemberOverrides = {},
): Promise<string> {
  const id = overrides.id ?? testId('mbr');
  const wardId = overrides.wardId ?? null;
  // `FEAT-001`: a number belongs to at most one live account, so the default is unique per member
  // and deterministic across a run.
  memberNumberCounter += 1;
  await db.insert(member).values({
    id,
    telephoneNumber:
      overrides.telephoneNumber ?? `+23480${String(memberNumberCounter).padStart(8, '0')}`,
    fullName: overrides.fullName ?? `Resident ${id}`,
    displayName: overrides.displayName ?? `Resident ${id}`,
    declaredAge: overrides.declaredAge ?? 24,
    wardId,
    wardStatus: wardId === null ? 'unresolved' : 'resolved',
    identityState: overrides.identityState ?? 'registered',
    verificationMethod: 'self_code',
    attestedById: null,
    attestedAt: null,
    locale: 'en-NG',
    createdAt: overrides.createdAt ?? T0,
    deletedAt: null,
  });
  return id;
}

export interface SubmissionOverrides {
  readonly id?: string;
  readonly reference?: string;
  readonly authorId: string;
  readonly wardId?: string | null;
  readonly type?: 'issue' | 'proposal';
  readonly body?: string;
  readonly status?: 'awaiting_decision' | 'decided' | 'withdrawn' | 'withheld' | 'out_of_area';
  readonly submittedAt?: string;
  readonly withdrawnAt?: string | null;
}

/** Inserts a submission and returns its identifier. */
export async function createSubmission(
  db: TestDatabaseClient,
  overrides: SubmissionOverrides,
): Promise<string> {
  const id = overrides.id ?? testId('sub');
  const wardId = overrides.wardId ?? null;
  const status = overrides.status ?? 'awaiting_decision';
  submissionCounter += 1;
  await db.insert(submission).values({
    id,
    reference: overrides.reference ?? `ODP-${String(submissionCounter).padStart(6, '0')}`,
    authorId: overrides.authorId,
    recorderId: null,
    wardId,
    wardStatus: wardId === null ? 'unresolved' : 'resolved',
    type: overrides.type ?? 'issue',
    body:
      overrides.body ??
      'The borehole at Agbowo market has been dry since March and the queue at the next one is long.',
    pillar: 'infrastructure',
    locationText: 'Agbowo market, Ibadan North',
    locationScope: 'in_state',
    costBand: null,
    responsibleAuthority: null,
    status,
    containsNamedEntity: false,
    source: 'web',
    submittedAt: overrides.submittedAt ?? T0,
    withdrawnAt:
      overrides.withdrawnAt ?? (status === 'withdrawn' ? (overrides.submittedAt ?? T0) : null),
  });
  return id;
}

export interface DecisionOverrides {
  readonly id?: string;
  readonly submissionId: string;
  readonly signatoryId: string;
  readonly version?: number;
  readonly type?: 'commit' | 'decline' | 'refer';
  readonly reason?: string;
  readonly authority?: string | null;
  readonly supersedesDecisionId?: string | null;
  readonly publishedAt?: string;
}

/** Inserts a decision and returns its identifier. */
export async function createDecision(
  db: TestDatabaseClient,
  overrides: DecisionOverrides,
): Promise<string> {
  const id = overrides.id ?? testId('dec');
  await db.insert(decision).values({
    id,
    submissionId: overrides.submissionId,
    version: overrides.version ?? 1,
    type: overrides.type ?? 'decline',
    reason:
      overrides.reason ??
      'The work is the responsibility of the local government, not the campaign.',
    authority: overrides.authority ?? null,
    signatoryId: overrides.signatoryId,
    supersedesDecisionId: overrides.supersedesDecisionId ?? null,
    publishedAt: overrides.publishedAt ?? T0,
  });
  return id;
}

export interface AuditEventOverrides {
  readonly id?: string;
  readonly actorId: string;
  readonly actorRole?:
    | 'member'
    | 'ward_organiser'
    | 'response_staff'
    | 'moderator'
    | 'external_reviewer'
    | 'legal_reviewer'
    | 'operator'
    | 'system';
  readonly action?: string;
  readonly entityType?: string;
  readonly entityId?: string;
  readonly reason?: string | null;
  readonly occurredAt?: string;
  readonly correlationId?: string | null;
}

/** Inserts one audit row (through the table, not the repository) and returns its identifier. */
export async function createAuditEvent(
  db: TestDatabaseClient,
  overrides: AuditEventOverrides,
): Promise<string> {
  const id = overrides.id ?? testId('aud');
  await db.insert(auditEvent).values({
    id,
    actorId: overrides.actorId,
    actorRole: overrides.actorRole ?? 'response_staff',
    action: overrides.action ?? 'decision.published',
    entityType: overrides.entityType ?? 'Decision',
    entityId: overrides.entityId ?? testId('dec'),
    reason: overrides.reason ?? null,
    occurredAt: overrides.occurredAt ?? T0,
    correlationId: overrides.correlationId ?? null,
  });
  return id;
}
