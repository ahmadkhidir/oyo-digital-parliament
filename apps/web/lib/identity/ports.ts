/**
 * The identity dependency bundle for the web deployable (`packages/domain/AGENTS.md`: adapters are
 * composed at the boundary; `packages/platform/AGENTS.md`: `src/index.ts` is the only production
 * entry point).
 *
 * Server actions and server components on the entry screens receive this bundle once per process
 * and hand it to the `@odp/domain` use cases. Everything here is composed from the two packages
 * that own the effects: `packages/db` owns the durable records and the outbound queue,
 * `packages/platform` owns sessions, one-time codes, the SMS transport, rate-limit counters, the
 * clock and the identifier factory. Nothing in this module opens a vendor client, reads an
 * environment variable or decides a rule.
 *
 * The bundle satisfies the whole `IdentityPorts` shape, but this slice's flows (`C-002` to
 * `C-004`) touch only the pending registrations, the members, the codes, the notification boundary,
 * the member sessions, the limiter, the audit log, the analytics emitter, the clock and the
 * identifier factory. The ports a later task wires — the sign-in challenges, the consents and
 * data-request reads, the member's authored content, the legal holds, the object store, the
 * idempotency store and the durable write queue — are present but refuse to answer, so a port that
 * is reached before its task lands fails loudly instead of pretending.
 */
import {
  createAnalyticsEventRepository,
  createAuditEventRepository,
  createConsentRepository,
  createDataRequestRepository,
  createDatabase,
  createMemberContentRepository,
  createMemberRepository,
  createOutboundNotificationRepository,
  createPendingRegistrationRepository,
  createStaffUserRepository,
  type DatabaseHandle,
} from '@odp/db';
import {
  analyticsUserIdFor,
  dispatchNotification,
  enqueueNotification,
  type AnalyticsLocale,
  type IdentityAnalyticsEvent,
  type IdentityAnalyticsPort,
  type IdentityPorts,
  type NotificationBodyPort,
  type NotificationPorts,
  type NotificationRecipientPort,
  type OutboundQueuePort,
  type SmsDeliveryPort,
} from '@odp/domain';
import { createPlatform, type Platform } from '@odp/platform';
import { createJsonLogger, type Logger } from '../logging';
import {
  createDurableAnalyticsSink,
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
          userId:
            event.subject.kind === 'member' ? analyticsUserIdFor(event.subject.memberId) : null,
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

/**
 * What the registration code's delivery needs (`C-002`, `C-076`).
 *
 * Every seam is passed in rather than opened here, so the same composition runs in production against
 * the durable queue and the configured gateway, and in a test against a double that records the send.
 */
export interface RegistrationNotificationOptions {
  /** The durable outbound queue (`packages/db`). */
  readonly queue: OutboundQueuePort;
  /** Turns a `prg_` reference into a destination and a locale at send time. */
  readonly recipients: NotificationRecipientPort;
  /** Renders the body at send time; the one-time code comes from the code store. */
  readonly bodies: NotificationBodyPort;
  readonly sms: SmsDeliveryPort;
  readonly clock: { now(): Date };
  readonly identifiers: { next(prefix: string): string };
  /** The code lifetime the store enforces, so the queued window and the message agree. */
  readonly codeTtlSeconds: number;
}

/**
 * Compose the notification boundary as registration hands it a code (`C-002`, `C-076`).
 *
 * The use case names the pending registration and the dedupe key and is told whether the gateway took
 * the message. This adapter does the two calls `C-076` defines — enqueue, then one dispatch — and maps
 * every answer that is not a delivery to `delayed`, because `C-002` answers 201 with a held
 * registration rather than failing the write. Nothing here logs: a notification body and a destination
 * are personal data, and the queue's own rows are the record (`NFR-024`).
 */
export function createRegistrationNotification(
  options: RegistrationNotificationOptions,
): IdentityPorts['notifications'] {
  const ports: NotificationPorts = {
    queue: options.queue,
    recipients: options.recipients,
    bodies: options.bodies,
    sms: options.sms,
    clock: options.clock,
    identifiers: options.identifiers,
  };
  const expiresInMinutes = Math.max(1, Math.round(options.codeTtlSeconds / 60));

  return {
    async deliverCode(input) {
      const caller = {
        component: 'identity',
        ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
      };

      const queued = await enqueueNotification(caller, ports, {
        channel: 'sms',
        template: 'registration_code',
        recipient: { kind: 'pending_registration', id: input.pendingRegistrationId },
        // `C-076`'s closed payload set for this template: the target and the window, never the digits.
        payload: {
          targetId: input.pendingRegistrationId,
          expiresInMinutes: String(expiresInMinutes),
        },
        dedupeKey: input.dedupeKey,
      });
      // An unreachable queue or a recipient that has gone leaves the message unsent; the pending
      // registration stands and `C-002` answers `delayed`.
      if (!queued.ok) return { status: 'delayed', channel: 'sms' };

      const dispatched = await dispatchNotification(caller, ports, {
        notificationId: queued.notification.notificationId,
      });
      // A hold leaves the message queued for its next attempt, which is the boundary's to schedule.
      const state = dispatched.ok ? dispatched.notification.state : 'queued';
      return { status: state === 'sent' ? 'sent' : 'delayed', channel: 'sms' };
    },
  };
}

/**
 * The member's own-record bundle for the My Record screen (`C-032` to `C-036`).
 *
 * This is the identity composition with the two ports the member surface reaches wired to their
 * persistence implementations: the member-content port over `Submission`, `Decision`, `Backing`,
 * `Comment` and `LegalReview` (`packages/db`), and the legal-hold port, which is the data-request
 * repository's own open-hold read. Nothing here opens a query: the route composes the bundle once
 * per process and hands it to the domain use cases (`screens/13-my-record.md`).
 *
 * The write queue remains unwired: the durable queue is a separate task, and a store failure on
 * `C-035` answers as a degraded write until it lands rather than pretending to accept one.
 */
let memberBundle: Promise<IdentityDependencies> | null = null;

export function getMemberDependencies(): Promise<IdentityDependencies> {
  memberBundle ??= (async () => {
    const identity = await getIdentityDependencies();
    const dataRequests = createDataRequestRepository(identity.database.db);
    const ports: IdentityPorts = {
      ...identity.ports,
      dataRequests,
      // One repository serves both entries: the open legal hold on a member is the request
      // store's own read (`C-035`, `C-036`).
      legalHolds: dataRequests,
      memberContent: createMemberContentRepository(identity.database.db),
    };
    return { ...identity, ports };
  })();
  return memberBundle;
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
    const pendingRegistrations = createPendingRegistrationRepository(database.db);
    const members = createMemberRepository(database.db);
    const ports: IdentityPorts = {
      pendingRegistrations,
      members,
      consents: createConsentRepository(database.db),
      dataRequests: createDataRequestRepository(database.db),
      staffUsers: createStaffUserRepository(database.db),
      credentials: notWiredYet(
        'the staff credential store (its seams arrive with the staff-auth task)',
      ),
      memberSessions: platform.sessions.memberSessions,
      staffSessions: platform.sessions.staffSessions,
      codes: platform.sessions.codes,
      // `C-002`, `C-076`: registration hands the one-time code to the notification boundary, which
      // owns the queue, the hold and the retry. The destination is resolved from the pending record at
      // the moment of the send and dropped (`NFR-024`); the body is the code store's.
      notifications: createRegistrationNotification({
        queue: createOutboundNotificationRepository(database.db),
        recipients: {
          async resolve(reference) {
            if (reference.kind === 'pending_registration') {
              const pending = await pendingRegistrations.findById(reference.id);
              // A verified or discarded registration has no code left to receive (`C-003`, `FEAT-012`).
              if (pending === null || pending.verifiedAt !== undefined) return null;
              return { locale: pending.locale, smsDestination: pending.telephoneNumber };
            }
            const member = await members.get(reference.id);
            if (member === null || member.deletedAt !== undefined) return null;
            return { locale: member.locale, smsDestination: member.telephoneNumber };
          },
        },
        bodies: {
          async render({ record, recipient }) {
            // Only this template's copy belongs to this deployment so far: the decision notice, the
            // appeal outcome and the session reminder are sent by features that have not landed, and
            // the boundary records an unrenderable template as a failed message rather than an empty
            // send.
            if (record.template !== 'registration_code') return null;
            const targetId = record.payload['targetId'];
            if (targetId === undefined) return null;
            return platform.sessions.codes.renderOutstanding({
              targetId,
              locale: recipient.locale,
            });
          },
        },
        sms: platform.sms,
        clock: platform.clock,
        identifiers: platform.ids,
        codeTtlSeconds: platform.config.session.codeTtlSeconds,
      }),
      rateLimits: platform.sessions.rateLimits,
      objectStore: platform.storage,
      audit: createAuditEventRepository(database.db),
      analytics: createIdentityAnalytics({
        // The durable sink `C-077` names: one row per validated `C-089` envelope in the platform's
        // own record store, so an event is stored rather than buffered against a boundary that is
        // not provisioned (`P1-01b`).
        sink: createDurableAnalyticsSink(createAnalyticsEventRepository(database.db)),
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
