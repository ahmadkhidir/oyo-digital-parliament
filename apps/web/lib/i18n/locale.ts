/**
 * Locale resolution for the deployable (`C-001` Locale, screens.md Footer).
 *
 * An anonymous visitor's choice is held in a browser-session cookie and applied to the
 * PendingRegistration at `C-002`; after sign-in the member's own locale is authoritative and a
 * later task reads it from the session. The cookie carries no personal data — a locale enum
 * value only.
 */
import { cookies } from 'next/headers';
import { LAUNCH_LOCALES, type LaunchLocale } from '../../messages';

/** The anonymous visitor's language choice (`screens.md` Footer note). */
export const LOCALE_COOKIE = 'odp_locale';

/** Reads one locale value against the two launch locales. */
export function readLocaleValue(value: string | undefined): LaunchLocale | null {
  return value !== undefined && (LAUNCH_LOCALES as readonly string[]).includes(value)
    ? (value as LaunchLocale)
    : null;
}

/**
 * The locale in force for this request: the visitor's choice, or English when none was made.
 *
 * English is the documented default for an anonymous visitor with no stored choice; the footer's
 * language switch is how a reader changes it.
 */
export async function resolveLocale(): Promise<LaunchLocale> {
  const store = await cookies();
  return readLocaleValue(store.get(LOCALE_COOKIE)?.value) ?? 'en-NG';
}
