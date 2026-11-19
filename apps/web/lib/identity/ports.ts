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
import type {
  AnalyticsLocale,
  IdentityAnalyticsEvent,
  IdentityAnalyticsPort,
  IdentityPorts,
} from '@odp/domain';
import { createPlatform, type Platform } from '@odp/platform';
import { createJsonLogger, type Logger } from '../logging';
import {
  createTelemetryBuffer,
  createTelemetryDispatcher,
  type TelemetryBuffer,
  type TelemetryReporter,
  type TelemetrySink,
} from '../telemetry';

/**
 * A port whose methods all refuse: the effect belongs to a task that has not landed.
 *
 * The proxy keeps the bundle type-complete without a wall of per-method stubs, and the error names
 * the missing wiring so the failure is attributable in one read.
 */
function notWiredYet<T>(effect: string): T {
  const refusal = (): never => {
    throw new Error(
      `${effect} is not wired in this deployment; the task that owns it composes it.`,
    );
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

/** A member's record identifier, whose opaque body is the analytics identity's body too (`C-001`). */
const MEMBER_ID_PATTERN = /^mbr_([0-9A-Z]{4,26})$/;

/**
 * The analytics identity of one member (`C-089`, `C-001`).
 *
 * `C-089` types `user_id` as a `usr_` identifier, while the record names the member with `mbr_`; the
 * identifier table gives the analytics user its own prefix and no mapping between the two is stored
 * anywhere. Both identifiers carry the same opaque ULID body, so the mapping here is the prefix and
 * nothing else: it is stable for the life of the member, it reveals no field the account does not
 * already hold, and a deletion request replaces it with a non-reversible token
 * (`analytics.replaceUserToken`). A value that is not a member identifier is passed through
 * unchanged, so the envelope refuses it as `PATTERN_MISMATCH` and reports it — the adapter never
 * invents an identity. Reported as a contract gap: the durable answer is an analytics user
 * identifier minted once at registration and stored, which is a schema and data change.
 */
function analyticsUserId(memberId: string): string {
  const match = MEMBER_ID_PATTERN.exec(memberId);
  return match === null ? memberId : `usr_${match[1]}`;
}

/** One of the two locales the catalogue ships, or `null` for anything else (`C-089`). */
function asLocale(value: unknown): AnalyticsLocale | null {
  return value === 'en-NG' || value === 'yo-NG' ? value : null;
}

/**
 * The locale one event is filed under.
 *
 * `C-089` puts a `locale` on every event, including the ones whose taxonomy declares no `locale`
 * property. The use case's own reading comes first, then the payload's `locale` property where the
 * taxonomy declares one, then the deployment's default.
 */
function envelopeLocale(event: IdentityAnalyticsEvent, fallback: AnalyticsLocale): AnalyticsLocale {
  const payload: Readonly<Record<string, unknown>> = event.properties;
  return asLocale(event.locale) ?? asLocale(payload['locale']) ?? fallback;
}

/**
 * Reports a dispatch the analytics path could not complete.
 *
 * `C-089` makes analytics a low-criticality path: nothing here fails the write that produced the
 * event, so every failure ends as one structured line. The line carries the event's lifecycle and
 * field paths only — never a property value, an identifier or a payload.
 */
const analyticsReporter: TelemetryReporter = {
  report(failure) {
    switch (failure.kind) {
      case 'REJECTED':
        logger.warn('analytics_event_rejected', {
          code: failure.code,
          cause: failure.cause,
          fields: failure.fields,
        });
        return;
      case 'QUEUE_FULL':
        logger.warn('analytics_buffer_full', { droppedEventId: failure.droppedEventId });
        return;
      case 'NOT_STORED':
        logger.warn('analytics_store_unavailable', { cause: failure.cause });
        return;
    }
  },
};

/**
 * The sink this deployable has for a validated envelope.
 *
 * `C-077`'s `analytics.emit` boundary is not provisioned in this deployment, so a validated event has
 * nowhere durable to land yet. The sink refuses, and the dispatcher buffers the event and reports it
 * — `C-089`'s own degradation rule, which keeps a lost event from failing the registration, the
 * consent or the data request behind it, and keeps a drop visible instead of silent. Pointing this
 * function at the boundary client is the whole wiring change.
 */
function createBoundarySink(): TelemetrySink {
  return {
    async emit(): Promise<{ readonly storedAt: string }> {
      throw new Error('ANALYTICS_STORE_UNAVAILABLE');
    },
  };
}

/** What one identity analytics adapter needs: the transport plus the envelope's own sources. */
export interface IdentityAnalyticsOptions {
  /** Where a validated envelope goes. */
  readonly sink: TelemetrySink;
  readonly clock: { now(): Date };
  readonly identifiers: { next(prefix: string): string };
  readonly appVersion?: string;
  /** The locale an event with no locale of its own is filed under. */
  readonly defaultLocale?: AnalyticsLocale;
  /** Shared across emissions, so a buffered event survives to the next one. */
  readonly buffer?: TelemetryBuffer;
  readonly reporter?: TelemetryReporter;
}

/**
 * The identity analytics adapter (`C-089`, `C-077`).
 *
 * The domain hands over the event name, its taxonomy-checked properties and the subject it belongs to;
 * this layer supplies what only the deployable knows — the clock, the event and session identifiers,
 * the release, the locale — and validates the envelope through the domain's own builder before
 * dispatch, so a payload the receiving side would reject never leaves. A refusal or an unreachable
 * store is reported, never thrown into the write, and nothing here logs a payload.
 */
export function createIdentityAnalytics(options: IdentityAnalyticsOptions): IdentityAnalyticsPort {
  const buffer = options.buffer ?? createTelemetryBuffer();
  const appVersion = options.appVersion ?? APP_VERSION;
  const defaultLocale = options.defaultLocale ?? 'en-NG';
  const reporter = options.reporter ?? analyticsReporter;

  return {
    async emit(event: IdentityAnalyticsEvent): Promise<void> {
      const dispatcher = createTelemetryDispatcher({
        context: {
          // `C-089` requires a `session_id` on every event, and the only session value the identity
          // bundle holds is the member cookie's token, which must never leave the transport. The
          // event therefore carries an opaque identifier minted for it: funnels join on `user_id` and
          // `anonymous_id`, which are stable, and no credential is copied into analytics.
          sessionId: options.identifiers.next('ses'),
          userId: event.subject.kind === 'member' ? analyticsUserId(event.subject.memberId) : null,
          anonymousId: event.subject.kind === 'anonymous' ? event.subject.anonymousId : null,
          locale: envelopeLocale(event, defaultLocale),
        },
        sink: options.sink,
        clock: options.clock,
        identifiers: options.identifiers,
        appVersion,
        buffer,
        reporter,
      });
      await dispatcher.emit(event.name, event.properties);
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
      credentials: notWiredYet(
        'the staff credential store (its seams arrive with the staff-auth task)',
      ),
      memberSessions: platform.sessions.memberSessions,
      staffSessions: platform.sessions.staffSessions,
      codes: platform.sessions.codes,
      rateLimits: platform.sessions.rateLimits,
      objectStore: platform.storage,
      audit: createAuditEventRepository(database.db),
      analytics: createIdentityAnalytics({
        sink: createBoundarySink(),
        clock: platform.clock,
        identifiers: platform.ids,
      }),
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
