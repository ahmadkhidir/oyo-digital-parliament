/**
 * Worker shutdown tests (`C-091`: readiness turns 503 before the listener closes, and an in-flight
 * batch finishes or releases its lock).
 */
import { describe, expect, it } from 'vitest';
import { createJsonLogger } from './log.ts';
import { createShutdownController, installShutdownSignals } from './shutdown.ts';

function silentLogger() {
  return createJsonLogger({ sink: { write: () => undefined } });
}

class FakeSignals {
  readonly handlers = new Map<string, Set<() => void>>();

  on(signal: string, listener: () => void): void {
    const set = this.handlers.get(signal) ?? new Set();
    set.add(listener);
    this.handlers.set(signal, set);
  }

  off(signal: string, listener: () => void): void {
    this.handlers.get(signal)?.delete(listener);
  }

  fire(signal: string): void {
    for (const listener of this.handlers.get(signal) ?? []) listener();
  }

  count(): number {
    let total = 0;
    for (const set of this.handlers.values()) total += set.size;
    return total;
  }
}

describe('worker shutdown controller', () => {
  it('waits for a batch that finishes inside the grace period and never force-releases it', async () => {
    const exits: number[] = [];
    const released: string[] = [];
    let closed = false;

    const controller = createShutdownController({
      logger: silentLogger(),
      graceMs: 200,
      exit: (code) => exits.push(code),
      onDrained: () => {
        closed = true;
      },
    });
    const registration = controller.registerBatch({
      id: 'run_1',
      release: () => {
        released.push('run_1');
      },
    });

    const stopping = controller.stop('signal');
    expect(controller.isDraining()).toBe(true);
    registration.complete();

    await stopping;
    expect(released).toEqual([]);
    expect(closed).toBe(true);
    expect(exits).toEqual([0]);
  });

  it('releases the lock of a batch still running when the grace period expires', async () => {
    const released: string[] = [];
    const exits: number[] = [];

    const controller = createShutdownController({
      logger: silentLogger(),
      graceMs: 10,
      exit: (code) => exits.push(code),
    });
    controller.registerBatch({
      id: 'run_2',
      release: () => {
        released.push('run_2');
      },
    });

    await controller.stop('signal');
    expect(released).toEqual(['run_2']);
    expect(exits).toEqual([0]);
  });

  it('keeps going when a lock release fails', async () => {
    const exits: number[] = [];
    const controller = createShutdownController({
      logger: silentLogger(),
      graceMs: 5,
      exit: (code) => exits.push(code),
    });
    controller.registerBatch({
      id: 'run_3',
      release: () => {
        throw new Error('lock connection already closed');
      },
    });

    await expect(controller.stop('signal')).resolves.toBeUndefined();
    expect(exits).toEqual([0]);
  });

  it('refuses a new batch once draining has begun', () => {
    const controller = createShutdownController({
      logger: silentLogger(),
      graceMs: 5,
      exit: () => undefined,
    });
    controller.beginDrain('test');
    expect(() => controller.registerBatch({ id: 'run_4', release: () => undefined })).toThrow(
      /draining/,
    );
  });

  it('is idempotent when stop is awaited twice', async () => {
    const exits: number[] = [];
    const controller = createShutdownController({
      logger: silentLogger(),
      graceMs: 5,
      exit: (code) => exits.push(code),
    });
    await controller.stop('first');
    await controller.stop('second');
    expect(exits).toEqual([0]);
  });
});

describe('worker shutdown signals', () => {
  it('drains on the first signal and exits with failure on the second', async () => {
    const signals = new FakeSignals();
    const exits: number[] = [];
    const controller = createShutdownController({
      logger: silentLogger(),
      graceMs: 5,
      exit: (code) => exits.push(code),
    });
    controller.registerBatch({ id: 'run_signal', release: () => undefined });

    const cleanup = installShutdownSignals({
      controller,
      logger: silentLogger(),
      signals,
      exit: (code) => exits.push(code),
    });

    signals.fire('SIGTERM');
    expect(controller.isDraining()).toBe(true);
    signals.fire('SIGINT');
    expect(exits).toEqual([1]);

    cleanup();
    expect(signals.count()).toBe(0);
    await controller.stop('settle');
  });
});
