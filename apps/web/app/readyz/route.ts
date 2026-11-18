/**
 * `GET /readyz` — the readiness probe (`C-091`, `NFR-010`).
 *
 * Answers `200 {"status":"ready"}` only when the process has not begun draining and one bounded,
 * non-recording round trip to the primary datastore succeeds. Otherwise it answers
 * `503 {"status":"not_ready"}`. The body is constant in both cases: it names no dependency, version or
 * hostname, because the probe is reachable from outside the hosting environment.
 *
 * During a graceful shutdown the drain flag turns the answer `503` before the listener closes, so the
 * proxy stops routing while the process can still finish its in-flight requests.
 *
 * The reverse proxy restricts this path to the uptime monitor's address; the application requires no
 * credential and performs no admission check. The rule the proxy must apply is
 * `apps/web/lib/logging/probe-access.ts`, and its refusal is exercised by that module's test.
 */
import {
  createReadinessHandler,
  installWebShutdownHandlers,
  refuseNonGetMethod,
  webProbeRuntime,
} from '../../lib/logging';

export const dynamic = 'force-dynamic';

installWebShutdownHandlers();

export const GET = createReadinessHandler(webProbeRuntime);

export const POST = refuseNonGetMethod;
export const PUT = refuseNonGetMethod;
export const PATCH = refuseNonGetMethod;
export const DELETE = refuseNonGetMethod;
export const HEAD = refuseNonGetMethod;
export const OPTIONS = refuseNonGetMethod;
