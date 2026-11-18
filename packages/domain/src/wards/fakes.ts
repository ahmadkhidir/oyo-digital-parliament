/**
 * In-memory ports for the ward tests. Test-only: nothing here is exported from the module barrel.
 *
 * The fakes keep the same rules the adapters must keep - a conditional resolution, a submission that
 * keeps its text, an alias that does not duplicate on case - so a use-case test exercises the rule it
 * names without a database. `packages/db` proves the SQL side separately.
 */
import type { AuditEventRecord } from '../audit/entities.ts';
import type { WardAnalyticsEvent, WardPorts } from './ports.ts';
import type {
  IdentityState,
  QueuedWardDescriptionReview,
  ResidenceReview,
  Ward,
  WardDescriptionReview,
  WardStatus,
} from './entities.ts';

/** The fixed instant every fake answers with (`C-001` form). */
export const FAKE_NOW = '2026-11-18T09:00:00Z';

/** One submission row as the ward fakes hold it. */
export interface FakeSubmission {
  readonly id: string;
  readonly reference: string;
  readonly authorId: string;
  readonly wardStatus: WardStatus;
  readonly locationScope: 'in_state' | 'out_of_state';
  readonly status: 'awaiting_decision' | 'decided' | 'withdrawn' | 'withheld' | 'out_of_area';
  /** The words the resolution must leave alone. */
  readonly body: string;
}

/** One member row as the ward fakes hold it. */
export interface FakeMember {
  readonly id: string;
  wardId?: string;
  wardStatus: WardStatus;
  identityState: IdentityState;
  deletedAt?: string;
}

/** What a test passes in. */
export interface WardHarnessOptions {
  readonly wards?: readonly Ward[];
  readonly members?: readonly FakeMember[];
  readonly reviews?: readonly WardDescriptionReview[];
  readonly submissions?: readonly FakeSubmission[];
  readonly backings?: number;
  /** Makes every ward-reference read throw, for the unavailable-list path (`C-009`, `C-010`). */
  readonly referenceUnavailable?: boolean;
  /** Makes the audit append throw, for the failed-append rule (`C-090`, `NFR-028`). */
  readonly auditUnavailable?: boolean;
  /** Makes the analytics emit throw, which must not fail the write (`C-089`). */
  readonly analyticsUnavailable?: boolean;
}

/** The live state a test may inspect after a use case runs. */
export interface WardHarness {
  readonly ports: WardPorts;
  readonly audit: AuditEventRecord[];
  readonly analytics: WardAnalyticsEvent[];
  readonly wards: Ward[];
  readonly members: FakeMember[];
  readonly reviews: WardDescriptionReview[];
  readonly submissions: FakeSubmission[];
  readonly residenceReviews: ResidenceReview[];
  readonly aliasAppends: { readonly wardId: string; readonly alias: string }[];
}

/** A ward with every schema field, for tests that only vary one. */
export function fakeWard(overrides: Partial<Ward> & Pick<Ward, 'id' | 'name'>): Ward {
  return {
    localGovernmentArea: 'Ibadan North',
    aliases: [],
    source: 'seeded',
    createdAt: FAKE_NOW,
    ...overrides,
  };
}

/** Builds the port bundle and the state a test can assert against. */
export function createWardHarness(options: WardHarnessOptions = {}): WardHarness {
  const wards: Ward[] = options.wards?.map((ward) => ({ ...ward, aliases: [...ward.aliases] })) ?? [];
  const members: FakeMember[] = options.members?.map((member) => ({ ...member })) ?? [];
  const reviews: WardDescriptionReview[] = options.reviews?.map((review) => ({ ...review })) ?? [];
  const submissions: FakeSubmission[] = options.submissions?.map((row) => ({ ...row })) ?? [];
  const residenceReviews: ResidenceReview[] = [];
  const audit: AuditEventRecord[] = [];
  const analytics: WardAnalyticsEvent[] = [];
  const aliasAppends: { wardId: string; alias: string }[] = [];
  let identifierCounter = 0;
  let sequence = 0;

  const referenceGuard = (): void => {
    if (options.referenceUnavailable === true) {
      throw new Error('the ward reference is unavailable');
    }
  };

  const listReference = (): Ward[] => [...wards].sort(compareWards);

  const ports: WardPorts = {
    wards: {
      async list(query) {
        referenceGuard();
        const filtered =
          query.localGovernmentArea === undefined
            ? listReference()
            : listReference().filter(
                (ward) => ward.localGovernmentArea === query.localGovernmentArea,
              );
        const offset = parseCursor(query.cursor);
        const page = filtered.slice(offset, offset + query.limit);
        const nextOffset = offset + page.length;
        return {
          wards: page,
          nextCursor: nextOffset < filtered.length ? formatCursor(nextOffset) : null,
        };
      },
      async getById(wardId) {
        referenceGuard();
        return wards.find((ward) => ward.id === wardId) ?? null;
      },
      async listForMatching() {
        referenceGuard();
        return listReference();
      },
      async listByLocalGovernmentAreas(areas) {
        referenceGuard();
        const wanted = new Set(areas);
        return listReference().filter((ward) => wanted.has(ward.localGovernmentArea));
      },
      async appendAlias(input) {
        aliasAppends.push({ wardId: input.wardId, alias: input.alias });
        const index = wards.findIndex((ward) => ward.id === input.wardId);
        const ward = wards[index];
        if (ward === undefined) throw new Error('no such ward');
        const exists = ward.aliases.some(
          (alias) => alias.toLowerCase() === input.alias.toLowerCase(),
        );
        if (!exists) {
          wards[index] = { ...ward, aliases: [...ward.aliases, input.alias] };
        }
      },
    },

    wardDescriptionReviews: {
      async create(review) {
        reviews.push({ ...review });
      },
      async findById(reviewId) {
        return reviews.find((review) => review.id === reviewId) ?? null;
      },
      async listQueuedByMember(memberId) {
        return reviews.filter(
          (review) => review.memberId === memberId && review.status === 'queued',
        );
      },
      async listQueue(query) {
        const filtered = reviews
          .filter((review) => review.status === query.status)
          .filter(
            (review) =>
              query.localGovernmentArea === undefined ||
              review.localGovernmentArea === query.localGovernmentArea,
          )
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
        const offset = parseCursor(query.cursor);
        const page = filtered.slice(offset, offset + query.limit);
        const rows: QueuedWardDescriptionReview[] = page.map((review) => {
          const member = members.find((candidate) => candidate.id === review.memberId) ?? null;
          return {
            review,
            member:
              member === null
                ? null
                : {
                    id: member.id,
                    identityState: member.identityState,
                    wardStatus: member.wardStatus,
                    deleted: member.deletedAt !== undefined,
                  },
            submissionReferences: submissions
              .filter((row) => row.authorId === review.memberId && row.wardStatus === 'unresolved')
              .map((row) => row.reference),
          };
        });
        const nextOffset = offset + page.length;
        return {
          reviews: rows,
          nextCursor: nextOffset < filtered.length ? formatCursor(nextOffset) : null,
        };
      },
      async countQueued() {
        return reviews.filter((review) => review.status === 'queued').length;
      },
      async markResolved(input) {
        const index = reviews.findIndex(
          (review) => review.id === input.reviewId && review.status === 'queued',
        );
        const review = reviews[index];
        if (review === undefined) return false;
        reviews[index] = {
          ...review,
          status: 'resolved',
          resolvedWardId: input.wardId,
          reviewerId: input.reviewerId,
          resolvedAt: input.resolvedAt,
        };
        return true;
      },
      async markRejected(input) {
        const index = reviews.findIndex(
          (review) => review.id === input.reviewId && review.status === 'queued',
        );
        const review = reviews[index];
        if (review === undefined) return false;
        reviews[index] = {
          ...review,
          status: 'rejected',
          rejectionReason: input.rejectionReason,
          reviewerId: input.reviewerId,
          resolvedAt: input.resolvedAt,
        };
        return true;
      },
    },

    members: {
      async get(memberId) {
        return members.find((member) => member.id === memberId) ?? null;
      },
      async recordWard(memberId, wardId) {
        const index = members.findIndex((member) => member.id === memberId);
        const member = members[index];
        if (member === undefined) throw new Error('no such member');
        members[index] = { ...member, wardId, wardStatus: 'resolved' };
      },
      async setIdentityState(memberId, state) {
        const index = members.findIndex((member) => member.id === memberId);
        const member = members[index];
        if (member === undefined) throw new Error('no such member');
        members[index] = { ...member, identityState: state };
      },
    },

    submissions: {
      async listUnresolvedByAuthor(memberId) {
        return submissions
          .filter((row) => row.authorId === memberId && row.wardStatus === 'unresolved')
          .map((row) => ({
            id: row.id,
            reference: row.reference,
            wardStatus: row.wardStatus,
            locationScope: row.locationScope,
            status: row.status,
          }));
      },
      async countWithWardByAuthor(memberId) {
        return submissions.filter(
          (row) => row.authorId === memberId && row.wardStatus === 'resolved',
        ).length;
      },
      async assignWard(submissionIds, wardId) {
        const wanted = new Set(submissionIds);
        const moved: string[] = [];
        for (let index = 0; index < submissions.length; index += 1) {
          const row = submissions[index];
          if (row === undefined || !wanted.has(row.id)) continue;
          if (row.wardStatus !== 'unresolved') continue;
          if (row.locationScope !== 'in_state') continue;
          if (row.status === 'out_of_area') continue;
          submissions[index] = { ...row, wardStatus: 'resolved' };
          moved.push(row.reference);
        }
        void wardId;
        return moved;
      },
    },

    backings: {
      async countByMember() {
        return options.backings ?? 0;
      },
    },

    residenceReviews: {
      async record(review) {
        residenceReviews.push({ ...review });
      },
    },

    audit: {
      async append(event, correlation) {
        void correlation;
        if (options.auditUnavailable === true) throw new Error('the audit log is unavailable');
        sequence += 1;
        audit.push({ ...event });
        return { sequence };
      },
    },

    analytics: {
      async emit(event) {
        if (options.analyticsUnavailable === true) throw new Error('the analytics store is down');
        analytics.push(event);
      },
    },

    clock: {
      now: () => new Date(Date.parse(FAKE_NOW)),
    },

    identifiers: {
      next: (prefix) => {
        identifierCounter += 1;
        return `${prefix}_${identifierCounter.toString(36).toUpperCase().padStart(4, '0')}`;
      },
    },
  };

  return {
    ports,
    audit,
    analytics,
    wards,
    members,
    reviews,
    submissions,
    residenceReviews,
    aliasAppends,
  };
}

function compareWards(left: Ward, right: Ward): number {
  const byArea = left.localGovernmentArea.localeCompare(right.localGovernmentArea);
  if (byArea !== 0) return byArea;
  const byName = left.name.localeCompare(right.name);
  return byName !== 0 ? byName : left.id.localeCompare(right.id);
}

function formatCursor(offset: number): string {
  return `cur_${String(offset).padStart(4, '0')}`;
}

function parseCursor(cursor: string | undefined): number {
  if (cursor === undefined) return 0;
  const parsed = Number.parseInt(cursor.replace(/^cur_/, ''), 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}
