/**
 * The interface-copy catalogues (`apps/web/AGENTS.md`: "All interface strings resolve from
 * `messages/` for en-NG and yo-NG"). The two launch locales are typed against the same shape, so
 * a key that exists in one and not the other fails the typecheck before it fails a reader.
 */
import { enNG, type Messages } from './en-NG';
import { yoNG } from './yo-NG';

/** The locales `Member.locale` and `PendingRegistration.locale` admit (`C-001`). */
export const LAUNCH_LOCALES = ['en-NG', 'yo-NG'] as const;
export type LaunchLocale = (typeof LAUNCH_LOCALES)[number];

/** The complete copy for one locale. */
export interface Catalogue {
  readonly 'en-NG': Messages;
  readonly 'yo-NG': Messages;
}

export const catalogues: Catalogue = {
  'en-NG': enNG,
  'yo-NG': yoNG,
};

/**
 * The catalogue for one locale.
 *
 * The locale is resolved before this is called, so an unknown value cannot reach it; the fallback
 * exists so a defensive caller still renders rather than throwing.
 */
export function getMessages(locale: LaunchLocale): Messages {
  return catalogues[locale] ?? catalogues['en-NG'];
}

export type { Messages };
