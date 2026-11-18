/**
 * Per-request logging (`C-001`, `C-091`).
 *
 * A caller's `X-Correlation-Id` is honoured when it matches `C-001`, and a fresh one is minted when it
 * is absent or malformed. The value is attached to every line the request writes, which is the only
 * way an operator can follow one request through a log index without printing the request itself.
 *
 * The method and path are recorded; the query string, headers and body are not. A query string is a
 * place personal data can arrive, and a probe handler must not become a second copy of it.
 */
import { correlationIdFrom } from './correlation';
import type { Logger } from './logger';

/** The logger and identifier for one incoming request. */
export interface RequestLogger {
  readonly correlationId: string;
  readonly log: Logger;
}

/**
 * Attaches a correlation identifier to a logger for one request.
 *
 * @param request - The incoming request, used only for its correlation header and its path.
 * @param logger - The service logger.
 * @returns The identifier in use and a child logger that carries it on every line.
 */
export function forRequest(request: Request, logger: Logger): RequestLogger {
  const correlationId = correlationIdFrom(request.headers);
  let path = '/';
  try {
    path = new URL(request.url).pathname;
  } catch {
    // A malformed URL is still loggable; the method is the useful part and the path stays `/`.
  }
  return {
    correlationId,
    log: logger.child({ correlationId, method: request.method, path }),
  };
}
