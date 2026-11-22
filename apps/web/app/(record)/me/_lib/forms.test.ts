/**
 * The My Record form readers and status words (`C-033` to `C-035`,
 * `screens/13-my-record.md`).
 *
 * Each reader is exercised with the payload a browser or a hostile caller can produce, because the
 * action boundary re-reads every value and the domain must hear an unreadable one rather than a
 * guess. The status words are asserted so a raw enum token cannot reach a reader.
 */
import { describe, expect, it } from 'vitest';
import {
  backingStateWord,
  consentStateWord,
  correctionErrorWord,
  decisionStatusKey,
  decisionWord,
  identityStateWord,
  readConsentSubmission,
  readCorrectionSubmission,
  readDataRequestSubmission,
  requestStatusWord,
  requestTypeWord,
  submissionStatusWord,
} from './forms';
import { catalogues } from '../../../../messages';

const copy = catalogues['en-NG'].myRecord;

/** Builds a form payload the way a browser would. */
function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

describe('My Record form readers', () => {
  it('reads the correction fields and keeps the submitted locale for the domain to validate', () => {
    const submission = readCorrectionSubmission(
      form([
        ['displayName', 'Seun Adeyemi'],
        ['fullName', 'Oluwaseun Adeyemi'],
        ['locale', 'yo-NG'],
        ['echoKey', 'render-key'],
      ]),
    );
    expect(submission).toEqual({
      displayName: 'Seun Adeyemi',
      fullName: 'Oluwaseun Adeyemi',
      locale: 'yo-NG',
      mode: 'details',
      echoKey: 'render-key',
    });
  });

  it('marks the footer language switch as the language-only post', () => {
    const submission = readCorrectionSubmission(
      form([
        ['locale', 'yo-NG'],
        ['intent', 'language'],
      ]),
    );
    expect(submission.mode).toBe('language');
    expect(submission.displayName).toBe('');
  });

  it('treats the footer’s locale-only form as the language post without an intent field', () => {
    expect(readCorrectionSubmission(form([['locale', 'yo-NG']])).mode).toBe('language');
  });

  it('reads the last granted answer, so an unchecked box still states false', () => {
    const granted = readConsentSubmission(
      form([
        ['purpose', 'record_transfer'],
        ['granted', 'false'],
        ['granted', 'true'],
      ]),
    );
    expect(granted).toEqual({ purpose: 'record_transfer', granted: true });

    const withdrawn = readConsentSubmission(
      form([
        ['purpose', 'record_transfer'],
        ['granted', 'false'],
      ]),
    );
    expect(withdrawn).toEqual({ purpose: 'record_transfer', granted: false });
  });

  it('refuses a purpose or an answer outside the contract', () => {
    expect(
      readConsentSubmission(
        form([
          ['purpose', 'marketing'],
          ['granted', 'true'],
        ]),
      ),
    ).toEqual({
      purpose: null,
      granted: true,
    });
    expect(readConsentSubmission(form([['purpose', 'record_transfer']]))).toEqual({
      purpose: 'record_transfer',
      granted: null,
    });
  });

  it('reads only the four data-request types and carries the idempotency key', () => {
    expect(
      readDataRequestSubmission(
        form([
          ['type', 'deletion'],
          ['idempotencyKey', 'key-1'],
        ]),
      ),
    ).toEqual({ type: 'deletion', idempotencyKey: 'key-1' });
    expect(readDataRequestSubmission(form([['type', 'erase']]))).toEqual({
      type: null,
      idempotencyKey: '',
    });
  });
});

describe('My Record status words', () => {
  it('translates every submission status and leaves an unknown token visible', () => {
    expect(submissionStatusWord(copy, 'awaiting_decision')).toBe('Awaiting a decision');
    expect(submissionStatusWord(copy, 'withheld')).toBe('Withheld from publication');
    expect(submissionStatusWord(copy, 'imported')).toBe('imported');
  });

  it('maps each decision to its word and its marker', () => {
    expect(decisionWord(copy, 'commit')).toBe('Commit');
    expect(decisionWord(copy, 'decline')).toBe('Decline');
    expect(decisionWord(copy, 'refer')).toBe('Refer');
    expect(decisionWord(copy, null)).toBeNull();
    expect(decisionStatusKey('commit')).toBe('committed');
    expect(decisionStatusKey('decline')).toBe('declined');
    expect(decisionStatusKey('refer')).toBe('referred');
  });

  it('translates the remaining vocabularies', () => {
    expect(backingStateWord(copy, 'active')).toBe('Active');
    expect(requestTypeWord(copy.requests, 'deletion')).toBe('Deletion');
    expect(requestStatusWord(copy.requests, 'deferred_for_legal_hold')).toBe(
      'Deferred for a legal hold',
    );
    expect(identityStateWord(copy, 'checked')).toBe('Checked');
    expect(consentStateWord(copy.consent, true)).toBe('Granted');
    expect(consentStateWord(copy.consent, false)).toBe('Withdrawn');
    expect(consentStateWord(copy.consent, null)).toBe('Not answered yet');
  });

  it('names the correction failure under the control that produced it', () => {
    expect(correctionErrorWord(copy, 'displayName', 'REQUIRED')).toBe(
      copy.correction.errors.displayNameRequired,
    );
    expect(correctionErrorWord(copy, 'displayName', 'ALREADY_SET')).toBe(
      copy.correction.errors.displayNameTaken,
    );
    expect(correctionErrorWord(copy, 'fullName', 'TOO_LONG')).toBe(
      copy.correction.errors.fullNameLong,
    );
    expect(correctionErrorWord(copy, 'locale', 'ENUM_MISMATCH')).toBe(
      copy.correction.errors.languageInvalid,
    );
    expect(correctionErrorWord(copy, 'displayName', 'ENUM_MISMATCH')).toBeUndefined();
    expect(correctionErrorWord(copy, 'telephoneNumber', 'REQUIRED')).toBeUndefined();
  });
});
