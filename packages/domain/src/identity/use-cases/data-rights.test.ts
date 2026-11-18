/**
 * Data-rights tests (`C-032` to `C-036`, `FEAT-012`, `C-070`).
 *
 * The member's own read is the only one carrying personal data and it is logged; consent takes effect
 * immediately; a second export is refused; deletion anonymises and withdraws but never deletes.
 */
import { describe, expect, it } from 'vitest';
import {
  anonymiseMember,
  correctMyDetails,
  createDataRequest,
  downloadExport,
  readMyRecord,
  updateConsent,
} from '../index.ts';
import { FAKE_NOW, createIdentityHarness, fakeMember } from '../fakes.ts';
import type { IdentityCaller } from '../entities.ts';

const memberCaller = (memberId = 'mbr_0001'): IdentityCaller => ({
  kind: 'member',
  memberId,
  sessionId: 'ses_member_1',
});

const staffCaller = (role: 'operator' | 'moderator', staffId = 'stf_0001'): IdentityCaller => ({
  kind: 'staff',
  staffId,
  role,
  external: false,
  authorisedWardIds: [],
  secondFactorSatisfied: true,
  secondFactorEnrolled: true,
  sessionId: 'ses_staff_1',
  sessionStartedAt: FAKE_NOW,
  sessionExpiresAt: '2026-11-18T09:10:00Z',
  locale: 'en-NG',
});

describe('readMyRecord (C-032)', () => {
  it('returns the caller’s own fields and logs the read', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      consents: [
        {
          id: 'cns_0001',
          memberId: 'mbr_0001',
          purpose: 'decision_notices',
          granted: true,
          recordedAt: FAKE_NOW,
        },
      ],
      submissions: [
        {
          authorId: 'mbr_0001',
          reference: 'ODP-004821',
          status: 'decided',
          decision: { type: 'commit', authority: null },
        },
      ],
    });
    const result = await readMyRecord(memberCaller(), fakes.ports, {});
    expect(result).toMatchObject({
      ok: true,
      record: {
        member: {
          id: 'mbr_0001',
          fullName: 'Oluwaseun Adeyemi',
          telephoneNumber: '+2348031234567',
          declaredAge: 24,
        },
        submissions: [{ reference: 'ODP-004821', decision: { type: 'commit' } }],
      },
      nextCursor: null,
    });
    expect(fakes.audit).toHaveLength(1);
    expect(fakes.audit[0]).toMatchObject({
      action: 'member_data.read',
      actorId: 'mbr_0001',
      entityType: 'Member',
    });
  });

  it('has no staff view and refuses to serve unlogged', async () => {
    const fakes = createIdentityHarness({ members: [fakeMember({ id: 'mbr_0001' })] });
    const staff = await readMyRecord(staffCaller('operator'), fakes.ports, {});
    expect(staff).toMatchObject({ ok: false, code: 'FORBIDDEN_ROLE' });

    const refused = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      auditUnavailable: true,
    });
    const result = await readMyRecord(memberCaller(), refused.ports, {});
    expect(result).toMatchObject({
      ok: false,
      code: 'SERVICE_DEGRADED',
      cause: 'AUDIT_APPEND_FAILED',
    });
  });
});

describe('correctMyDetails (C-033)', () => {
  it('rewrites the three fields and reports what keeps the old display name', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      submissions: [
        {
          authorId: 'mbr_0001',
          reference: 'ODP-004821',
          status: 'decided',
          decision: null,
        },
        {
          authorId: 'mbr_0001',
          reference: 'ODP-004822',
          status: 'decided',
          decision: null,
        },
      ],
    });
    const result = await correctMyDetails(memberCaller(), fakes.ports, {
      displayName: 'Seun Adeyemi',
      fullName: 'Oluwaseun Adeyemi',
      locale: 'yo-NG',
    });
    expect(result).toEqual({
      ok: true,
      member: {
        id: 'mbr_0001',
        displayName: 'Seun Adeyemi',
        fullName: 'Oluwaseun Adeyemi',
        locale: 'yo-NG',
      },
      previousDisplayNameRetainedOn: { submissions: 2, comments: 0 },
    });
    expect(fakes.members[0]).toMatchObject({ displayName: 'Seun Adeyemi', locale: 'yo-NG' });
    expect(fakes.audit[0]).toMatchObject({ action: 'member.profile_corrected' });
  });

  it('refuses a display name another member publishes', async () => {
    const fakes = createIdentityHarness({
      members: [
        fakeMember({ id: 'mbr_0001' }),
        fakeMember({ id: 'mbr_0002', telephoneNumber: '+2348039999999', displayName: 'Tunde O.' }),
      ],
    });
    const result = await correctMyDetails(memberCaller(), fakes.ports, {
      displayName: 'Tunde O.',
      fullName: 'Oluwaseun Adeyemi',
      locale: 'en-NG',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { displayName: 'ALREADY_SET' },
    });
  });
});

describe('updateConsent (C-034)', () => {
  it('grants, then withdraws, and emits the change', async () => {
    const fakes = createIdentityHarness({ members: [fakeMember({ id: 'mbr_0001' })] });
    const granted = await updateConsent(memberCaller(), fakes.ports, {
      purpose: 'record_transfer',
      granted: true,
    });
    expect(granted).toMatchObject({
      ok: true,
      consent: { purpose: 'record_transfer', granted: true, withdrawnAt: null },
      effectiveImmediately: true,
    });

    const withdrawn = await updateConsent(memberCaller(), fakes.ports, {
      purpose: 'record_transfer',
      granted: false,
    });
    expect(withdrawn).toMatchObject({
      ok: true,
      consent: { granted: false, withdrawnAt: FAKE_NOW },
    });
    expect(fakes.analytics.map((event) => event.name)).toEqual([
      'consent_changed',
      'consent_changed',
    ]);
    expect(fakes.audit).toHaveLength(2);
  });

  it('refuses a purpose already in the requested state', async () => {
    const fakes = createIdentityHarness({ members: [fakeMember({ id: 'mbr_0001' })] });
    await updateConsent(memberCaller(), fakes.ports, {
      purpose: 'decision_notices',
      granted: true,
    });
    const again = await updateConsent(memberCaller(), fakes.ports, {
      purpose: 'decision_notices',
      granted: true,
    });
    expect(again).toMatchObject({
      ok: false,
      code: 'CONFLICT_ALREADY_DECIDED',
      cause: 'CONSENT_ALREADY_IN_STATE',
    });
  });
});

describe('createDataRequest (C-035)', () => {
  it('records a deletion with its thirty-day deadline', async () => {
    const fakes = createIdentityHarness({ members: [fakeMember({ id: 'mbr_0001' })] });
    const result = await createDataRequest(memberCaller(), fakes.ports, { type: 'deletion' });
    expect(result).toMatchObject({
      ok: true,
      queued: false,
      dataRequest: { type: 'deletion', status: 'received' },
      dueAt: '2026-12-18T09:00:00Z',
      legalHoldDetected: false,
    });
    expect(fakes.audit[0]).toMatchObject({ action: 'data_request.created' });
  });

  it('flags an open legal hold instead of refusing', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      legalHoldReviewDate: '2026-12-01T09:00:00Z',
    });
    const result = await createDataRequest(memberCaller(), fakes.ports, { type: 'deletion' });
    expect(result).toMatchObject({ ok: true, legalHoldDetected: true });
  });

  it('refuses a second open export and names the first', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      dataRequests: [
        {
          id: 'drq_EXIST1',
          memberId: 'mbr_0001',
          type: 'export',
          status: 'in_progress',
          requestedAt: FAKE_NOW,
        },
      ],
    });
    const result = await createDataRequest(memberCaller(), fakes.ports, { type: 'export' });
    expect(result).toMatchObject({
      ok: false,
      code: 'CONFLICT_ALREADY_DECIDED',
      cause: 'DUPLICATE_EXPORT_REQUEST',
      meta: { existingDataRequestId: 'drq_EXIST1' },
    });
  });

  it('queues the write durably when the primary store refuses', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      primaryStoreUnavailable: true,
    });
    const result = await createDataRequest(memberCaller(), fakes.ports, {
      type: 'access',
      idempotencyKey: 'key-9',
    });
    expect(result).toMatchObject({ ok: true, queued: true, durable: true });
    expect(fakes.queued[0]).toMatchObject({ kind: 'data_request.create', idempotencyKey: 'key-9' });
  });

  it('refuses the note the schema cannot hold', async () => {
    const fakes = createIdentityHarness({ members: [fakeMember({ id: 'mbr_0001' })] });
    const result = await createDataRequest(memberCaller(), fakes.ports, {
      type: 'correction',
      note: 'Please fix my name',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { note: 'UNKNOWN_FIELD' },
    });
  });
});

describe('downloadExport (C-036)', () => {
  it('serves the caller’s completed export and logs the access', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      dataRequests: [
        {
          id: 'drq_EXPORT',
          memberId: 'mbr_0001',
          type: 'export',
          status: 'completed',
          requestedAt: FAKE_NOW,
          completedAt: FAKE_NOW,
          fileReference: 'exports/mbr_1/2026-11-20.zip',
        },
      ],
    });
    const result = await downloadExport(memberCaller(), fakes.ports, {
      requestId: 'drq_EXPORT',
    });
    expect(result).toMatchObject({
      ok: true,
      contentType: 'application/zip',
      filename: 'odp-export-mbr_0001.zip',
      expiresInSeconds: 300,
    });
    expect(fakes.signedUrlCalls[0]).toEqual({
      key: 'exports/mbr_1/2026-11-20.zip',
      ttlSeconds: 300,
    });
    expect(fakes.audit[0]).toMatchObject({ action: 'member_data.export' });
  });

  it('answers the same way for another member’s request', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      dataRequests: [
        {
          id: 'drq_OTHER1',
          memberId: 'mbr_0002',
          type: 'export',
          status: 'completed',
          requestedAt: FAKE_NOW,
          fileReference: 'exports/mbr_2/x.zip',
        },
      ],
    });
    const result = await downloadExport(memberCaller(), fakes.ports, {
      requestId: 'drq_OTHER1',
    });
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND', cause: 'EXPORT_NOT_FOUND' });
  });

  it('reports a deferred export as a legal hold with its review date', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      legalHoldReviewDate: '2026-12-01T09:00:00Z',
      dataRequests: [
        {
          id: 'drq_EXPORT',
          memberId: 'mbr_0001',
          type: 'export',
          status: 'deferred_for_legal_hold',
          legalHoldNote: 'A submission is under review.',
          requestedAt: FAKE_NOW,
        },
      ],
    });
    const result = await downloadExport(memberCaller(), fakes.ports, {
      requestId: 'drq_EXPORT',
    });
    expect(result).toMatchObject({
      ok: false,
      code: 'LEGAL_HOLD',
      meta: { reviewDate: '2026-12-01T09:00:00Z' },
    });
  });
});

describe('anonymiseMember (C-070, FEAT-012)', () => {
  it('removes direct identifiers and withdraws the authored submissions', async () => {
    const fakes = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      submissions: [
        {
          authorId: 'mbr_0001',
          reference: 'ODP-004821',
          status: 'decided',
          decision: null,
        },
      ],
    });
    const result = await anonymiseMember(memberCaller(), fakes.ports, {
      memberId: 'mbr_0001',
      reason: 'MEMBER_DELETION_REQUEST',
    });
    expect(result).toEqual({
      ok: true,
      memberId: 'mbr_0001',
      deletedAt: FAKE_NOW,
      submissionsWithdrawn: 1,
    });
    expect(fakes.members[0]).toMatchObject({
      id: 'mbr_0001',
      telephoneNumber: '',
      fullName: '',
      deletedAt: FAKE_NOW,
    });
    expect(fakes.submissions[0]?.status).toBe('withdrawn');
    expect(fakes.audit[0]).toMatchObject({
      action: 'member_data.deleted',
      reason: 'MEMBER_DELETION_REQUEST',
    });
  });

  it('defers on an open legal hold and refuses a role without the permission', async () => {
    const held = createIdentityHarness({
      members: [fakeMember({ id: 'mbr_0001' })],
      legalHoldReviewDate: '2026-12-01T09:00:00Z',
    });
    const deferred = await anonymiseMember(memberCaller(), held.ports, {
      memberId: 'mbr_0001',
      reason: 'MEMBER_DELETION_REQUEST',
    });
    expect(deferred).toMatchObject({
      ok: false,
      code: 'LEGAL_HOLD',
      meta: { reviewDate: '2026-12-01T09:00:00Z' },
    });

    const fakes = createIdentityHarness({ members: [fakeMember({ id: 'mbr_0001' })] });
    const refused = await anonymiseMember(staffCaller('moderator'), fakes.ports, {
      memberId: 'mbr_0001',
      reason: 'MEMBER_DELETION_REQUEST',
    });
    expect(refused).toMatchObject({
      ok: false,
      code: 'FORBIDDEN_ROLE',
      cause: 'PERSONAL_DATA_PERMISSION_ABSENT',
    });
  });
});
