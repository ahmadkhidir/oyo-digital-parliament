/**
 * Graceful shutdown tests (`C-091`: readiness turns 503 before the listener closes).
 */
import { describe, expect, it, vi } from 'vitest';
import { createDrainController, installShutdownHandlers } from './lifecycle';
import { createJsonLogger } from './logger';

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

function silentLogger() {
  return createJsonLogger({ service: 'web', sink: { write: () => undefined } });
}

describe('web shutdown', () => {
  it('transitions to draining once and stays draining', () => {
    const drain = createDrainController();
    expect(drain.isDraining()).toBe(false);
    expect(drain.beginDrain('test')).toBe(true);
    expect(drain.beginDrain('again')).toBe(false);
    expect(drain.isDraining()).toBe(true);
  });

  it('marks draining on SIGTERM and exits zero after the grace period', () => {
    const drain = createDrainController();
    const signals = new FakeSignals();
    const exits: number[] = [];
    let scheduled: (() => void) | undefined;

    installShutdownHandlers({
      drain,
      logger: silentLogger(),
      graceMs: 250,
      signals,
      timers: {
        schedule(callback) {
          scheduled = callback;
          return 1;
        },
        cancel: vi.fn(),
      },
      exit: (code) => exits.push(code),
    });

    signals.fire('SIGTERM');
    expect(drain.isDraining()).toBe(true);
    expect(exits).toEqual([]);

    scheduled?.();
    expect(exits).toEqual([0]);
  });

  it('exits immediately with a failure code on a second signal', () => {
    const drain = createDrainController();
    const signals = new FakeSignals();
    const exits: number[] = [];

    installShutdownHandlers({
      drain,
      logger: silentLogger(),
      graceMs: 10_000,
      signals,
      timers: { schedule: () => 1, cancel: vi.fn() },
      exit: (code) => exits.push(code),
    });

    signals.fire('SIGTERM');
    signals.fire('SIGINT');
    expect(exits).toEqual([1]);
  });

  it('removes both listeners and cancels the pending exit when cleaned up', () => {
    const drain = createDrainController();
    const signals = new FakeSignals();
    const cancel = vi.fn();

    const cleanup = installShutdownHandlers({
      drain,
      logger: silentLogger(),
      graceMs: 100,
      signals,
      timers: { schedule: () => 42, cancel },
      exit: () => undefined,
    });

    expect(signals.count()).toBe(2);
    signals.fire('SIGTERM');
    cleanup();
    expect(signals.count()).toBe(0);
    expect(cancel).toHaveBeenCalledWith(42);
  });
});
