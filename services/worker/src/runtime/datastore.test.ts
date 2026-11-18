/**
 * Worker datastore readiness tests (`C-091`).
 */
import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatastoreCheck } from './datastore.ts';

const servers: Server[] = [];

async function listen(): Promise<number> {
  const server = createServer((socket) => socket.destroy());
  servers.push(server);
  return new Promise<number>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Expected an ephemeral TCP port.'));
        return;
      }
      resolve(address.port);
    });
  });
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe('worker datastore readiness', () => {
  it('answers true when the endpoint accepts a connection', async () => {
    const port = await listen();
    const check = createDatastoreCheck(`postgresql://odp_local:secret@127.0.0.1:${port}/odp_local`);
    await expect(check()).resolves.toBe(true);
  });

  it('answers false when nothing is listening', async () => {
    const port = await listen();
    servers.pop()?.close();
    const check = createDatastoreCheck(
      `postgresql://odp_local:secret@127.0.0.1:${port}/odp_local`,
      500,
    );
    await expect(check()).resolves.toBe(false);
  });

  it('answers false without a usable URL and never prints the credential', async () => {
    await expect(createDatastoreCheck(undefined)()).resolves.toBe(false);
    const check = createDatastoreCheck('postgresql://odp_local:super-secret@127.0.0.1:1/odp_local');
    await expect(check()).resolves.toBe(false);
    expect(check.toString()).not.toContain('super-secret');
  });
});
