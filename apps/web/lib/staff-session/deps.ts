/**
 * The staff console's composition root (`C-055` to `C-057`, `C-066`, `C-067`, `C-092`).
 *
 * The identity bundle already owns the pool, the platform and the staff session namespace. This
 * module adds the two pieces the sign-in flow needs and the two queues need, without opening a second
 * connection:
 *
 * - the credential adapters from the platform's own entry point (Argon2id hashing, the AES-GCM
 *   secret box and the TOTP/recovery-code codec), handed to the staff screens for the one sealed
 *   cookie each enrolment step needs; the credential repository itself is wired in the identity
 *   bundle;
 * - a short-lived idempotency store over the platform cache, so a replayed form post returns the
 *   recorded answer instead of opening a second session or moving a request twice.
 *
 * The queue pages themselves never receive a property bag they could widen: the ward ports and the
 * data-request ports are built for one request with the reviewer's analytics bridge.
 */
import {
  createDataRequestRepository,
  type DataRequestRepository,
  type DatabaseHandle,
  type Executor,
} from '@odp/db';
import {
  type IdempotencyPort,
  type IdentityPorts,
  type RecordedAnswer,
  type WardPorts,
} from '@odp/domain';
import { createCredentialAdapters, type CredentialAdapters, type Platform } from '@odp/platform';
import {
  buildWardPorts,
  buildWardReadPorts,
  createWardAnalytics,
} from '../../app/(entry)/join/ward/_lib/runtime';
import { getMemberDependencies } from '../identity/ports';
import { createAnalyticsDeletion } from './analytics-deletion';
import { createMemberExport } from './member-export';

/** The idempotency window `C-001` fixes for an `Idempotency-Key`. */
const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

/** The cache namespace, so a product key can never collide with a page or session key. */
const IDEMPOTENCY_PREFIX = 'odp:idm:';

/**
 * The `C-001` replay store over the platform cache.
 *
 * The durable PostgreSQL store is the long-term answer, but a staff form post is a session-scoped
 * action and the platform cache already carries the same 24-hour window the contract fixes. A store
 * that cannot answer is reported to the caller, which treats it as a first attempt; the domain's own
 * rules remain the guard on the write.
 */
export function createCacheIdempotency(cache: {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
}): IdempotencyPort {
  return {
    async read(key) {
      const value = await cache.get(`${IDEMPOTENCY_PREFIX}${key}`);
      if (value === null) return null;
      return JSON.parse(value) as RecordedAnswer;
    },
    async record(key, answer) {
      await cache.set(
        `${IDEMPOTENCY_PREFIX}${key}`,
        JSON.stringify(answer),
        IDEMPOTENCY_TTL_SECONDS,
      );
    },
  };
}

/** Everything a staff screen, action or route handler composes. */
export interface StaffAdminDependencies {
  readonly platform: Platform;
  readonly database: DatabaseHandle;
  /** The identity bundle with the member content and legal-hold ports wired. */
  readonly identity: IdentityPorts;
  readonly credentials: CredentialAdapters;
  /** The request store, exposed as the queue and resolution ports as well as the member port. */
  readonly dataRequests: DataRequestRepository;
}

let cached: Promise<StaffAdminDependencies> | null = null;

/** The process-wide bundle. */
export function getStaffAdminDependencies(): Promise<StaffAdminDependencies> {
  cached ??= (async () => {
    const member = await getMemberDependencies();
    const dataRequests = createDataRequestRepository(member.database.db);
    const credentials = createCredentialAdapters(member.platform.config.credentials);
    const ports: IdentityPorts = {
      ...member.ports,
      idempotency: createCacheIdempotency(member.platform.cache),
    };
    return {
      platform: member.platform,
      database: member.database,
      identity: ports,
      credentials,
      dataRequests,
    };
  })();
  return cached;
}

/** The read-only slice the queue pages need before they know which case is selected. */
export function readWardReviewPorts(database: DatabaseHandle) {
  return buildWardReadPorts(database);
}

/**
 * The ward ports for one reviewer action.
 *
 * The analytics bridge is the member-scoped one the ward use cases emit through; the reviewer's
 * action is attributed to the reviewed member's pseudonymous identifier, never to a name or a staff
 * username. The executor is the shared client, so an alias append or a residence review commits with
 * its audit row.
 */
export function wardPortsForRequest(input: {
  readonly platform: Platform;
  readonly executor: Executor;
  readonly memberId: string;
  readonly locale: 'en-NG' | 'yo-NG';
  readonly correlationId?: string;
}): WardPorts {
  const analytics = createWardAnalytics({
    platform: input.platform,
    executor: input.executor,
    memberId: input.memberId,
    locale: input.locale,
    ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
  });
  return buildWardPorts(input.executor, input.platform, analytics);
}

/** The export adapter `C-067` reaches for a completed export request. */
export function memberExportFor(dependencies: StaffAdminDependencies) {
  return createMemberExport({
    ports: dependencies.identity,
    objectStore: dependencies.platform.storage,
  });
}

/** The analytics deletion adapter `C-067` reaches for a completed deletion. */
export function analyticsDeletionFor(dependencies: StaffAdminDependencies) {
  return createAnalyticsDeletion(dependencies.database.db);
}
