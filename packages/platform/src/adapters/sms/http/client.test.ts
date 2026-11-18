/**
 * The HTTP SMS gateway client (`C-076`).
 *
 * The suite proves the request shape, the status classification and the rule that no destination or
 * body reaches a result. It runs against a scripted transport and never sends a message.
 */
import { describe, expect, it } from 'vitest';

import {
  HttpTimeoutError,
  type HttpClient,
  type HttpRequest,
  type HttpResponse,
} from '../../../ports/http.ts';
import { createHttpSmsProvider } from './client.ts';

interface ScriptedHttp extends HttpClient {
  readonly requests: readonly HttpRequest[];
}

function scriptedHttp(
  respond: (request: HttpRequest) => HttpResponse | Promise<HttpResponse>,
): ScriptedHttp {
  const requests: HttpRequest[] = [];
  return {
    requests,
    async send(request) {
      requests.push(request);
      return respond(request);
    },
  };
}

const respond = (status: number, body?: unknown): HttpResponse => ({
  status,
  headers: {},
  body: new TextEncoder().encode(body === undefined ? '' : JSON.stringify(body)),
});

const create = (http: HttpClient) =>
  createHttpSmsProvider({
    endpoint: 'https://sms.example.test/send',
    apiKey: 'test-key',
    http,
    timeoutMs: 5000,
  });

const message = { to: '+2348012345678', body: 'Your code is 418302', senderId: 'ODP' };

describe('HTTP SMS client', () => {
  it('posts the documented JSON shape with a bearer credential', async () => {
    const http = scriptedHttp(() => respond(202, { id: 'msg_1' }));
    const provider = create(http);

    const result = await provider.send(message);

    expect(result).toEqual({ outcome: 'accepted', messageId: 'msg_1', statusCode: 202 });
    const [request] = http.requests;
    expect(request?.url).toBe('https://sms.example.test/send');
    expect(request?.headers?.authorization).toBe('Bearer test-key');
    expect(JSON.parse(new TextDecoder().decode(request?.body))).toEqual({
      to: '+2348012345678',
      body: 'Your code is 418302',
      sender: 'ODP',
    });
  });

  it('treats an accepted response without an id as accepted', async () => {
    const http = scriptedHttp(() => respond(200, { unexpected: true }));
    await expect(create(http).send(message)).resolves.toMatchObject({
      outcome: 'accepted',
      messageId: null,
    });
  });

  it('holds the message when the gateway is overloaded or down', async () => {
    for (const status of [408, 429, 500, 503]) {
      const http = scriptedHttp(() => respond(status));
      const result = await create(http).send(message);
      expect(result.outcome).toBe('unavailable');
      expect(result.statusCode).toBe(status);
    }
  });

  it('reports a refusal as rejected', async () => {
    const http = scriptedHttp(() => respond(422, { error: 'sender not approved' }));
    await expect(create(http).send(message)).resolves.toMatchObject({
      outcome: 'rejected',
      statusCode: 422,
    });
  });

  it('distinguishes a timeout from an outage', async () => {
    const timingOut = create(
      scriptedHttp(() => {
        throw new HttpTimeoutError();
      }),
    );
    await expect(timingOut.send(message)).resolves.toMatchObject({ outcome: 'timeout' });

    const down = create(
      scriptedHttp(() => {
        throw new Error('socket closed');
      }),
    );
    await expect(down.send(message)).resolves.toMatchObject({ outcome: 'unavailable' });
  });

  it('never returns the destination or the body in its result', async () => {
    const http = scriptedHttp(() => respond(400));
    const result = await create(http).send(message);
    expect(JSON.stringify(result)).not.toContain('+2348012345678');
    expect(JSON.stringify(result)).not.toContain('418302');
  });
});
