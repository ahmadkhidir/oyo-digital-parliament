/**
 * The deletion token (`analytics.md` Deletion propagation, `C-090`).
 *
 * The same member must derive the same `tok_` identifier on every attempt, and the value must not be
 * the member identifier itself.
 */
import { describe, expect, it } from 'vitest';
import { analyticsDeletionToken } from './analytics-deletion';

describe('analyticsDeletionToken', () => {
  it('derives one stable tok_ identifier', () => {
    const memberId = 'mbr_0001';
    const first = analyticsDeletionToken(memberId);
    expect(first).toBe(analyticsDeletionToken(memberId));
    expect(first).toMatch(/^tok_[0-9A-Z]{26}$/);
    expect(first).not.toContain(memberId);
  });

  it('derives a different token for a different member', () => {
    expect(analyticsDeletionToken('mbr_0001')).not.toBe(
      analyticsDeletionToken('mbr_0002'),
    );
  });
});
