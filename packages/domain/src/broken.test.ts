import { describe, expect, it } from 'vitest';

describe('deliberate evidence for F0-03', () => {
  it('fails on purpose', () => {
    expect(1).toBe(2);
  });
});

