/**
 * Date rendering for the member's own surface (`C-001` calendar, `docs` `nfr.md` Data lifecycle).
 *
 * Every instant the screen shows is a calendar date in Africa/Lagos, written through `Intl` so the
 * locale chooses the ordering and the words. The screen never stores a date pattern.
 */
import type { LaunchLocale } from '../../../../messages';

/** The timezone `C-001` fixes for calendar rendering. */
const LAGOS_TIME_ZONE = 'Africa/Lagos';

/**
 * Renders one `C-001` instant as a calendar date.
 *
 * @param locale - The member's locale, so the ordering and month name are theirs.
 * @param instant - The UTC instant the record carries.
 * @returns The date, or the untouched value when it cannot be parsed.
 */
export function formatRecordDate(locale: LaunchLocale, instant: string): string {
  const parsed = Date.parse(instant);
  if (!Number.isFinite(parsed)) return instant;
  return new Intl.DateTimeFormat(locale, {
    timeZone: LAGOS_TIME_ZONE,
    dateStyle: 'medium',
  }).format(parsed);
}
