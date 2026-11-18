/**
 * `GET /healthz` — the liveness probe (`C-091`, `NFR-010`).
 *
 * Answers `200 {"status":"alive"}` whenever this process can answer at all. It consults no dependency,
 * writes no state and emits no analytics or audit event: a liveness check is not a state change.
 *
 * The reverse proxy restricts this path to the uptime monitor's address; the application requires no
 * credential and performs no admission check. The rule the proxy must apply is
 * `apps/web/lib/logging/probe-access.ts`, and its refusal is exercised by that module's test.
 *
 * Any method other than `GET` is refused with `405` and `Allow: GET`, without the `C-001` envelope.
 */
import {
  createLivenessHandler,
  installWebShutdownHandlers,
  refuseNonGetMethod,
  webProbeRuntime,
} from '../../lib/logging';

// A cached probe is not a probe: Next must evaluate this handler on every request.
export const dynamic = 'force-dynamic';

installWebShutdownHandlers();

export const GET = createLivenessHandler(webProbeRuntime);

export const POST = refuseNonGetMethod;
export const PUT = refuseNonGetMethod;
export const PATCH = refuseNonGetMethod;
export const DELETE = refuseNonGetMethod;
export const HEAD = refuseNonGetMethod;
export const OPTIONS = refuseNonGetMethod;
