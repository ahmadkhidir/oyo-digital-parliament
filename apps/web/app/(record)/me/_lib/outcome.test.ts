/**
 * The outcome notices a My Record action leaves (`C-033` to `C-035`).
 *
 * Every token the actions can redirect with is exercised, so a state cannot be added to an action
 * without a sentence and a token cannot render another state's sentence.
 */
import { describe, expect, it } from 'vitest';
import { noticeForOutcome } from './outcome';
import { catalogues } from '../../../../messages';

const copy = catalogues['en-NG'].myRecord;

describe('My Record outcome notices', () => {
  it('renders each success token with its own sentence and a polite role', () => {
    expect(noticeForOutcome(copy, 'details_saved', null)?.message).toBe(copy.saved.details);
    expect(noticeForOutcome(copy, 'details_saved_retained', null)?.message).toBe(
      copy.saved.detailsRetained,
    );
    expect(noticeForOutcome(copy, 'language_saved', null)?.message).toBe(copy.language.saved);
    expect(noticeForOutcome(copy, 'consent_saved', null)?.message).toBe(copy.consent.changed);
    expect(noticeForOutcome(copy, 'consent_unchanged', null)?.message).toBe(copy.consent.unchanged);
    expect(noticeForOutcome(copy, 'export_requested', null)?.message).toBe(
      copy.exportAction.submitted,
    );
    expect(noticeForOutcome(copy, 'deletion_requested', null)?.message).toBe(
      copy.deleteAction.submitted,
    );
    expect(noticeForOutcome(copy, 'request_queued', null)?.message).toBe(copy.requests.queued);
    expect(noticeForOutcome(copy, 'export_open', null)?.message).toBe(copy.exportAction.open);
    expect(noticeForOutcome(copy, 'request_held', null)?.message).toBe(
      copy.requests.heldWithoutDate,
    );
    expect(noticeForOutcome(copy, 'request_held', null, { date: '1 Dec 2026' })?.message).toBe(
      copy.requests.heldImmediately.replace('{date}', '1 Dec 2026'),
    );
    expect(noticeForOutcome(copy, 'consent_saved', null)?.role).toBe('status');
  });

  it('renders each refusal token as an alert with the reason', () => {
    expect(noticeForOutcome(copy, null, 'details_invalid')).toMatchObject({
      role: 'alert',
      message: copy.correction.invalid,
    });
    expect(noticeForOutcome(copy, null, 'details_rate_limited')?.message).toBe(
      copy.correction.errors.rateLimited,
    );
    expect(noticeForOutcome(copy, null, 'details_failed')?.message).toBe(
      copy.correction.errors.writeFailed,
    );
    expect(noticeForOutcome(copy, null, 'consent_failed')?.message).toBe(copy.consent.failed);
    expect(noticeForOutcome(copy, null, 'request_failed')?.message).toBe(copy.exportAction.failed);
    expect(noticeForOutcome(copy, null, 'degraded')).toMatchObject({
      role: 'alert',
      title: copy.errorHeading,
      message: copy.errorBody,
    });
  });

  it('ignores a token this build does not know', () => {
    expect(noticeForOutcome(copy, null, null)).toBeNull();
    expect(noticeForOutcome(copy, 'made_up', null)).toBeNull();
    expect(noticeForOutcome(copy, null, 'made_up')).toBeNull();
  });
});
