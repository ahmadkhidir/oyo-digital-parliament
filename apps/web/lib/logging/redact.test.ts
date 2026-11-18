/**
 * Redaction tests (`apps/web/AGENTS.md` Discipline: personal data never enters a log line;
 * `architecture.md` Logging & Monitoring).
 */
import { describe, expect, it } from 'vitest';
import { redactLogContext, redactLogValue, redactText, REDACTED } from './redact';

describe('log redaction', () => {
  it('replaces a structured field that names a person', () => {
    const redacted = redactLogContext({
      fullName: 'Aminat Okafor',
      memberId: 'mbr_01J9Z6K4Q3W8R2T5Y7B1C0D9EF',
      wardDescription: 'the street behind the market',
    });
    expect(redacted).toEqual({
      fullName: REDACTED,
      memberId: REDACTED,
      wardDescription: REDACTED,
    });
  });

  it('replaces a field name that only carries a personal suffix', () => {
    expect(redactLogContext({ applicantFullName: 'Aminat Okafor' })).toEqual({
      applicantFullName: REDACTED,
    });
  });

  it('removes a Nigerian telephone number and an email address from free text', () => {
    const text = redactText('call 0803 123 4567 or write to aminat@example.com');
    expect(text).toBe(`call ${REDACTED} or write to ${REDACTED}`);
  });

  it('removes a member identifier and a bearer token from free text', () => {
    const text = redactText('member mbr_01J9Z6K4Q3W8R2T5Y7B1C0D9EF token Bearer abc.def.ghi');
    expect(text).not.toContain('mbr_01J9Z6K4Q3W8R2T5Y7B1C0D9EF');
    expect(text).not.toContain('abc.def.ghi');
  });

  it('redacts nested values and array entries', () => {
    const redacted = redactLogValue({
      attempt: 2,
      detail: { telephoneNumber: '08031234567', outcome: 'queued' },
      people: [{ name: 'Aminat' }],
    });
    expect(redacted).toEqual({
      attempt: 2,
      detail: { telephoneNumber: REDACTED, outcome: 'queued' },
      people: [{ name: REDACTED }],
    });
  });

  it('keeps an Error name and code but drops its message and stack', () => {
    const error = Object.assign(new Error('Failed for Aminat at 08031234567'), {
      code: 'CONNECTION_REFUSED',
    });
    expect(redactLogValue(error)).toEqual({
      name: 'Error',
      code: 'CONNECTION_REFUSED',
    });
  });

  it('caps depth and string length instead of failing on a large value', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: 'too deep' } } } } } } } };
    expect(JSON.stringify(redactLogValue(deep))).toContain('[truncated]');
    expect(redactText('x'.repeat(5000))).toHaveLength(2048);
  });

  it('redacts before truncating, so a value at the cap is not left half-printed', () => {
    const redacted = redactText(`${'x'.repeat(2042)}08031234567`);
    expect(redacted).not.toContain('0803');
    expect(redacted.length).toBeLessThanOrEqual(2048);
  });

  it('does not throw on a circular object', () => {
    const circular: Record<string, unknown> = { attempt: 1 };
    circular['self'] = circular;
    expect(() => JSON.stringify(redactLogValue(circular))).not.toThrow();
  });
});
