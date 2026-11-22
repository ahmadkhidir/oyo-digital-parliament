/**
 * Schema fidelity (`schema.md`, `packages/db/AGENTS.md` Discipline).
 *
 * For every entity the specification defines, this suite asserts that the table contains exactly the
 * properties `schema.md` lists and that the `required` array matches the database's nullability. A
 * field that went missing, was renamed, or became optional fails here, which is the check the issue
 * asks for: a discrepancy is reported as a doc gap rather than absorbed into the schema.
 *
 * The two infrastructure tables are asserted separately: they are not product entities, and their
 * shape is fixed by ADR-002 and the search projection, not by `schema.md`.
 */
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../src/schema/index.ts';

interface ExpectedEntity {
  readonly required: readonly string[];
  readonly optional: readonly string[];
}

/** `schema.md`, entity by entity: the required properties and the optional ones. */
const EXPECTED: Record<string, ExpectedEntity> = {
  ward: {
    required: ['id', 'name', 'localGovernmentArea', 'source', 'createdAt'],
    optional: ['aliases'],
  },
  member: {
    // P1-00g amended `schema.md`: a completed deletion nulls the three direct identifiers and keeps
    // the row, so `telephoneNumber`, `fullName` and `declaredAge` are no longer required.
    required: [
      'id',
      'displayName',
      'wardStatus',
      'identityState',
      'verificationMethod',
      'locale',
      'createdAt',
    ],
    optional: [
      'telephoneNumber',
      'fullName',
      'declaredAge',
      'wardId',
      'attestedById',
      'attestedAt',
      'deletedAt',
    ],
  },
  pending_registration: {
    required: [
      'id',
      'telephoneNumber',
      'fullName',
      'displayName',
      'declaredAge',
      'locale',
      'expiresAt',
      'createdAt',
    ],
    optional: ['codeSentAt', 'verifiedAt'],
  },
  residence_review: {
    required: ['id', 'memberId', 'reviewerId', 'method', 'decision', 'reviewedAt'],
    optional: ['notes'],
  },
  consent: {
    required: ['id', 'memberId', 'purpose', 'granted', 'recordedAt'],
    optional: ['withdrawnAt'],
  },
  staff_user: {
    required: ['id', 'fullName', 'role', 'external', 'secondFactorEnrolled', 'active', 'createdAt'],
    optional: ['authorisedWardIds'],
  },
  staff_credential: {
    required: [
      'id',
      'staffUserId',
      'username',
      'passwordHash',
      'recoveryCodes',
      'failedAttemptCount',
      'createdAt',
    ],
    // `schema.md` lists `totpSecretEncrypted` as required, but `C-093` clears it on an operator reset,
    // so the column must be nullable for that write to be expressible. The contract wins here and the
    // disagreement is reported as a specification gap (`staff-credential.ts` states it in full).
    optional: [
      'passwordChangedAt',
      'totpSecretEncrypted',
      'secondFactorEnrolledAt',
      'lockedUntil',
      'lastSignInAt',
    ],
  },
  ward_description_review: {
    required: ['id', 'memberId', 'description', 'status', 'createdAt'],
    optional: [
      'submissionId',
      'localGovernmentArea',
      'resolvedWardId',
      'rejectionReason',
      'reviewerId',
      'resolvedAt',
    ],
  },
  submission: {
    required: [
      'id',
      'reference',
      'authorId',
      'wardStatus',
      'type',
      'body',
      'pillar',
      'locationText',
      'locationScope',
      'status',
      'containsNamedEntity',
      'source',
      'submittedAt',
    ],
    optional: ['recorderId', 'wardId', 'costBand', 'responsibleAuthority', 'withdrawnAt'],
  },
  submission_draft: {
    required: ['id', 'authorId', 'wardStatus', 'status', 'createdAt', 'updatedAt', 'expiresAt'],
    optional: [
      'recorderId',
      'wardId',
      'type',
      'body',
      'pillar',
      'locationText',
      'locationScope',
      'costBand',
      'responsibleAuthority',
      'containsNamedEntity',
      'heldReason',
    ],
  },
  backing: {
    required: [
      'id',
      'submissionId',
      'memberId',
      'identityStateAtBacking',
      'wardIdAtBacking',
      'state',
      'createdAt',
    ],
    optional: [],
  },
  comment: {
    required: ['id', 'submissionId', 'authorId', 'body', 'status', 'createdAt'],
    optional: ['routingFlag'],
  },
  rule: { required: ['id', 'code', 'title', 'text', 'active', 'createdAt'], optional: [] },
  moderation_action: {
    required: ['id', 'commentId', 'moderatorId', 'action', 'reason', 'reviewStatus', 'occurredAt'],
    optional: ['ruleId', 'assignedReviewerId', 'reviewerId', 'reviewReason', 'reviewedAt'],
  },
  appeal: {
    required: ['id', 'commentId', 'memberId', 'reason', 'status', 'createdAt'],
    optional: ['assignedReviewerId', 'reviewerId', 'outcomeReason', 'decidedAt'],
  },
  legal_review: {
    required: ['id', 'requestedById', 'reason', 'status', 'requestedAt'],
    optional: [
      'submissionId',
      'commentId',
      'reviewerId',
      'outcomeReason',
      'publicNote',
      'decidedAt',
    ],
  },
  decision: {
    required: ['id', 'submissionId', 'version', 'type', 'reason', 'signatoryId', 'publishedAt'],
    optional: ['authority', 'supersedesDecisionId'],
  },
  decision_draft: {
    required: ['id', 'submissionId', 'staffId', 'type', 'reservedUntil', 'createdAt', 'updatedAt'],
    optional: ['reason', 'authority', 'owner', 'costBand', 'targetDate', 'pillar'],
  },
  commitment: {
    required: [
      'id',
      'decisionId',
      'submissionId',
      'wardId',
      'owner',
      'costBand',
      'targetDate',
      'status',
      'withdrawnByAuthor',
      'pillar',
      'updatedAt',
    ],
    optional: [
      'statusReason',
      'budgetLineReference',
      'budgetLineDescription',
      'budgetLineAmount',
      'budgetLineConfirmedById',
      'budgetLineConfirmedAt',
      'authorWithdrawnAt',
    ],
  },
  commitment_status_change: {
    required: [
      'id',
      'commitmentId',
      'fromStatus',
      'toStatus',
      'reason',
      'changedById',
      'changedAt',
    ],
    optional: [],
  },
  delivery_evidence: {
    required: [
      'id',
      'commitmentId',
      'type',
      'reference',
      'description',
      'recordedById',
      'recordedAt',
      'public',
    ],
    optional: [],
  },
  budget_line_match: {
    required: [
      'id',
      'commitmentId',
      'lineReference',
      'lineDescription',
      'amount',
      'status',
      'createdAt',
    ],
    optional: ['confidence', 'confirmedById'],
  },
  session: {
    required: ['id', 'title', 'localGovernmentArea', 'venue', 'startsAt', 'capacity', 'status'],
    optional: ['cancellationReason', 'rescheduledFromId', 'recordPublishedAt'],
  },
  reservation: {
    required: ['id', 'sessionId', 'memberId', 'status', 'createdAt'],
    optional: ['waitlistPosition'],
  },
  session_question: {
    required: ['id', 'sessionId', 'memberId', 'questionText', 'selected', 'outcome', 'createdAt'],
    optional: ['selectedById', 'selectedAt', 'answerText', 'answeredById', 'answeredAt'],
  },
  report_card: {
    required: [
      'id',
      'quarter',
      'cutOffAt',
      'status',
      'answerRate',
      'deliveryRate',
      'committedCount',
      'deliveredCount',
      'slippedCount',
      'droppedCount',
      'generatedAt',
    ],
    optional: ['publishedAt', 'correctionOfId', 'summaryNote'],
  },
  ward_report_snapshot: {
    required: [
      'id',
      'reportCardId',
      'wardId',
      'quarter',
      'submissions',
      'decisions',
      'commitments',
      'overdue',
      'suppressionApplied',
      'generatedAt',
    ],
    optional: [],
  },
  ward_pillar_snapshot: {
    required: [
      'id',
      'reportCardId',
      'wardId',
      'quarter',
      'pillar',
      'submissions',
      'decisions',
      'commitments',
      'overdue',
      'suppressionApplied',
      'generatedAt',
    ],
    optional: [],
  },
  data_request: {
    required: ['id', 'memberId', 'type', 'status', 'requestedAt'],
    optional: [
      'legalHoldNote',
      'legalHoldReviewAt',
      'outcomeReason',
      'fileReference',
      'completedById',
      'completedAt',
    ],
  },
  audit_event: {
    required: ['id', 'actorId', 'actorRole', 'action', 'entityType', 'entityId', 'occurredAt'],
    optional: ['reason'],
  },
  model_evaluation: {
    required: [
      'id',
      'capability',
      'modelVersion',
      'datasetSize',
      'metric',
      'threshold',
      'result',
      'passed',
      'runAt',
    ],
    optional: [],
  },
};

/** The entity modules, keyed by physical table name. */
const ENTITY_TABLES: Record<string, PgTable> = {
  ward: schema.ward,
  member: schema.member,
  pending_registration: schema.pendingRegistration,
  residence_review: schema.residenceReview,
  consent: schema.consent,
  staff_user: schema.staffUser,
  staff_credential: schema.staffCredential,
  ward_description_review: schema.wardDescriptionReview,
  submission: schema.submission,
  submission_draft: schema.submissionDraft,
  backing: schema.backing,
  comment: schema.comment,
  rule: schema.rule,
  moderation_action: schema.moderationAction,
  appeal: schema.appeal,
  legal_review: schema.legalReview,
  decision: schema.decision,
  decision_draft: schema.decisionDraft,
  commitment: schema.commitment,
  commitment_status_change: schema.commitmentStatusChange,
  delivery_evidence: schema.deliveryEvidence,
  budget_line_match: schema.budgetLineMatch,
  session: schema.session,
  reservation: schema.reservation,
  session_question: schema.sessionQuestion,
  report_card: schema.reportCard,
  ward_report_snapshot: schema.wardReportSnapshot,
  ward_pillar_snapshot: schema.wardPillarSnapshot,
  data_request: schema.dataRequest,
  audit_event: schema.auditEvent,
  model_evaluation: schema.modelEvaluation,
};

/**
 * Physical columns that exist for infrastructure reasons and not as `schema.md` properties.
 * `audit_event.sequence` is the log position `C-090` returns; `correlation_id` is the request
 * identifier carried beside the entity (`C-001`, `C-090`).
 */
const INFRASTRUCTURE_COLUMNS: Record<string, readonly string[]> = {
  audit_event: ['sequence', 'correlation_id'],
};

describe('schema mirrors schema.md', () => {
  for (const [tableName, expected] of Object.entries(EXPECTED)) {
    it(`${tableName} has exactly the specified properties`, () => {
      const table = ENTITY_TABLES[tableName];
      expect(table, `no table registered for ${tableName}`).toBeDefined();

      const config = getTableConfig(table as PgTable);
      const columns = new Map(config.columns.map((column) => [column.name, column]));

      for (const column of INFRASTRUCTURE_COLUMNS[tableName] ?? []) {
        columns.delete(column);
      }

      const required = new Set(expected.required.map(snakeCase));
      const optional = new Set(expected.optional.map(snakeCase));

      expect([...columns.keys()].sort()).toEqual([...required, ...optional].sort());

      for (const name of required) {
        expect(columns.get(name)?.notNull, `${tableName}.${name} must be required`).toBe(true);
      }
      for (const name of optional) {
        expect(columns.get(name)?.notNull, `${tableName}.${name} must be optional`).toBe(false);
      }
    });
  }

  it('covers every entity table and no product table outside the specification', () => {
    const entityNames = Object.keys(ENTITY_TABLES).sort();
    expect(Object.keys(EXPECTED).sort()).toEqual(entityNames);
  });

  it('keeps the two infrastructure tables documented and outside the entity list', () => {
    expect(Object.keys(ENTITY_TABLES)).not.toContain('idempotency_record');
    expect(Object.keys(ENTITY_TABLES)).not.toContain('search_document');
    const idempotency = getTableConfig(schema.idempotencyRecord);
    expect(idempotency.columns.map((column) => column.name).sort()).toEqual([
      'created_at',
      'expires_at',
      'fingerprint',
      'key',
      'response',
      'scope',
      'state',
    ]);
  });
});

/** `localGovernmentArea` → `local_government_area`. */
function snakeCase(name: string): string {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}
