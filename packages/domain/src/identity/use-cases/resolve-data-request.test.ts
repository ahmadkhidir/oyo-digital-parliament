/**
 * The operator's transitions (`C-067`, screen 22).
 *
 * Proves the four moves, the legal-hold refusal, the export produced through `C-070`, the deletion
 * propagation, and the audit record each transition appends.
 */
import { describe, expect, it } from 'vitest';
import type { AuditEventRecord } from '../../audit/entities.ts';
import type { IdentityAnalyticsEvent } from '../ports.ts';
import type { DataRequest, IdentityCaller } from '../entities.ts';
import type { ResolveDataRequestDeps } from './resolve-data-request.ts';
import { resolveDataRequest } from './resolve-data-request.ts';

const NOW = '2026-11-22T10:00:00Z';

function operator(): Extract<IdentityCaller, { kind: 'staff' }> {
  return {
    kind: 'staff',
    staffId: 'stf_01J9Z4G3H5J7K9L1M3N5P7Q9RS',
    role: 'operator',
    external: false,
    authorisedWardIds: [],
    secondFactorSatisfied: true,
    secondFactorEnrolled: true,
    sessionId: 'session-token-0123456789abcdef',
    sessionStartedAt: '2026-11-22T08:00:00Z',
    sessionExpiresAt: '2026-11-22T10:30:00Z',
    locale: 'en-NG',
  };
}

interface Harness {
  readonly deps: ResolveDataRequestDeps;
  readonly audit: AuditEventRecord[];
  readonly events: IdentityAnalyticsEvent[];
  readonly request: () => DataRequest;
  readonly exportCalls: () => number;
  readonly anonymised: () => boolean;
}

function harness(
  row: Partial<DataRequest> & Pick<DataRequest, 'type'>,
  options: { readonly hold?: boolean } = {},
): Harness {
  let current: DataRequest = {
    id: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
    memberId: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
    status: 'received',
    requestedAt: '2026-11-21T07:20:00Z',
    ...row,
  };
  const audit: AuditEventRecord[] = [];
  const events: IdentityAnalyticsEvent[] = [];
  let exportCalls = 0;
  let anonymised = false;
  let sequence = 0;

  const deps: ResolveDataRequestDeps = {
    dataRequests: {
      async findById() {
        return current;
      },
      async transition(_requestId, input) {
        current = {
          ...current,
          status: input.status,
          ...(input.outcomeReason === undefined ? {} : { outcomeReason: input.outcomeReason }),
          ...(input.legalHoldNote === undefined ? {} : { legalHoldNote: input.legalHoldNote }),
          ...(input.legalHoldReviewAt === undefined
            ? {}
            : { legalHoldReviewAt: input.legalHoldReviewAt }),
          ...(input.fileReference === undefined ? {} : { fileReference: input.fileReference }),
          completedById: input.completedById,
          ...(input.status === 'completed' ? { completedAt: input.at } : {}),
        };
        return current;
      },
    },
    members: {
      async anonymise() {
        anonymised = true;
      },
    },
    memberContent: {
      async withdrawAuthoredSubmissions() {
        return 2;
      },
    },
    legalHolds: {
      async findOpenForMember() {
        return options.hold === true ? { reviewDate: '2026-11-25T00:00:00Z' } : null;
      },
    },
    exportMemberData: {
      async exportMemberData() {
        exportCalls += 1;
        return { objectReference: 'exports/drq_01J9ZE4J6K8L1M3N5P7Q9R1STU.zip', generatedAt: NOW };
      },
    },
    analyticsDeletion: {
      async replaceSubject() {
        return { replaced: 4 };
      },
    },
    audit: {
      async append(record) {
        audit.push(record);
        sequence += 1;
        return { sequence };
      },
    },
    analytics: {
      async emit(event) {
        events.push(event);
      },
    },
    idempotency: (() => {
      const store = new Map<string, { fingerprint: string; result: unknown }>();
      return {
        async read(key: string) {
          return store.get(key) ?? null;
        },
        async record(key: string, answer: { fingerprint: string; result: unknown }) {
          store.set(key, answer);
        },
      };
    })(),
    clock: { now: () => new Date(NOW) },
    identifiers: {
      next(prefix: string) {
        sequence += 1;
        return `${prefix}_01J9Z${String(sequence).padStart(18, '0')}`;
      },
    },
  };

  return {
    deps,
    audit,
    events,
    request: () => current,
    exportCalls: () => exportCalls,
    anonymised: () => anonymised,
  };
}

describe('resolveDataRequest (C-067)', () => {
  it('starts a request and records the operator', async () => {
    const test = harness({ type: 'access' });
    const result = await resolveDataRequest(operator(), test.deps, {
      requestId: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
      action: 'start',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataRequest.status).toBe('in_progress');
    expect(test.audit).toHaveLength(1);
    expect(test.audit[0]).toMatchObject({
      actorId: 'stf_01J9Z4G3H5J7K9L1M3N5P7Q9RS',
      actorRole: 'operator',
      action: 'data_request.started',
      entityId: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
    });
  });

  it('requires the reason, the note and the review date when deferring', async () => {
    const test = harness({ type: 'deletion' });
    const result = await resolveDataRequest(operator(), test.deps, {
      requestId: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
      action: 'defer',
      idempotencyKey: '00000000-0000-4000-8000-000000000002',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: {
        outcomeReason: 'REQUIRED',
        legalHoldNote: 'REQUIRED',
        legalHoldReviewAt: 'REQUIRED',
      },
    });
  });

  it('defers with a note and the date the hold is reviewed', async () => {
    const test = harness({ type: 'deletion' });
    const result = await resolveDataRequest(operator(), test.deps, {
      requestId: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
      action: 'defer',
      outcomeReason: 'One submission is under an open legal review.',
      legalHoldNote: 'Held for legal review, reference ODP-004821.',
      legalHoldReviewAt: '2026-12-19T00:00:00Z',
      idempotencyKey: '00000000-0000-4000-8000-000000000003',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataRequest).toMatchObject({
      status: 'deferred_for_legal_hold',
      legalHoldReviewAt: '2026-12-19T00:00:00Z',
    });
    expect(test.audit[0]?.action).toBe('data_request.deferred');
  });

  it('produces an export and records the object reference', async () => {
    const test = harness({ type: 'export' });
    const result = await resolveDataRequest(operator(), test.deps, {
      requestId: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
      action: 'complete',
      idempotencyKey: '00000000-0000-4000-8000-000000000004',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(test.exportCalls()).toBe(1);
    expect(result.dataRequest).toMatchObject({
      status: 'completed',
      fileReference: 'exports/drq_01J9ZE4J6K8L1M3N5P7Q9R1STU.zip',
    });
    expect(result.propagation).toMatchObject({ identityAnonymised: false, auditConfirmed: true });
    expect(test.events[0]).toMatchObject({ name: 'data_request_completed' });
  });

  it('refuses to complete a deletion while a legal hold is open', async () => {
    const test = harness({ type: 'deletion' }, { hold: true });
    const result = await resolveDataRequest(operator(), test.deps, {
      requestId: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
      action: 'complete',
      outcomeReason: 'Requested removal.',
      idempotencyKey: '00000000-0000-4000-8000-000000000005',
    });
    expect(result).toMatchObject({ ok: false, code: 'LEGAL_HOLD', cause: 'DELETION_DEFERRED' });
    expect(test.request().status).toBe('received');
    expect(test.anonymised()).toBe(false);
  });

  it('anonymises, withdraws and propagates a completed deletion', async () => {
    const test = harness({ type: 'deletion' });
    const result = await resolveDataRequest(operator(), test.deps, {
      requestId: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
      action: 'complete',
      outcomeReason: 'Requested removal.',
      idempotencyKey: '00000000-0000-4000-8000-000000000006',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(test.anonymised()).toBe(true);
    expect(result.propagation).toMatchObject({
      identityAnonymised: true,
      analyticsTokenReplaced: true,
      auditConfirmed: true,
    });
    expect(test.audit[0]?.action).toBe('data_request.completed');
  });

  it('refuses a role other than the operator and an unsatisfied factor', async () => {
    const test = harness({ type: 'access' });
    const wrongRole = await resolveDataRequest(
      { ...operator(), role: 'response_staff' },
      test.deps,
      {
        requestId: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
        action: 'start',
        idempotencyKey: '00000000-0000-4000-8000-000000000007',
      },
    );
    expect(wrongRole).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE', cause: 'OPERATOR_REQUIRED' });

    const unsatisfied = await resolveDataRequest(
      { ...operator(), secondFactorSatisfied: false },
      test.deps,
      {
        requestId: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
        action: 'start',
        idempotencyKey: '00000000-0000-4000-8000-000000000008',
      },
    );
    expect(unsatisfied).toMatchObject({
      ok: false,
      code: 'UNAUTHENTICATED',
      cause: 'SECOND_FACTOR_REQUIRED',
    });
  });

  it('replays one key without a second write', async () => {
    const test = harness({ type: 'access' });
    const input = {
      requestId: 'drq_01J9ZE4J6K8L1M3N5P7Q9R1STU',
      action: 'start' as const,
      idempotencyKey: '00000000-0000-4000-8000-000000000009',
    };
    const first = await resolveDataRequest(operator(), test.deps, input);
    const second = await resolveDataRequest(operator(), test.deps, input);
    expect(first.ok && second.ok).toBe(true);
    expect(test.audit).toHaveLength(1);
  });
});
