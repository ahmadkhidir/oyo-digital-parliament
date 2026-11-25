/**
 * Interface-copy invariants that a screen renders as one sentence (`NFR-044`).
 *
 * The consent record states a purpose's state and then its instant. A withdrawn purpose already
 * says "Withdrawn" before the date, so the date line names only the date rather than repeating the
 * word a second time.
 */
import { describe, expect, it } from 'vitest';
import { LAUNCH_LOCALES, catalogues } from './index';

describe('the consent record copy (FEAT-012, screens/13-my-record.md)', () => {
  it('states a withdrawal date without repeating the state word', () => {
    for (const locale of LAUNCH_LOCALES) {
      const consent = catalogues[locale].myRecord.consent;
      const dateLine = consent.withdrawnOn.replace('{date}', '').trim().toLowerCase();
      expect(dateLine).not.toContain(consent.withdrawn.toLowerCase());
    }
  });
});
