/**
 * The telemetry buffer (`C-089`: buffered and retried; the write that produced the event is unaffected).
 */
import { describe, expect, it } from 'vitest';

import { createTelemetryBuffer } from './buffer';
import { screenViewed } from './fixtures';

describe('telemetry buffer', () => {
  it('returns what it holds, oldest first', () => {
    const buffer = createTelemetryBuffer();
    const first = screenViewed('evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB');
    const second = screenViewed('evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AC');
    buffer.enqueue(first);
    buffer.enqueue(second);
    expect(buffer.size()).toBe(2);
    expect(buffer.drain()).toEqual([first, second]);
    expect(buffer.size()).toBe(0);
  });

  it('collapses a repeated event id instead of counting it twice', () => {
    const buffer = createTelemetryBuffer();
    const event = screenViewed('evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB');
    expect(buffer.enqueue(event)).toEqual({ kept: true });
    expect(buffer.enqueue(event)).toEqual({ kept: false });
    expect(buffer.size()).toBe(1);
  });

  it('drops the oldest event and says which one when it is full', () => {
    const buffer = createTelemetryBuffer(2);
    const first = screenViewed('evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB');
    const second = screenViewed('evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AC');
    const third = screenViewed('evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AD');
    buffer.enqueue(first);
    buffer.enqueue(second);
    expect(buffer.enqueue(third)).toEqual({
      kept: true,
      dropped: first,
    });
    expect(buffer.drain()).toEqual([second, third]);
  });

  it('restores a failed flush at the head, keeping order and the capacity', () => {
    const buffer = createTelemetryBuffer(3);
    const older = screenViewed('evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AB');
    const newer = screenViewed('evt_01J9ZQ1R3S5T7V9W1X3Y5Z7AC');
    buffer.enqueue(newer);
    buffer.restore([older]);
    expect(buffer.drain()).toEqual([older, newer]);
  });

  it('refuses a capacity that cannot hold an event', () => {
    for (const capacity of [0, -3, 1.5]) {
      expect(() => createTelemetryBuffer(capacity), String(capacity)).toThrow(RangeError);
    }
  });
});
