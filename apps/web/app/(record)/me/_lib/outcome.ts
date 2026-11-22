/**
 * The outcome sentences a My Record action leaves behind (`C-033` to `C-035`).
 *
 * Every action exits through a redirect, so the result travels as a fixed token in the query — a
 * closed vocabulary, never a name, a display name, a purpose description or any other free text
 * (`apps/web/AGENTS.md` Discipline). This module turns that token into the sentence the screen
 * shows and the live-region role it is announced with. A token this build does not know is
 * ignored rather than printed.
 */
import type { NoticeTone } from '@odp/ui';
import type { Messages } from '../../../../messages';
import { interpolate } from '../../../../lib/i18n/format';

/** What the screen announces after an action. */
export interface RecordNotice {
  readonly tone: NoticeTone;
  readonly role: 'status' | 'alert';
  readonly message: string;
  readonly title?: string;
}

/** The tokens a successful action may leave. */
export type RecordStatusToken =
  | 'details_saved'
  | 'details_saved_retained'
  | 'language_saved'
  | 'consent_saved'
  | 'consent_unchanged'
  | 'export_requested'
  | 'deletion_requested'
  | 'request_queued'
  | 'export_open'
  | 'request_held';

/** The tokens a refused action may leave. */
export type RecordErrorToken =
  | 'details_invalid'
  | 'details_rate_limited'
  | 'details_failed'
  | 'consent_failed'
  | 'request_failed'
  | 'degraded';

/**
 * The notice one redirected render shows.
 *
 * @param copy - The My Record slice of the active catalogue.
 * @param status - The `st` token, or `null`.
 * @param error - The `e` token, or `null`.
 * @param variables - The values a sentence interpolates; only a reviewed-on date so far.
 */
export function noticeForOutcome(
  copy: Messages['myRecord'],
  status: string | null,
  error: string | null,
  variables: { readonly date?: string } = {},
): RecordNotice | null {
  switch (status) {
    case 'details_saved':
      return { tone: 'success', role: 'status', message: copy.saved.details };
    case 'details_saved_retained':
      return { tone: 'success', role: 'status', message: copy.saved.detailsRetained };
    case 'language_saved':
      return { tone: 'success', role: 'status', message: copy.language.saved };
    case 'consent_saved':
      return { tone: 'success', role: 'status', message: copy.consent.changed };
    case 'consent_unchanged':
      return { tone: 'neutral', role: 'status', message: copy.consent.unchanged };
    case 'export_requested':
      return { tone: 'success', role: 'status', message: copy.exportAction.submitted };
    case 'deletion_requested':
      return { tone: 'success', role: 'status', message: copy.deleteAction.submitted };
    case 'request_queued':
      return { tone: 'info', role: 'status', message: copy.requests.queued };
    case 'export_open':
      return { tone: 'neutral', role: 'status', message: copy.exportAction.open };
    case 'request_held':
      return {
        tone: 'warning',
        role: 'status',
        message:
          variables.date === undefined
            ? copy.requests.heldWithoutDate
            : interpolate(copy.requests.heldImmediately, { date: variables.date }),
      };
    default:
      break;
  }

  switch (error) {
    case 'details_invalid':
      return { tone: 'error', role: 'alert', message: copy.correction.invalid };
    case 'details_rate_limited':
      return { tone: 'warning', role: 'alert', message: copy.correction.errors.rateLimited };
    case 'details_failed':
      return { tone: 'error', role: 'alert', message: copy.correction.errors.writeFailed };
    case 'consent_failed':
      return { tone: 'error', role: 'alert', message: copy.consent.failed };
    case 'request_failed':
      return { tone: 'error', role: 'alert', message: copy.exportAction.failed };
    case 'degraded':
      return {
        tone: 'error',
        role: 'alert',
        title: copy.errorHeading,
        message: copy.errorBody,
      };
    default:
      return null;
  }
}
