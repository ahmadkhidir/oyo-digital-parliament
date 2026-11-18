/**
 * The identity dependency bundle for the web deployable (`packages/domain/AGENTS.md`: adapters are
 * composed at the boundary; `packages/platform/AGENTS.md`: `src/index.ts` is the only production
 * entry point).
 *
 * Server actions and server components on the entry screens receive this bundle once per process
 * and hand it to the `@odp/domain` use cases. Everything here is composed from the two packages
 * that own the effects: `packages/db` owns the durable records, `packages/platform` owns sessions,
 * one-time codes, rate-limit counters, the clock and the identifier factory. Nothing in this
 * module opens a vendor client, reads an environment variable or decides a rule.
 *
 * The bundle satisfies the whole `IdentityPorts` shape, but this slice's flows (`C-002` to
 * `C-004`) touch only the pending registrations, the members, the codes, the member sessions, the
 * limiter, the audit log, the analytics emitter, the clock and the identifier factory. The ports a
 * later task wires — the sign-in challenges, the consents and data-request reads, the member's
 * authored content, the legal holds, the object store, the idempotency store and the durable
 * write queue — are present but refuse to answer, so a port that is reached before its task lands
 * fails loudly instead of pretending.
 */
import {
  createAuditEventRepository,
  createConsentRepository,
  createDataRequestRepository,
  createDatabase,
  createMemberRepository,
  createPendingRegistrationRepository,
  createStaffUserRepository,
  type DatabaseHandle,
} from '@odp/db';
import type { IdentityAnalyticsEvent, IdentityAnalyticsPort, IdentityPorts } from '@odp/domain';
import { buildAnalyticsEvent } from '@odp/domain';
import { createPlatform, type Platform } from '@odp/platform';
import { createJsonLogger, type Logger } from '../logging';

/**
 * A port whose methods all refuse: the effect belongs to a task that has not landed.
 *
 * The proxy keeps the bundle type-complete without a wall of per-method stubs, and the error names
 * the missing wiring so the failure is attributable in one read.
 */
function notWiredYet<T>(effect: string): T {
  const refusal = (): never => {
    throw new Error(`${effect} is not wired in this deployment; the task that owns it composes it.`);
  };
  return new Proxy({}, { get: refusal }) as T;
}

/** Where this module reports its own failures. No payload, no identifier beyond a fixed kind. */
const logger: Logger = createJsonLogger({ service: 'web' });

/**
 * The release string `C-089` carries on every event. The format is `year.month.patch`
 * (`APP_VERSION_PATTERN`); the deployable has no build-time version stamp yet, so this is pinned
 * per release train and reported as an assumption in the task that first ships analytics.
 */
const APP_VERSION = '2026.11.0';

/**
 * The identity analytics adapter (`C-089`, `C-077`).
 *
 * It builds and validates the envelope through the domain's own builder — that is where the
 * taxonomy's property checks and the no-personal-data refusal live — and then reports what it
 * could not send. The analytics store behind the `C-077` boundary is not in this deployment yet,
 * so a validated envelope is refused here rather than written where the record cannot read it
 * back; `C-089` makes a lost event the emitter's to report, never a reason to fail the write that
 * produced it.
 *
 * A refusal logged here carries the event name and the field paths only, never a property value.
 */
function createIdentityAnalytics(platform: Platform): IdentityAnalyticsPort {
  return {
    async emit(event: IdentityAnalyticsEvent): Promise<void> {
      const built = buildAnalyticsEvent({
        name: event.name,
        properties: event.properties,
        eventId: platform.ids.next('evt'),
        occurredAt: platform.clock.now().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        // `C-089` requires exactly one of `user_id` and `anonymous_id`, and the identity use cases
        // emit without actor context. Until the port carries the subject, no transport can
        // envelope these events; the refusal is logged and the write stands. Reported to the
        // coordinator as a contract gap rather than worked around with a fabricated identifier.
        sessionId: platform.ids.next('ses'),
        userId: null,
        anonymousId: null,
        appVersion: APP_VERSION,
        locale: 'en-NG',
      });
      if (!built.ok) {
        logger.warn('analytics_event_refused', {
          eventName: event.name,
          cause: built.cause,
          fields: built.fields,
        });
        throw new Error('ANALYTICS_EVENT_REFUSED');
      }
      logger.warn('analytics_store_unavailable', { eventName: event.name });
      throw new Error('ANALYTICS_STORE_UNAVAILABLE');
    },
  };
}

/** Everything the entry screens' actions need to run one identity use case. */
export interface IdentityDependencies {
  /** The configured platform: clock, identifiers, sessions, codes, limiter. */
  readonly platform: Platform;
  /** The port bundle the `@odp/domain` identity use cases take. */
  readonly ports: IdentityPorts;
  /** The durable record store, for a caller that needs a transaction. */
  readonly database: DatabaseHandle;
}

let cached: Promise<IdentityDependencies> | null = null;

/**
 * The process-wide bundle.
 *
 * The platform opens one Redis connection and the database one pool per process; both are built
 * once here and reused for the life of the server. A construction failure throws, which is the
 * configured boot behaviour: a missing service is a failed request, never a silently degraded
 * provider.
 */
export function getIdentityDependencies(): Promise<IdentityDependencies> {
  cached ??= (async () => {
    const platform = createPlatform();
    const database = createDatabase({ applicationName: 'odp-web-identity' });
    const ports: IdentityPorts = {
      pendingRegistrations: createPendingRegistrationRepository(database.db),
      members: createMemberRepository(database.db),
      consents: createConsentRepository(database.db),
      dataRequests: createDataRequestRepository(database.db),
      staffUsers: createStaffUserRepository(database.db),
      credentials: notWiredYet('the staff credential store (its seams arrive with the staff-auth task)'),
      memberSessions: platform.sessions.memberSessions,
      staffSessions: platform.sessions.staffSessions,
      codes: platform.sessions.codes,
      rateLimits: platform.sessions.rateLimits,
      objectStore: platform.storage,
      audit: createAuditEventRepository(database.db),
      analytics: createIdentityAnalytics(platform),
      clock: platform.clock,
      identifiers: platform.ids,
      // The remaining ports are type-complete but unwired: this slice's contracts never reach
      // them. Each refusal names the effect, so an accidental reach is attributable immediately.
      signInChallenges: notWiredYet('the sign-in challenge store'),
      memberContent: notWiredYet('the member content port'),
      legalHolds: notWiredYet('the legal-hold port'),
      idempotency: notWiredYet('the durable idempotency store'),
      queuedWrites: notWiredYet('the durable write queue'),
    };
    return { platform, ports, database };
  })();
  return cached;
}
