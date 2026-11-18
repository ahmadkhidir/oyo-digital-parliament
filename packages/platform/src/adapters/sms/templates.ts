/**
 * The notification message copy, in both launch locales (`C-076`, `NFR-044`).
 *
 * The boundary decides *when* a notice goes and whether it is retried; this file decides what it says.
 * The copy lives beside the SMS adapter because the adapter is the only component that ever holds a
 * rendered body, and because `branding.md` sets one voice for everything the campaign sends: direct,
 * specific, no slogan, no superlative, and nothing that sounds like a form letter.
 *
 * Two rules are structural rather than editorial:
 *
 * - **A one-time code is not rendered here.** Its digits belong to the code store, which holds only a
 *   digest and can therefore produce the code at most once. {@link renderNotificationTemplate} returns
 *   `null` for `registration_code` and {@link createSmsNotificationBodies} takes the code body from its
 *   caller, so this module can never be the second place a code is minted.
 * - **No message quotes a person.** The bodies name the record's public reference, never a name, a
 *   ward description or a line the resident wrote. A notice that quoted a submission would put personal
 *   data into an SMS log at the gateway.
 *
 * Yoruba is a launch locale, so each body is written in Yoruba rather than translated word for word from
 * the English. Dates are rendered numerically in Lagos time so the two locales cannot disagree about one
 * instant.
 *
 * @module adapters/sms/templates
 */
import type { Locale } from '../../../../domain/src/identity/entities.ts';
import type {
  NotificationTemplate,
  OutboundNotification,
} from '../../../../domain/src/notifications/entities.ts';
import type { NotificationBodyPort } from '../../../../domain/src/notifications/ports.ts';
import { lagosDateTime } from '../../clock/calendar.ts';

/** What one body renderer needs: the template, the locale and the template's own values. */
export interface NotificationTemplateInput {
  readonly template: NotificationTemplate;
  readonly locale: Locale;
  readonly payload: Readonly<Record<string, string>>;
}

/** A public reference in `C-001` form, or `null` when the payload does not carry one. */
function publicReference(payload: Readonly<Record<string, string>>): string | null {
  const reference = payload['reference'];
  return reference !== undefined && /^ODP-[0-9]{6}$/.test(reference) ? reference : null;
}

/** `2026-12-01` and `10:00`, from the wire instant, in Lagos time. */
function lagosParts(instant: string): { date: string; time: string } | null {
  const parsed = new Date(instant);
  if (Number.isNaN(parsed.getTime())) return null;
  const rendered = lagosDateTime(parsed);
  return { date: rendered.slice(0, 10), time: rendered.slice(11, 16) };
}

const DECISION_BODIES = {
  'en-NG': {
    commit: (reference: string) =>
      `Oyo Digital Parliament: your proposal ${reference} has an answer. The campaign has committed to it. The commitment and its target date are on the public record.`,
    decline: (reference: string) =>
      `Oyo Digital Parliament: your proposal ${reference} has an answer. The campaign declined it, and the reason is published with it on the public record.`,
    refer: (reference: string) =>
      `Oyo Digital Parliament: your proposal ${reference} has been referred to another authority. The record names who has it and when an answer is due.`,
    other: (reference: string) =>
      `Oyo Digital Parliament: your proposal ${reference} has an answer. Read it on the public record.`,
  },
  'yo-NG': {
    commit: (reference: string) =>
      `Oyo Digital Parliament: ìdáhùn wà fún àbá rẹ ${reference}. Ìpolongo gbà á. Ìlérí náà àti ọjọ́ tí wọ́n fún un wà ní àkọsílẹ̀ gbogbo ènìyàn.`,
    decline: (reference: string) =>
      `Oyo Digital Parliament: ìdáhùn wà fún àbá rẹ ${reference}. Ìpolongo kọ̀ ọ́, a sì tẹ ìdí tí wọ́n fi kọ̀ ọ́ jáde pẹ̀lú rẹ̀.`,
    refer: (reference: string) =>
      `Oyo Digital Parliament: a ti fi àbá rẹ ${reference} ránṣẹ́ sí aláṣẹ mìíràn. Àkọsílẹ̀ sọ ẹni tí ó gbà á àti ìgbà tí ìdáhùn yóò dé.`,
    other: (reference: string) =>
      `Oyo Digital Parliament: ìdáhùn wà fún àbá rẹ ${reference}. Kà á ní àkọsílẹ̀ gbogbo ènìyàn.`,
  },
} as const;

/**
 * Render one notice body.
 *
 * @param input - The template, the member's locale and the values the queue stored for it.
 * @returns The body, or `null` when this module cannot produce it: a one-time code (whose digits belong
 *   to the code store) or a template whose required value is missing from the payload.
 */
export function renderNotificationTemplate(input: NotificationTemplateInput): string | null {
  const { template, locale, payload } = input;
  const yoruba = locale === 'yo-NG';

  switch (template) {
    case 'registration_code':
      // Deliberate: the digits are issued by the code store at send time, never rendered from a queue.
      return null;

    case 'decision_published': {
      const reference = publicReference(payload);
      if (reference === null) return null;
      const decisionType = payload['decisionType'];
      const bodies = DECISION_BODIES[locale];
      if (decisionType === 'commit') return bodies.commit(reference);
      if (decisionType === 'decline') return bodies.decline(reference);
      if (decisionType === 'refer') return bodies.refer(reference);
      return bodies.other(reference);
    }

    case 'appeal_decided': {
      const reference = publicReference(payload);
      if (reference === null) return null;
      return yoruba
        ? `Oyo Digital Parliament: a ti pinnu ẹjọ́ ìpejọ́ rẹ lórí ${reference}. Èsì rẹ̀ wà ní àkọsílẹ̀.`
        : `Oyo Digital Parliament: your appeal on ${reference} has been decided. The outcome is on the record.`;
    }

    case 'session_reminder': {
      const startsAt = payload['startsAt'];
      const parts = startsAt === undefined ? null : lagosParts(startsAt);
      if (parts === null) return null;
      return yoruba
        ? `Oyo Digital Parliament: ìpàdé tí o béèrè nípa rẹ̀ yóò bẹ̀rẹ̀ ní ${parts.date} ní ${parts.time} ní àkókò Èkó.`
        : `Oyo Digital Parliament: the session you asked about starts on ${parts.date} at ${parts.time} Lagos time.`;
    }

    case 'data_request_outcome':
      return yoruba
        ? 'Oyo Digital Parliament: a ti dáhùn ìbéèrè dátà rẹ. Wọlé sínú àkọsílẹ̀ rẹ kí o kà á.'
        : 'Oyo Digital Parliament: your data request has been answered. Sign in to your record to read the outcome.';

    default:
      return null;
  }
}

/** How the boundary's body port renders a one-time code; the code store supplies it. */
export type RegistrationCodeBody = (
  record: OutboundNotification,
) => Promise<string | null>;

/**
 * Build the body port the notification boundary uses.
 *
 * @param options - The renderer for one-time codes. It is the code store's job because the digits live
 *   there; every other template is rendered here.
 * @returns A `NotificationBodyPort` that answers `null` rather than an empty body when it cannot render.
 */
export function createSmsNotificationBodies(options: {
  readonly renderRegistrationCode: RegistrationCodeBody;
}): NotificationBodyPort {
  return {
    async render({ record, recipient }) {
      if (record.template === 'registration_code') {
        return options.renderRegistrationCode(record);
      }
      return renderNotificationTemplate({
        template: record.template,
        locale: recipient.locale,
        payload: record.payload,
      });
    },
  };
}
