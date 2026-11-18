/**
 * The one-time-code message, in both launch locales (`FEAT-001`, `NFR-004`, `NFR-044`).
 *
 * The body is written here rather than in a use case because the adapter is the only thing that ever
 * sees the digits. It states the code, how long it lives, and what to do if the message was not asked
 * for; it does not advertise the campaign, and it never names the resident.
 *
 * `branding.md` sets the voice: direct and specific, no superlative, no slogan. Yoruba is a launch
 * locale, so the message is written in Yoruba rather than translated word for word from English.
 *
 * @module adapters/session/messages
 */
import type { Locale } from '../../../../domain/src/identity/entities.ts';

/** What the renderer needs. The code is the only variable, and it never leaves this call. */
export interface VerificationCodeMessageInput {
  readonly locale: Locale;
  /** The six digits just issued. */
  readonly code: string;
  /** The configured lifetime, so the message and the store cannot disagree. */
  readonly expiresInMinutes: number;
}

/**
 * Render the code message for one locale.
 *
 * @param input - The locale, the digits and the lifetime.
 * @returns The message body. It is delivered and then discarded; nothing logs it.
 */
export function renderVerificationCodeMessage(input: VerificationCodeMessageInput): string {
  const { code, expiresInMinutes } = input;

  if (input.locale === 'yo-NG') {
    return (
      `Kóòdù Oyo Digital Parliament rẹ ni ${code}. ` +
      `Yóò pàrẹ́ lẹ́yìn ìṣẹ́jú ${expiresInMinutes}. ` +
      `Tí ìwọ kò bá béèrè fún un, pa ìfiránṣẹ́ yìí tì.`
    );
  }

  return (
    `Your Oyo Digital Parliament code is ${code}. ` +
    `It expires in ${expiresInMinutes} minutes. ` +
    `If you did not ask for it, ignore this message.`
  );
}
