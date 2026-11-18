/**
 * The `C-091` probe handlers shared by `/healthz` and `/readyz`.
 *
 * Both handlers are data-free by construction: they parse no query, read no body, touch no cookie and
 * return one of three constant bodies. The contract deliberately keeps them outside the `C-001`
 * envelope, so no request identifier, timestamp, version, hostname or dependency name is echoed to the
 * caller even though the operational log carries a correlation identifier.
 *
 * `/healthz` consults nothing. A liveness probe that fails on a database outage restarts a healthy
 * process and turns a degraded dependency into an outage. `/readyz` asks the injected drain flag and
 * one datastore round trip, in that order, and reports only `ready` or `not_ready`.
 */
import type { DatastoreCheck } from './datastore';
import type { DrainController } from './lifecycle';
import type { Logger } from './logger';
import { forRequest } from './request';

/** The exact response bodies. These strings are the contract; do not format them. */
export const PROBE_BODIES = {
  alive: '{"status":"alive"}',
  ready: '{"status":"ready"}',
  notReady: '{"status":"not_ready"}',
} as const;

/** The headers every probe answer carries. */
const PROBE_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
} as const;

/** What the probe handlers need from the process. */
export interface ProbeRuntime {
  readonly drain: DrainController;
  readonly checkDatastore: DatastoreCheck;
  readonly logger: Logger;
}

/** A Next.js route handler for the two read paths. */
export type ProbeHandler = (request: Request) => Promise<Response>;

/**
 * Builds a constant probe response.
 *
 * `Cache-Control: no-store` is load-bearing: a cached readiness answer would keep routing traffic to
 * a process that has begun draining.
 */
function probeResponse(status: number, body: string): Response {
  return new Response(body, { status, headers: PROBE_HEADERS });
}

/**
 * The application-level refusal for any method other than `GET` (`C-091`).
 *
 * The body is empty because the contract defines no error envelope on a probe. `Allow: GET` is the
 * only guidance the caller gets, and `Cache-Control: no-store` keeps an intermediary from remembering
 * the refusal.
 */
export function refuseNonGetMethod(): Response {
  return new Response(null, {
    status: 405,
    headers: { ...PROBE_HEADERS, Allow: 'GET' },
  });
}

/**
 * Creates the `/healthz` handler.
 *
 * @param runtime - The logger; the drain flag and datastore are deliberately not consulted.
 */
export function createLivenessHandler(runtime: ProbeRuntime): ProbeHandler {
  return async (request) => {
    const { log } = forRequest(request, runtime.logger);
    log.info('probe.liveness', { status: 'alive' });
    return probeResponse(200, PROBE_BODIES.alive);
  };
}

/**
 * Creates the `/readyz` handler.
 *
 * A shutdown in progress answers `503` immediately, without the datastore round trip: the process
 * already knows it must stop receiving traffic.
 *
 * @param runtime - The drain flag, datastore check and logger.
 */
export function createReadinessHandler(runtime: ProbeRuntime): ProbeHandler {
  return async (request) => {
    const { log } = forRequest(request, runtime.logger);

    if (runtime.drain.isDraining()) {
      log.info('probe.readiness', { status: 'not_ready', outcome: 'draining' });
      return probeResponse(503, PROBE_BODIES.notReady);
    }

    let ready = false;
    try {
      ready = await runtime.checkDatastore();
    } catch {
      // The check itself is written not to reject; this is the second line of defence so a probe can
      // never become an unhandled rejection.
      ready = false;
    }

    if (!ready) {
      log.warn('probe.readiness', { status: 'not_ready', outcome: 'datastore_unavailable' });
      return probeResponse(503, PROBE_BODIES.notReady);
    }

    log.info('probe.readiness', { status: 'ready' });
    return probeResponse(200, PROBE_BODIES.ready);
  };
}
