/**
 * The Ward Confirmation screen's runtime seam (`C-009` to `C-011`, `FEAT-002`).
 *
 * Builds, once per process, what the page, the server action and the two route handlers need: the
 * identity bundle's platform (clock, identifiers, session capability, cache) and database handle,
 * the member-session reader, the ward port bundle and the analytics bridge.
 *
 * Everything that opens a connection lives in `apps/web/lib/identity/ports`; this module composes
 * the ward ports over the same database handle, so the deployable keeps one pool and one platform
 * bundle. The bundle is cached for the life of the server and is built lazily, so `next build` never
 * opens Redis or PostgreSQL while compiling the route tree.
 *
 * The member's free-text description never appears in a log line, a cache key, an analytics event or
 * a URL. It reaches the database as the review record's own value, and a refused attempt is echoed
 * server-side under an opaque token (`_lib/form-echo.ts`).
 */
import {
  createAnalyticsEventRepository,
  createAuditEventRepository,
  createWardDescriptionReviewRepository,
  createWardRepository,
  createWardResidenceReviewRepository,
  createWardResolutionRepository,
  type DatabaseHandle,
  type Executor,
} from '@odp/db';
import {
  analyticsUserIdFor,
  readSession,
  type IdentityPorts,
  type SessionMemberProjection,
  type WardAnalyticsEvent,
  type WardAnalyticsPort,
  type WardPorts,
} from '@odp/domain';
import type { Platform } from '@odp/platform';
import { getIdentityDependencies } from '../../../../../lib/identity/ports';
import { createJsonLogger, type Logger } from '../../../../../lib/logging';
import {
  createDurableAnalyticsSink,
  createTelemetryDispatcher,
  type TelemetryDispatcher,
  type TelemetryReporter,
} from '../../../../../lib/telemetry';

/** The release string `C-089` carries, pinned per release train (`apps/web/lib/identity/ports`). */
const APP_VERSION = '2026.11.0';

/** The two launch locales an event may be filed under (`C-001` Locale). */
export type WardLocale = 'en-NG' | 'yo-NG';

/** Where this module reports its own failures. No payload, no person. */
const logger: Logger = createJsonLogger({ service: 'web' });

/**
 * The analytics failure reporter (`C-089`).
 *
 * A refusal or an unreachable store is a low-criticality outcome: the write that produced the event
 * stands. The line carries the failure's lifecycle and cause only — never a property value, a
 * candidate name or the resident's words.
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

/** What the ward surface receives from the identity composition root. */
export interface WardDependencies {
  readonly platform: Platform;
  readonly identityPorts: IdentityPorts;
  readonly database: DatabaseHandle;
}

let cached: Promise<WardDependencies> | null = null;

/**
 * The process-wide dependency bundle.
 *
 * The platform and database handle are the identity bundle's own objects, so the ward screen never
 * opens a second Redis or PostgreSQL client. A construction failure throws, which is the configured
 * boot behaviour: a missing service is a failed request, never a silently degraded provider.
 */
export function getWardDependencies(): Promise<WardDependencies> {
  cached ??= (async () => {
    const identity = await getIdentityDependencies();
    return {
      platform: identity.platform,
      identityPorts: identity.ports,
      database: identity.database,
    };
  })();
  return cached;
}

/**
 * Resolves the signed-in member the screen acts for (`C-007`, `NFR-026`).
 *
 * The session decides the member identifier; the form never names one. A signed-out visitor, an
 * expired token, a staff session and an unreachable session store all answer `null` here, and the
 * caller sends the visitor to sign-in — the screen declares no signed-out state, because this route
 * is only reached from number confirmation or My Record.
 *
 * @param memberSessionToken - The opaque `odp_session` value the request presented, if any.
 */
export async function resolveMemberSession(
  memberSessionToken: string | undefined,
): Promise<SessionMemberProjection | null> {
  if (memberSessionToken === undefined || memberSessionToken === '') return null;
  const { identityPorts } = await getWardDependencies();
  const result = await readSession(identityPorts, { memberSessionToken });
  if (!result.ok || !result.signedIn || result.member === null) return null;
  return result.member;
}

/**
 * The ward ports bound to one executor (`packages/domain` `WardPorts`).
 *
 * Every repository is built over the executor the caller is already inside, so a confirmation's
 * member write, alias append, audit record and idempotency claim commit together (`C-011`,
 * `NFR-028`). The submissions, backings and residence-review ports ride on the same repositories
 * the reviewer's resolution action uses; this screen's use cases never touch them, but the bundle
 * satisfies the domain's whole port set rather than handing a use case a half-bound port.
 *
 * @param executor - The shared client or the open transaction to bind every store to.
 * @param platform - The platform bucket the clock and identifier factory come from.
 * @param analytics - The request's analytics bridge (`C-089`).
 */
export function buildWardPorts(
  executor: Executor,
  platform: Platform,
  analytics: WardAnalyticsPort,
): WardPorts {
  const resolution = createWardResolutionRepository(executor);
  return {
    wards: createWardRepository(executor),
    wardDescriptionReviews: createWardDescriptionReviewRepository(executor),
    members: resolution,
    submissions: resolution,
    backings: resolution,
    residenceReviews: createWardResidenceReviewRepository(executor),
    audit: createAuditEventRepository(executor),
    analytics,
    clock: platform.clock,
    identifiers: platform.ids,
  };
}

/**
 * The read-only slice of the ward ports the page needs, bound to the shared client.
 *
 * The page lists the reference and reads the member's own open review; it emits no event and writes
 * nothing, so it never receives a write-shaped port it could reach by accident.
 */
export function buildWardReadPorts(
  database: DatabaseHandle,
): Pick<WardPorts, 'wards' | 'wardDescriptionReviews'> {
  return {
    wards: createWardRepository(database.db),
    wardDescriptionReviews: createWardDescriptionReviewRepository(database.db),
  };
}

/** One request's analytics context: who acted, in which locale, under which correlation. */
export interface WardAnalyticsContext {
  readonly platform: Platform;
  readonly memberId: string;
  readonly locale: WardLocale;
  /** The request's correlation identifier; `C-089` requires one on failure and model events. */
  readonly correlationId?: string;
  /** The executor the sink writes through, so an event joins the transaction that produced it. */
  readonly executor: Executor;
}

/**
 * The analytics bridge for one request (`C-089`, `EVT-006` to `EVT-008`).
 *
 * The domain hands over the event name and its taxonomy-checked properties; this layer supplies what
 * only the deployable knows — the member's pseudonymous `usr_` identity, an event-scoped session
 * identifier, the locale, the release and the correlation. The envelope is built and validated by
 * the domain's own dispatcher, so a payload carrying a name, a telephone number, a ward description
 * or free text is refused before it can leave.
 *
 * The dispatcher never throws: a refusal or an unreachable store is reported and the write that
 * produced the event stands (`C-089`).
 */
export function createWardAnalytics(context: WardAnalyticsContext): WardAnalyticsPort {
  const dispatcher = createTelemetryDispatcher({
    context: {
      // `C-089` requires a session identifier on every event. The member cookie's token is a
      // credential and must never leave the transport, so the event carries an opaque identifier
      // minted for it; funnels join on the stable `user_id` instead.
      sessionId: context.platform.ids.next('ses'),
      userId: analyticsUserIdFor(context.memberId),
      anonymousId: null,
      locale: context.locale,
      ...(context.correlationId === undefined ? {} : { correlationId: context.correlationId }),
    },
    sink: createDurableAnalyticsSink(createAnalyticsEventRepository(context.executor)),
    clock: context.platform.clock,
    identifiers: context.platform.ids,
    appVersion: APP_VERSION,
    reporter: analyticsReporter,
  });

  return {
    async emit(event: WardAnalyticsEvent): Promise<void> {
      await emitWardEvent(dispatcher, event);
    },
  };
}

/**
 * Hands one ward event to the typed dispatcher.
 *
 * The switch exists because the dispatcher's `emit` ties each event name to its own property type; a
 * union-typed call would widen that pairing. Every name the ward module declares is listed, so a new
 * event is a type error here until it is given its taxonomy shape.
 */
async function emitWardEvent(
  dispatcher: TelemetryDispatcher,
  event: WardAnalyticsEvent,
): Promise<void> {
  switch (event.name) {
    case 'ward_candidate_suggested':
      await dispatcher.emit('ward_candidate_suggested', event.properties);
      return;
    case 'ward_confirmed':
      await dispatcher.emit('ward_confirmed', event.properties);
      return;
    case 'ward_sent_for_review':
      await dispatcher.emit('ward_sent_for_review', event.properties);
      return;
    case 'ward_review_resolved':
      await dispatcher.emit('ward_review_resolved', event.properties);
      return;
    case 'residence_review_completed':
      await dispatcher.emit('residence_review_completed', event.properties);
      return;
    case 'identity_state_changed':
      await dispatcher.emit('identity_state_changed', event.properties);
      return;
    default: {
      const unreachable: never = event;
      void unreachable;
    }
  }
}
