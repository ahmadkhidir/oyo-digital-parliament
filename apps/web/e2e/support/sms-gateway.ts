/**
 * The SMS capture gateway the browser flows stand a real one in for (`C-076`, `NFR-020`).
 *
 * The application's HTTP SMS adapter speaks one documented shape: it posts `{ to, body, sender }`
 * to the configured endpoint with a bearer credential and reads an `id` back
 * (`packages/platform/src/adapters/sms/http/client.ts`). This server accepts exactly that, records
 * the message, and answers `202` with a message id, so the deployable's notification boundary sees
 * an accepted send and the pending registration becomes confirmable.
 *
 * It is the only way to learn a one-time code end to end: the code store keeps a SHA-256 digest and
 * the queue row carries no body, so the message this gateway holds is the single copy the resident
 * would see. Nothing here is a product surface: it listens on loopback, records the destination and
 * body in memory for the length of the run, and is never reachable from a page.
 *
 * The two read routes are for the flows' own Node context:
 *
 * - `GET /messages` returns every message captured this run, oldest first.
 * - `DELETE /messages` forgets them, so a flow can clear what an earlier step left.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/** One message the application asked the gateway to deliver. */
export interface CapturedMessage {
  /** The destination in the form the application stores it (`+234...`). */
  readonly to: string;
  /** The rendered body, which is where the six-digit code exists. */
  readonly body: string;
  /** The approved sender name the application configured. */
  readonly sender: string;
  /** When the gateway accepted it, for a flow that needs the newest message. */
  readonly receivedAt: string;
}

/** The running capture gateway. */
export interface SmsGateway {
  /** The recorded messages, oldest first. */
  messages(): readonly CapturedMessage[];
  /** Stop listening; resolves once the port is released. */
  close(): Promise<void>;
}

/** The largest body this gateway accepts; a rendered code message is a few hundred bytes. */
const MAX_BODY_BYTES = 16 * 1024;

/**
 * Read one request body as text, bounded so an oversized request cannot exhaust the runner.
 *
 * @param request - The incoming request.
 * @returns The body, or `null` when it exceeded the limit.
 */
async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Answer with JSON and no caching. */
function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

/**
 * Start the capture gateway on loopback.
 *
 * @param port - The loopback port to listen on.
 * @returns The gateway, with its recorded messages and a close action.
 */
export async function startSmsGateway(port: number): Promise<SmsGateway> {
  const captured: CapturedMessage[] = [];

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/messages' && request.method === 'GET') {
      sendJson(response, 200, captured);
      return;
    }
    if (url.pathname === '/messages' && request.method === 'DELETE') {
      captured.length = 0;
      sendJson(response, 200, { cleared: true });
      return;
    }
    if (url.pathname === '/send' && request.method === 'POST') {
      const body = await readBody(request);
      if (body === null) {
        sendJson(response, 413, { error: 'body too large' });
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        sendJson(response, 400, { error: 'malformed body' });
        return;
      }
      const message = parsed as { to?: unknown; body?: unknown; sender?: unknown };
      if (typeof message.to !== 'string' || typeof message.body !== 'string') {
        sendJson(response, 422, { error: 'to and body are required' });
        return;
      }
      captured.push({
        to: message.to,
        body: message.body,
        sender: typeof message.sender === 'string' ? message.sender : '',
        receivedAt: new Date().toISOString(),
      });
      if (process.env['ODP_E2E_SMS_TRACE'] === '1') {
        process.stderr.write(
          `[sms-gateway] accepted #${String(captured.length)} at ${new Date().toISOString()}\n`,
        );
      }
      sendJson(response, 202, { id: `msg_${captured.length}` });
      return;
    }

    sendJson(response, 404, { error: 'not found' });
  };

  const server: Server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.headersSent) sendJson(response, 500, { error: 'gateway failure' });
      else response.end();
    });
  });

  await new Promise<void>((resolveListening, rejectListening) => {
    server.once('error', rejectListening);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', rejectListening);
      resolveListening();
    });
  });

  return {
    messages: () => captured,
    close: () =>
      new Promise<void>((resolveClosed) => {
        server.close(() => resolveClosed());
      }),
  };
}
