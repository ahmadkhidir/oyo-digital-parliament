/**
 * The member's own record (`C-032`, `FEAT-012`, `NFR-040`, `screens/13-my-record.md`).
 *
 * This is the one read in the system that returns `fullName`, `telephoneNumber` and `declaredAge`, and
 * it returns them only for the session's own member. Every such read appends `member_data.read` before
 * it answers; if the log cannot take the entry the read is refused rather than served unlogged
 * (`C-070`, `NFR-028`).
 */
import {
  identityFailure,
  type Consent,
  type ConsentPurpose,
  type DataRequest,
  type DataRequestStatus,
  type DataRequestType,
  type IdentityCaller,
  type IdentityFailure,
  type Locale,
  type MemberRecord,
} from '../entities.ts';
import { readRecordPageLimit, toIsoSeconds, type Reading } from '../policies.ts';
import type { HeldBackingRow, HeldItemRow, IdentityPorts, MemberSubmissionRow } from '../ports.ts';
import { appendIdentityAudit } from './support.ts';

/** The `C-032` request. */
export interface ReadMyRecordInput {
  readonly submissionCursor?: string;
  readonly submissionLimit?: number;
}

/** The member's own consents, as the record shows them. */
export interface MyRecordConsent {
  readonly id: string;
  readonly purpose: ConsentPurpose;
  readonly granted: boolean;
  readonly recordedAt: string;
  readonly withdrawnAt: string | null;
}

/** One of the member's submissions with its published outcome. */
export interface MyRecordSubmission {
  readonly reference: string;
  readonly status: string;
  readonly decision: {
    readonly type: 'commit' | 'decline' | 'refer';
    readonly authority: string | null;
  } | null;
}

/** One backing the member holds. */
export interface MyRecordBacking {
  readonly submissionReference: string;
  readonly submissionStatus: string;
  readonly backingState: 'active' | 'withdrawn' | 'voided';
}

/** One data request the member has made. */
export interface MyRecordDataRequest {
  readonly id: string;
  readonly type: DataRequestType;
  readonly status: DataRequestStatus;
  readonly requestedAt: string;
  readonly fileReference?: string;
  /** The hold reason, `null` unless the request is deferred for a legal hold (`C-032`). */
  readonly legalHoldNote: string | null;
  /** The date the hold is next reviewed, `null` unless the request is deferred (`C-032`). */
  readonly legalHoldReviewAt: string | null;
}

/** One of the member's items currently withheld from publication. */
export interface MyRecordHeldItem {
  readonly reference: string;
  readonly reason: string;
}

/** Everything the platform holds about one member, in the `C-032` shape. */
export interface MyRecord {
  readonly member: {
    readonly id: string;
    readonly fullName: string;
    readonly telephoneNumber: string;
    readonly displayName: string;
    readonly declaredAge: number;
    readonly identityState: MemberRecord['identityState'];
    readonly wardStatus: MemberRecord['wardStatus'];
    readonly wardId?: string;
    readonly locale: Locale;
    readonly createdAt: string;
  };
  readonly consents: readonly MyRecordConsent[];
  readonly submissions: readonly MyRecordSubmission[];
  readonly heldBackings: readonly MyRecordBacking[];
  readonly dataRequests: readonly MyRecordDataRequest[];
  readonly heldItems: readonly MyRecordHeldItem[];
}

/** The `C-032` answer, or the refusal that stopped it. */
export type ReadMyRecordResult =
  | {
      readonly ok: true;
      readonly record: MyRecord;
      readonly nextCursor: string | null;
    }
  | IdentityFailure;

/**
 * Reads the caller's own record.
 *
 * @param caller - The member whose record this is; no staff role has a view of it.
 * @param deps - The member, consent, content, data-request, audit and clock ports.
 * @param input - The submission page cursor and size.
 */
export async function readMyRecord(
  caller: IdentityCaller,
  deps: IdentityPorts,
  input: ReadMyRecordInput = {},
): Promise<ReadMyRecordResult> {
  if (caller.kind === 'public') {
    return identityFailure(
      'UNAUTHENTICATED',
      'MEMBER_SESSION_REQUIRED',
      'Sign in to see your record.',
      {},
      { meta: { recoveryPath: '/sign-in' } },
    );
  }
  if (caller.kind === 'staff') {
    return identityFailure(
      'FORBIDDEN_ROLE',
      'MEMBER_SESSION_REQUIRED',
      'There is no staff view of a member’s personal record.',
    );
  }

  const limit: Reading<number> = readRecordPageLimit(input.submissionLimit);
  if (!limit.ok) {
    return identityFailure(
      'VALIDATION_FAILED',
      'MY_RECORD_QUERY_INVALID',
      'Choose a page size between 1 and 50.',
      { submissionLimit: limit.reason },
    );
  }

  let member: MemberRecord | null;
  try {
    member = await deps.members.get(caller.memberId);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your record could not be read. Try again in a moment.',
    );
  }
  if (member === null || member.deletedAt !== undefined) {
    return identityFailure('NOT_FOUND', 'MEMBER_NOT_FOUND', 'That account is no longer available.');
  }

  let consentRows: readonly Consent[];
  let submissionPage: {
    readonly rows: readonly MemberSubmissionRow[];
    readonly nextCursor: string | null;
  };
  let heldBackings: readonly HeldBackingRow[];
  let dataRequests: readonly DataRequest[];
  let heldItems: readonly HeldItemRow[];
  try {
    consentRows = await deps.consents.listForMember(member.id);
    submissionPage = await deps.memberContent.listSubmissions(member.id, {
      ...(input.submissionCursor === undefined ? {} : { cursor: input.submissionCursor }),
      limit: limit.value,
    });
    heldBackings = await deps.memberContent.listHeldBackings(member.id);
    dataRequests = await deps.dataRequests.listForMember(member.id);
    heldItems = await deps.memberContent.listHeldItems(member.id);
  } catch {
    return identityFailure(
      'SERVICE_DEGRADED',
      'IDENTITY_STORE_UNAVAILABLE',
      'Your record could not be read. Try again in a moment.',
    );
  }

  // One audit record before the personal data leaves the module (`C-070`).
  const refused = await appendIdentityAudit(deps, {
    actorId: member.id,
    actorRole: 'member',
    action: 'member_data.read',
    entityType: 'Member',
    entityId: member.id,
    reason: 'SELF_SERVICE',
    occurredAt: toIsoSeconds(deps.clock.now()),
    ...(caller.correlationId === undefined ? {} : { correlationId: caller.correlationId }),
  });
  if (refused !== null) return refused;

  return {
    ok: true,
    record: {
      member: {
        id: member.id,
        fullName: member.fullName,
        telephoneNumber: member.telephoneNumber,
        displayName: member.displayName,
        declaredAge: member.declaredAge,
        identityState: member.identityState,
        wardStatus: member.wardStatus,
        ...(member.wardId === undefined ? {} : { wardId: member.wardId }),
        locale: member.locale,
        createdAt: member.createdAt,
      },
      consents: consentRows.map((consent) => ({
        id: consent.id,
        purpose: consent.purpose,
        granted: consent.granted,
        recordedAt: consent.recordedAt,
        withdrawnAt: consent.withdrawnAt ?? null,
      })),
      submissions: submissionPage.rows.map((row) => ({
        reference: row.reference,
        status: row.status,
        decision: row.decision,
      })),
      heldBackings: heldBackings.map((row) => ({
        submissionReference: row.submissionReference,
        submissionStatus: row.submissionStatus,
        backingState: row.backingState,
      })),
      dataRequests: dataRequests.map((request) => ({
        id: request.id,
        type: request.type,
        status: request.status,
        requestedAt: request.requestedAt,
        ...(request.fileReference === undefined ? {} : { fileReference: request.fileReference }),
        // `C-032`: both fields are `null` unless the request is deferred; the review date is the
        // recorded one, never a sentence the record would have to be searched for.
        legalHoldNote: request.legalHoldNote ?? null,
        legalHoldReviewAt: request.legalHoldReviewAt ?? null,
      })),
      heldItems: heldItems.map((item) => ({
        reference: item.reference,
        reason: item.reason,
      })),
    },
    nextCursor: submissionPage.nextCursor,
  };
}
