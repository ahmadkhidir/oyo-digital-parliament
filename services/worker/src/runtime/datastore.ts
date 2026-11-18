/**
 * The worker's datastore readiness round trip (`C-091`).
 *
 * Readiness on the worker means the store the next scheduled batch needs is reachable. The check opens
 * and closes one connection to the PostgreSQL endpoint; it reads no record, writes nothing and never
 * prints the connection string, which carries the credential (`NFR-024`).
 *
 * The timeout is fixed and shorter than the uptime monitor's one-minute interval, so a hung database
 * answers `503` rather than hanging the probe. `DATABASE_URL` is read here because the validated
 * configuration loader belongs to `packages/platform` and has not landed yet; when it does, it supplies
 * the same value and this module is unchanged.
 */
import { connect } from 'node:net';

/** A readiness check that never rejects. */
export type DatastoreCheck = () => Promise<boolean>;

/** The default connection bound. */
export const DATASTORE_TIMEOUT_MS = 2_000;

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
 * Creates the worker's non-recording datastore check.
 *
 * @param databaseUrl - The configured primary datastore address.
 * @param timeoutMs - The fixed bound for the connection attempt.
 */
export function createDatastoreCheck(
  databaseUrl: string | undefined,
  timeoutMs: number = DATASTORE_TIMEOUT_MS,
): DatastoreCheck {
  const endpoint = parseEndpoint(databaseUrl);
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
