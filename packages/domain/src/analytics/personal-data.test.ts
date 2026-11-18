/**
 * The no-personal-data detector behind `C-089` (`PERSONAL_DATA_IN_EVENT`) and `analytics.md`
 * Analytics Data Governance.
 */
import { describe, expect, it } from 'vitest';

import { findPersonalDataFindings, isPersonalPropertyKey } from './personal-data.ts';

describe('analytics personal-data rule', () => {
  it('recognises a personal key whatever its casing or separators', () => {
    for (const key of ['wardDescription', 'full_name', 'FULLNAME', 'telephone-number', 'member_id']) {
      expect(isPersonalPropertyKey(key), key).toBe(true);
    }
  });

  it("leaves the taxonomy's own codes alone", () => {
    for (const key of ['reason_code', 'reason_present', 'rule_code', 'failure_code', 'ward_id', 'has_cost_band']) {
      expect(isPersonalPropertyKey(key), key).toBe(false);
    }
  });

  it('finds a telephone number whatever separates its digits', () => {
    for (const value of ['0803 123 4567', '+234-803-123-4567', '2348031234567']) {
      const findings = findPersonalDataFindings({ failure_code: value });
      expect(findings, value).toEqual([{ kind: 'TELEPHONE_NUMBER', key: 'failure_code' }]);
    }
  });

  it('accepts a short number that is a count or a reference', () => {
    expect(findPersonalDataFindings({ version: 3 })).toEqual([]);
    expect(findPersonalDataFindings({ quarter: '2026-Q1' })).toEqual([]);
    expect(findPersonalDataFindings({ model_version: 'odp-sim-2026-08-1' })).toEqual([]);
  });

  it('finds an email address and a prose value', () => {
    expect(findPersonalDataFindings({ screen: 'seun@example.com' })).toEqual([
      { kind: 'EMAIL_ADDRESS', key: 'screen' },
    ]);
    expect(findPersonalDataFindings({ screen: 'the bridge at the ward boundary has collapsed' })).toEqual([
      { kind: 'FREE_TEXT', key: 'screen' },
    ]);
  });

  it('reports every offending key, not only the first', () => {
    const findings = findPersonalDataFindings({
      wardDescription: 'Bodija ward three near the market',
      failure_code: '08031234567',
      screen: 'home',
    });
    expect(findings.map((finding) => finding.key).sort()).toEqual(['failure_code', 'wardDescription'].sort());
  });
});
