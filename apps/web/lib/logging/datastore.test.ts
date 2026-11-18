/**
 * Datastore readiness tests (`C-091`: one non-recording round trip, bounded by a fixed timeout).
 */
import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatastoreCheck } from './datastore';

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

describe('web datastore readiness', () => {
  it('answers true when the PostgreSQL endpoint accepts a connection', async () => {
    const port = await listen();
    const check = createDatastoreCheck({
      databaseUrl: `postgresql://odp_local:secret@127.0.0.1:${port}/odp_local`,
      timeoutMs: 500,
    });
    await expect(check()).resolves.toBe(true);
  });

  it('answers false when nothing is listening', async () => {
    const port = await listen();
    servers.pop()?.close();
    const check = createDatastoreCheck({
      databaseUrl: `postgresql://odp_local:secret@127.0.0.1:${port}/odp_local`,
      timeoutMs: 500,
    });
    await expect(check()).resolves.toBe(false);
  });

  it('answers false without a configured URL rather than throwing', async () => {
    await expect(createDatastoreCheck({ databaseUrl: undefined })()).resolves.toBe(false);
    await expect(createDatastoreCheck({ databaseUrl: 'not a url' })()).resolves.toBe(false);
    await expect(createDatastoreCheck({ databaseUrl: 'https://example.com' })()).resolves.toBe(
      false,
    );
  });

  it('never prints the connection string', () => {
    const check = createDatastoreCheck({
      databaseUrl: 'postgresql://odp_local:super-secret@127.0.0.1:1/odp_local',
    });
    expect(check.toString()).not.toContain('super-secret');
  });
});
