/**
 * The datastore readiness check for `C-091`.
 *
 * Readiness asks one question: can this process take work against the store it cannot serve without?
 * The answer here is a connection-level round trip to the PostgreSQL endpoint. Nothing is queried,
 * written, cached or logged; the socket is opened and closed, and a refused, timed-out or malformed
 * address answers `false`.
 *
 * The trip is bounded by a fixed timeout shorter than the uptime monitor's one-minute sampling
 * interval, so a hanging database produces `503` instead of a hanging probe. The URL is read once at
 * construction and never printed, because it carries the database credential (`NFR-024`).
 *
 * Phase 0 reads `DATABASE_URL` directly because the validated configuration loader belongs to
 * `packages/platform` and lands after this task. When that loader exists, it supplies the same string
 * here and nothing else in this module changes.
 */
import { connect } from 'node:net';

/** A readiness check that never rejects. */
export type DatastoreCheck = () => Promise<boolean>;

/** How the check is configured. */
export interface DatastoreCheckOptions {
  readonly databaseUrl: string | undefined;
  /** Milliseconds allowed for the connection attempt. */
  readonly timeoutMs?: number;
}

/** Default bound: short enough to answer inside the monitor's one-minute interval. */
export const DATASTORE_TIMEOUT_MS = 2_000;

/**
 * Parses the host and port from a PostgreSQL connection string.
 *
 * @returns The endpoint, or `null` when the value is absent or not a PostgreSQL URL.
 */
function parseEndpoint(databaseUrl: string | undefined): { host: string; port: number } | null {
  if (databaseUrl === undefined || databaseUrl.trim() === '') return null;
  try {
    const url = new URL(databaseUrl);
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') return null;
    const host = url.hostname.replace(/^\[|\]$/g, '');
    const port = url.port === '' ? 5432 : Number(url.port);
    if (host === '' || !Number.isInteger(port) || port < 1 || port > 65_535) return null;
    return { host, port };
  } catch {
    return null;
  }
}

/**
 * Creates the non-recording datastore round trip.
 *
 * @param options - The connection string and the timeout bound.
 * @returns A check that resolves `true` only when the socket connected inside the bound.
 */
export function createDatastoreCheck(options: DatastoreCheckOptions): DatastoreCheck {
  const endpoint = parseEndpoint(options.databaseUrl);
  const timeoutMs = options.timeoutMs ?? DATASTORE_TIMEOUT_MS;
  if (endpoint === null) return async () => false;

  return () =>
    new Promise<boolean>((resolve) => {
      let settled = false;
      const socket = connect({ host: endpoint.host, port: endpoint.port });

      const finish = (ready: boolean): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(ready);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish(true));
      socket.once('timeout', () => finish(false));
      socket.once('error', () => finish(false));
    });
}
