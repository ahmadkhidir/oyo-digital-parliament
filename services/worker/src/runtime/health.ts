/**
 * The worker's live and ready listener (`C-091`).
 *
 * The worker serves no browser traffic; this listener exposes exactly the two probe paths the contract
 * names. Both answer from constants: no record is read, no query is parsed, no body is consumed and no
 * cookie or header is required. `/healthz` reports the process can answer. `/readyz` reports the
 * process has not begun draining and the primary datastore can be reached.
 *
 * The response rules match the web deployable: `Content-Type: application/json`,
 * `Cache-Control: no-store`, a byte-identical body for a given status, no `C-001` envelope and no
 * topology, version or timestamp. Any method other than `GET` gets `405` with `Allow: GET`.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { DatastoreCheck } from './datastore.ts';
import { newCorrelationId, type Logger } from './log.ts';
import type { ShutdownController } from './shutdown.ts';

/** Exact response bodies; these strings are the contract. */
export const PROBE_BODIES = {
  alive: '{"status":"alive"}',
  ready: '{"status":"ready"}',
  notReady: '{"status":"not_ready"}',
} as const;

/** What the listener needs. */
export interface ProbeServerOptions {
  readonly port: number;
  readonly host?: string;
  readonly controller: ShutdownController;
  readonly checkDatastore: DatastoreCheck;
  readonly logger: Logger;
}

/** A started or startable probe listener. */
export interface ProbeServer {
  /** Starts listening and resolves the bound port (`0` selects an ephemeral one). */
  start(): Promise<number>;
  /** Stops accepting connections and resolves when the listener is closed. */
  stop(): Promise<void>;
}

/** Writes a constant probe response. */
function send(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/** Writes the application-level refusal `C-091` defines for a non-`GET` method. */
function sendMethodNotAllowed(res: ServerResponse): void {
  res.writeHead(405, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    Allow: 'GET',
  });
  res.end();
}

/**
 * Creates the worker's probe listener.
 *
 * @param options - The port, shutdown controller, datastore check and logger.
 */
export function createProbeServer(options: ProbeServerOptions): ProbeServer {
  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    // Drain any body without reading it: a probe that parses input is a probe that can be made to fail.
    request.resume();

    const correlationId = newCorrelationId();
    const log = options.logger.child({ correlationId });
    const method = request.method ?? 'GET';
    let path = '/';
    try {
      path = new URL(request.url ?? '/', 'http://worker').pathname;
    } catch {
      // A malformed target is not a probe path; it falls through to the 404 below.
    }

    if (method !== 'GET') {
      log.info('probe.method_refused', { method, path });
      sendMethodNotAllowed(response);
      return;
    }

    if (path === '/healthz') {
      log.info('probe.liveness', { status: 'alive' });
      send(response, 200, PROBE_BODIES.alive);
      return;
    }

    if (path === '/readyz') {
      if (options.controller.isDraining()) {
        log.info('probe.readiness', { status: 'not_ready', outcome: 'draining' });
        send(response, 503, PROBE_BODIES.notReady);
        return;
      }

      let ready = false;
      try {
        ready = await options.checkDatastore();
      } catch {
        ready = false;
      }

      if (!ready) {
        log.warn('probe.readiness', { status: 'not_ready', outcome: 'datastore_unavailable' });
        send(response, 503, PROBE_BODIES.notReady);
        return;
      }

      log.info('probe.readiness', { status: 'ready' });
      send(response, 200, PROBE_BODIES.ready);
      return;
    }

    log.info('probe.unknown_path', { path });
    response.writeHead(404, { 'Cache-Control': 'no-store' });
    response.end();
  }

  const server: Server = createServer((request, response) => {
    void handle(request, response);
  });

  return {
    start() {
      return new Promise<number>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = (): void => {
          server.off('error', onError);
          const address = server.address();
          resolve(address !== null && typeof address === 'object' ? address.port : options.port);
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen({ port: options.port, host: options.host ?? '0.0.0.0' });
      });
    },

    stop() {
      return new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined && error !== null) {
            reject(error);
            return;
          }
          resolve();
        });
        // A probe connection is short-lived; forcing it closed keeps shutdown inside its grace window.
        server.closeAllConnections();
      });
    },
  };
}
