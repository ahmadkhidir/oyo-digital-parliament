/**
 * Locale-aware formatting and placeholder substitution for interface copy (`apps/web/AGENTS.md`
 * Discipline: dates, numbers and currency go through locale formatting; no concatenated sentences).
 *
 * The web layer is the one place `Intl` is allowed: `packages/ui` renders copy it is handed, and
 * these helpers hand it formatted values. Timestamps render in Africa/Lagos (`C-001`: calendar
 * dates are interpreted there), durations go through plural templates, and a catalogue sentence is
 * filled by substitution — never by joining fragments.
 *
 * This module imports no catalogue, so a client component may format a live value (a countdown)
 * without shipping every screen's copy; the templates it needs arrive as arguments.
 */
import type { LaunchLocale } from '../../messages';

/** The timezone `C-001` fixes for calendar rendering. */
const LAGOS_TIME_ZONE = 'Africa/Lagos';

/** The four wait wordings a duration sentence needs, from the caller's catalogue. */
export interface WaitTemplates {
  readonly seconds: string;
  readonly oneSecond: string;
  readonly minutes: string;
  readonly oneMinute: string;
}

/**
 * Substitutes `{name}` placeholders in a catalogue sentence.
 *
 * The values are already formatted by the caller; this only places them. A missing value is left
 * visible rather than silently dropped, so a broken call site fails review instead of readers.
 */
export function interpolate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => {
    const value = values[key];
    return value === undefined ? whole : String(value);
  });
}

/** The plural category the runtime selects for this locale and count. */
function pluralCategory(locale: LaunchLocale, count: number): Intl.LDMLPluralRule {
  try {
    return new Intl.PluralRules(locale).select(count);
  } catch {
    // An unknown locale identifier must not stop a sentence from rendering.
    return count === 1 ? 'one' : 'other';
  }
}

/**
 * Renders a wait duration from a whole number of seconds (`C-001` `retryAfterSeconds`, the resend
 * cooldown and the attempt cooldown).
 *
 * Under a minute the count is exact in seconds; above it the sentence rounds up to whole minutes,
 * because a resident is not counting seconds on a clock. Both wordings come from the templates,
 * selected through the locale's plural rules.
 */
export function formatWait(
  templates: WaitTemplates,
  locale: LaunchLocale,
  seconds: number,
): string {
  const whole = Math.max(0, Math.ceil(seconds));
  if (whole <= 0) return templates.oneSecond;
  if (whole < 60) {
    const template =
      pluralCategory(locale, whole) === 'one' ? templates.oneSecond : templates.seconds;
    return interpolate(template, { seconds: whole });
  }
  const minutes = Math.ceil(whole / 60);
  const template =
    pluralCategory(locale, minutes) === 'one' ? templates.oneMinute : templates.minutes;
  return interpolate(template, { minutes });
}

/** The first whole minute at or above a second count. */
export function waitMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(Math.max(0, seconds) / 60));
}

/**
 * Renders a `C-001` instant for reading: the Lagos wall-clock date and time, in the locale's own
 * formatting. Used where a screen shows a held record's expiry; never for an identifier or a
 * counter.
 */
export function formatInstant(locale: LaunchLocale, instant: string): string {
  const parsed = Date.parse(instant);
  if (!Number.isFinite(parsed)) return instant;
  // `Intl` supplies both the words and the ordering per locale; no date pattern is stored here.
  return new Intl.DateTimeFormat(locale, {
    timeZone: LAGOS_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}
