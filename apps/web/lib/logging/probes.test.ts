/**
 * Probe handler tests (`C-091`).
 *
 * The assertions are on the exact bytes and headers the contract fixes, because a monitor compares the
 * body and a proxy caches on the headers.
 */
import { describe, expect, it, vi } from 'vitest';
import { createDrainController } from './lifecycle';
import { createJsonLogger } from './logger';
import {
  createLivenessHandler,
  createReadinessHandler,
  PROBE_BODIES,
  refuseNonGetMethod,
  type ProbeRuntime,
} from './probes';

function runtime(overrides: Partial<ProbeRuntime> = {}): ProbeRuntime {
  return {
    drain: createDrainController(),
    checkDatastore: async () => true,
    logger: createJsonLogger({ service: 'web', sink: { write: () => undefined } }),
    ...overrides,
  };
}

describe('GET /healthz (C-091)', () => {
  it('answers 200 with the exact liveness body and probe headers', async () => {
    const response = await createLivenessHandler(runtime())(
      new Request('http://local/healthz?ignored=1'),
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(PROBE_BODIES.alive);
    expect(PROBE_BODIES.alive).toBe('{"status":"alive"}');
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('consulted no dependency and carries no envelope fields', async () => {
    const checkDatastore = vi.fn(async () => false);
    const response = await createLivenessHandler(runtime({ checkDatastore }))(
      new Request('http://local/healthz'),
    );
    const body = await response.text();
    expect(checkDatastore).not.toHaveBeenCalled();
    expect(body).not.toContain('correlationId');
    expect(body).not.toContain('asAt');
    expect(body).not.toContain('meta');
  });
});

describe('GET /readyz (C-091)', () => {
  it('answers 200 with the exact readiness body when the datastore answers', async () => {
    const response = await createReadinessHandler(runtime())(new Request('http://local/readyz'));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(PROBE_BODIES.ready);
    expect(PROBE_BODIES.ready).toBe('{"status":"ready"}');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 503 with the exact not-ready body when the datastore is unreachable', async () => {
    const response = await createReadinessHandler(runtime({ checkDatastore: async () => false }))(
      new Request('http://local/readyz'),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).toBe(PROBE_BODIES.notReady);
    expect(PROBE_BODIES.notReady).toBe('{"status":"not_ready"}');
  });

  it('answers 503 while draining without touching the datastore', async () => {
    const drain = createDrainController();
    drain.beginDrain('test');
    const checkDatastore = vi.fn(async () => true);

    const response = await createReadinessHandler(runtime({ drain, checkDatastore }))(
      new Request('http://local/readyz'),
    );

    expect(response.status).toBe(503);
    expect(await response.text()).toBe(PROBE_BODIES.notReady);
    expect(checkDatastore).not.toHaveBeenCalled();
  });

  it('does not disclose a reason, dependency, version or hostname', async () => {
    const response = await createReadinessHandler(runtime({ checkDatastore: async () => false }))(
      new Request('http://local/readyz'),
    );
    const body = await response.text();
    expect(body).toBe('{"status":"not_ready"}');
    expect(body).not.toContain('postgres');
    expect(body).not.toContain('version');
    expect(body).not.toContain('host');
  });
});

describe('non-GET probe methods (C-091)', () => {
  it('refuses with 405, Allow: GET and no envelope', async () => {
    const response = refuseNonGetMethod();
    expect(response.status).toBe(405);
    expect(response.headers.get('allow')).toBe('GET');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });
});
