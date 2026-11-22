/**
 * The `C-032` answer in the `C-001` envelope (`screens/13-my-record.md`, `NFR-040`).
 *
 * The body is asserted field for field, because this is the one response allowed to carry a real
 * name, number and age, and the two legal-hold fields must be present as `null` unless a request is
 * deferred (`CONTRACTS.md` 1.6.0).
 */
import { describe, expect, it } from 'vitest';
import { identityFailure, type MyRecord } from '@odp/domain';
import { failureAnswer, jsonAnswer, myRecordAnswer, validationAnswer } from './envelope';

const META = { correlationId: 'req_01J9Z6M2V4', asAt: '2026-11-21T07:00:00Z' };

const RECORD: MyRecord = {
  member: {
    id: 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA',
    fullName: 'Oluwaseun Adeyemi',
    telephoneNumber: '+2348031234567',
    displayName: 'Seun A.',
    declaredAge: 24,
    identityState: 'checked',
    wardStatus: 'resolved',
    wardId: 'wrd_01J9Z5A1B2C3D4E5F6G7H8J9KM',
    locale: 'en-NG',
    createdAt: '2026-11-18T09:16:00Z',
  },
  consents: [
    {
      id: 'cns_01',
      purpose: 'decision_notices',
      granted: true,
      recordedAt: '2026-11-18T09:16:00Z',
      withdrawnAt: null,
    },
  ],
  submissions: [
    { reference: 'ODP-004821', status: 'decided', decision: { type: 'commit', authority: null } },
  ],
  heldBackings: [
    {
      submissionReference: 'ODP-004102',
      submissionStatus: 'awaiting_decision',
      backingState: 'active',
    },
  ],
  dataRequests: [
    {
      id: 'drq_01',
      type: 'export',
      status: 'completed',
      requestedAt: '2026-11-20T09:00:00Z',
      fileReference: 'exports/mbr_01/2026-11-20.zip',
      legalHoldNote: null,
      legalHoldReviewAt: null,
    },
  ],
  heldItems: [{ reference: 'cmt_01', reason: 'Withheld while a legal review checks a complaint.' }],
};

describe('myRecordAnswer', () => {
  it('answers the C-032 body with the record and its page', () => {
    const answer = myRecordAnswer({ ok: true, record: RECORD, nextCursor: 'cur_01J9Z7' }, META);
    expect(answer.status).toBe(200);
    if ('error' in answer.body) throw new Error('expected a success');
    expect(answer.body.data['member']).toEqual(RECORD.member);
    expect(answer.body.data['dataRequests']).toEqual([
      {
        id: 'drq_01',
        type: 'export',
        status: 'completed',
        requestedAt: '2026-11-20T09:00:00Z',
        fileReference: 'exports/mbr_01/2026-11-20.zip',
        legalHoldNote: null,
        legalHoldReviewAt: null,
      },
    ]);
    expect(answer.body.meta).toEqual({ ...META, degraded: false });
    expect(answer.body.page).toEqual({ nextCursor: 'cur_01J9Z7', hasMore: true });
  });

  it('answers the last page without a cursor', () => {
    const answer = myRecordAnswer({ ok: true, record: RECORD, nextCursor: null }, META);
    if ('error' in answer.body) throw new Error('expected a success');
    expect(answer.body.page).toEqual({ nextCursor: null, hasMore: false });
  });

  it('carries a legal-hold note and review date on a deferred request', () => {
    const base = RECORD.dataRequests[0]!;
    const record: MyRecord = {
      ...RECORD,
      dataRequests: [
        {
          id: base.id,
          type: base.type,
          requestedAt: base.requestedAt,
          status: 'deferred_for_legal_hold',
          legalHoldNote: 'A submission is under legal review.',
          legalHoldReviewAt: '2026-12-01T00:00:00Z',
        },
      ],
    };
    const answer = myRecordAnswer({ ok: true, record, nextCursor: null }, META);
    if ('error' in answer.body) throw new Error('expected a success');
    expect(answer.body.data['dataRequests']).toMatchObject([
      {
        fileReference: null,
        legalHoldNote: 'A submission is under legal review.',
        legalHoldReviewAt: '2026-12-01T00:00:00Z',
      },
    ]);
  });

  it('answers each refusal with its C-001 status', () => {
    const unauthenticated = myRecordAnswer(
      identityFailure('UNAUTHENTICATED', 'MEMBER_SESSION_REQUIRED', 'Sign in first.'),
      META,
    );
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toMatchObject({
      error: { code: 'UNAUTHENTICATED', correlationId: META.correlationId },
    });

    const held = failureAnswer(
      identityFailure(
        'LEGAL_HOLD',
        'EXPORT_DEFERRED_FOR_LEGAL_HOLD',
        'Deferred.',
        {},
        {
          meta: { legalHoldReviewAt: '2026-12-01T00:00:00Z' },
        },
      ),
      META.correlationId,
    );
    expect(held.status).toBe(423);
    if ('error' in held.body) {
      expect(held.body.error.meta).toEqual({ legalHoldReviewAt: '2026-12-01T00:00:00Z' });
    }
  });

  it('answers a boundary validation failure with the field named', () => {
    const answer = validationAnswer(
      META.correlationId,
      'MY_RECORD_QUERY_INVALID',
      'The page size is not in the contract’s form.',
      { submissionLimit: 'OUT_OF_BAND' },
    );
    expect(answer).toMatchObject({
      status: 400,
      body: { error: { code: 'VALIDATION_FAILED', fields: { submissionLimit: 'OUT_OF_BAND' } } },
    });
  });

  it('never caches a member record', () => {
    const response = jsonAnswer(
      myRecordAnswer({ ok: true, record: RECORD, nextCursor: null }, META),
      META.correlationId,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Correlation-Id')).toBe(META.correlationId);
  });
});
