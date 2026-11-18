/**
 * Worker probe listener tests (`C-091`).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProbeServer, PROBE_BODIES, type ProbeServer } from './health.ts';
import { createJsonLogger } from './log.ts';
import { createShutdownController } from './shutdown.ts';

const running: ProbeServer[] = [];

function logger() {
  return createJsonLogger({ sink: { write: () => undefined } });
}

function controller() {
  return createShutdownController({
    logger: logger(),
    graceMs: 5,
    exit: () => undefined,
  });
}

async function start(
  checkDatastore: () => Promise<boolean> = async () => true,
): Promise<{ base: string; shutdown: ReturnType<typeof controller> }> {
  const shutdown = controller();
  const probes = createProbeServer({
    port: 0,
    host: '127.0.0.1',
    controller: shutdown,
    checkDatastore,
    logger: logger(),
  });
  running.push(probes);
  const port = await probes.start();
  return { base: `http://127.0.0.1:${port}`, shutdown };
}

afterEach(async () => {
  await Promise.all(running.splice(0).map((probes) => probes.stop()));
});

describe('worker GET /healthz (C-091)', () => {
  it('answers 200 with the exact liveness body and probe headers', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/healthz?ignored=1`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(PROBE_BODIES.alive);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});

describe('worker GET /readyz (C-091)', () => {
  it('answers 200 when the datastore is reachable', async () => {
    const { base } = await start(async () => true);
    const response = await fetch(`${base}/readyz`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(PROBE_BODIES.ready);
  });

  it('answers 503 with the constant body when the datastore is unreachable', async () => {
    const { base } = await start(async () => false);
    const response = await fetch(`${base}/readyz`);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(PROBE_BODIES.notReady);
  });

  it('answers 503 while draining without consulting the datastore', async () => {
    const checkDatastore = vi.fn(async () => true);
    const { base, shutdown } = await start(checkDatastore);
    shutdown.beginDrain('test');

    const response = await fetch(`${base}/readyz`);
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(PROBE_BODIES.notReady);
    expect(checkDatastore).not.toHaveBeenCalled();
  });
});

describe('worker probe refusal (C-091)', () => {
  it('refuses a non-GET method with 405 and Allow: GET', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/healthz`, { method: 'POST', body: 'anything' });
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  it('answers 404 on a path the contract does not define', async () => {
    const { base } = await start();
    const response = await fetch(`${base}/metrics`);
    expect(response.status).toBe(404);
  });
});
