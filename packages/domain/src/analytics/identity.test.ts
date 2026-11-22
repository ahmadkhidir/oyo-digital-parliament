/**
 * The analytics identity convention (`C-089`, `C-001`).
 *
 * The store's `user_id` is a `usr_` identifier while the record's member identifier is `mbr_`; these
 * tests pin the translation that reconciles them, and the refusal that stops it inventing one.
 */
import { describe, expect, it } from 'vitest';

import { ANALYTICS_USER_ID_PATTERN, analyticsUserIdFor } from './identity.ts';

describe('analytics identity', () => {
  it('reuses the member identifier body under the usr prefix', () => {
    const memberId = 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA';

    expect(analyticsUserIdFor(memberId)).toBe('usr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA');
    expect(analyticsUserIdFor(memberId)).toMatch(ANALYTICS_USER_ID_PATTERN);
  });

  it('is stable for one member, so events join across the account’s life', () => {
    const memberId = 'mbr_01J9Z6Q7D2V4B8N0M3X5C1Z9KA';

    expect(analyticsUserIdFor(memberId)).toBe(analyticsUserIdFor(memberId));
  });

  it('leaves a value that is not a member identifier alone, for the envelope to refuse', () => {
    // A name is the case that matters: the convention must not turn one into an identity.
    expect(analyticsUserIdFor('Oluwaseun Adeyemi')).toBe('Oluwaseun Adeyemi');
    expect(analyticsUserIdFor('Oluwaseun Adeyemi')).not.toMatch(ANALYTICS_USER_ID_PATTERN);
    expect(analyticsUserIdFor('prg_01J9Z4P8R2T6V8W1X3Y5Z7AB9')).not.toMatch(
      ANALYTICS_USER_ID_PATTERN,
    );
  });
});
