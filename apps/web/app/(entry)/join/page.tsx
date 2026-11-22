/**
 * Registration Form - `docs/OyoDigitalParliament/screens/03-registration-form.md`, wired to
 * `C-002` (`apps/web/app/(entry)/join/actions.ts`).
 *
 * The screen states resolve on the server from the flow's cookies and the pending record:
 *
 * - **Default** - the statement, four empty fields, the send action.
 * - **Validation error** - each failing field named through the retry cookie's field reasons, the
 *   typed text kept (`screens/03`: "the typed text kept").
 * - **Submitting** - the client form's own state: button disabled, spinner, fields locked.
 * - **Delivery failed** - a held first dispatch (`C-002` 201 `delayed`): the inline message with
 *   the continue action, the form preserved, the pending registration kept for 24 hours.
 * - **Offline** - the client banner; the form is held and sends when the connection returns.
 *
 * A visitor returning with a live pending registration ("change number", or a closed tab) finds
 * the form as they left it, prefilled from the pending record they created.
 *
 * The page lays the statement before the fields, in the order the screen declares, and closes the
 * title row with the sign-in door for a resident who already has an account (`screens/03` exit
 * points).
 */
import type { Metadata } from 'next';
import { isPast, toIsoSeconds } from '@odp/domain';
import { getMessages } from '../../../messages';
import { resolveLocale } from '../../../lib/i18n/locale';
import { interpolate, formatWait } from '../../../lib/i18n/format';
import { getIdentityDependencies } from '../../../lib/identity/ports';
import {
  emptyJoinFormValues,
  readJoinPending,
  readJoinRetry,
  type JoinFormValues,
  type JoinRetryState,
} from '../../../lib/identity/join-cookies';
import { focusRingClasses } from '@odp/ui';
import { EntryIndex } from '../_shell/entry-index';
import { EntryScreen } from '../_shell/entry-screen';
import { JoinRegistrationForm, type RegistrationStatus } from './_shared/registration-form';
import { registerResidentAction } from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  return { title: getMessages(locale).join.title };
}

/** The sentence for one failing field, chosen from the catalogue by field and reason. */
function fieldErrorSentence(
  copy: ReturnType<typeof getMessages>['join'],
  field: string,
  reason: string,
): string | undefined {
  switch (field) {
    case 'fullName':
      return copy.fields.fullName.errors[reason as keyof typeof copy.fields.fullName.errors];
    case 'declaredAge':
      return copy.fields.declaredAge.errors[reason as keyof typeof copy.fields.declaredAge.errors];
    case 'telephoneNumber':
      return copy.fields.telephoneNumber.errors[
        reason as keyof typeof copy.fields.telephoneNumber.errors
      ];
    case 'displayName':
      return copy.fields.displayName.errors[reason as keyof typeof copy.fields.displayName.errors];
    default:
      return undefined;
  }
}

/** Reads the pending record a returning visitor holds, or `null` when it is gone or expired. */
async function pendingDefaults(pendingId: string): Promise<JoinFormValues | null> {
  const { ports } = await getIdentityDependencies();
  const pending = await ports.pendingRegistrations.findById(pendingId);
  if (pending === null) return null;
  if (isPast(pending.expiresAt, toIsoSeconds(ports.clock.now()))) return null;
  return {
    fullName: pending.fullName,
    declaredAge: String(pending.declaredAge),
    telephoneNumber: pending.telephoneNumber,
    displayName: pending.displayName,
  };
}

/** Builds the whole-attempt message from one failed attempt's status token. */
function statusOf(
  copy: ReturnType<typeof getMessages>['join'],
  wait: ReturnType<typeof getMessages>['wait'],
  locale: Awaited<ReturnType<typeof resolveLocale>>,
  retry: JoinRetryState,
) {
  switch (retry.status) {
    case 'ALREADY_REGISTERED':
      return {
        role: 'alert',
        tone: 'info',
        message: copy.alreadyRegistered,
        link: { href: '/sign-in', label: copy.signIn },
      } as const;
    case 'RATE_LIMITED':
      return {
        role: 'alert',
        tone: 'warning',
        message: interpolate(copy.rateLimited, {
          duration: formatWait(wait, locale, retry.retryAfterSeconds ?? 60),
        }),
      } as const;
    case 'DEGRADED':
      return { role: 'alert', tone: 'error', message: copy.degraded } as const;
    case 'REGISTRATION_EXPIRED':
      return { role: 'alert', tone: 'warning', message: copy.expiredRegistration } as const;
    default:
      return null;
  }
}

export default async function JoinPage() {
  const locale = await resolveLocale();
  const messages = getMessages(locale);
  const copy = messages.join;

  const pending = await readJoinPending();
  const retry = await readJoinRetry();

  // What the fields hold: a refused attempt keeps exactly what was typed; a returning visitor
  // with a live pending registration keeps the form they left; everyone else starts empty
  // (`screens/03` edge case: an abandoned form holds no number the visitor did not intend to give).
  const defaults =
    retry?.values ??
    (pending === null ? null : await pendingDefaults(pending.id)) ??
    emptyJoinFormValues();

  // The delivery-failed state outranks a refusal message: the registration exists, the code does
  // not, and the continue action leads to the screen that owns the resend.
  const delayed = pending !== null && pending.delayed;
  const status: RegistrationStatus | null = delayed
    ? {
        role: 'alert',
        tone: 'warning',
        heading: copy.deliveryDelayedHeading,
        message: copy.deliveryDelayedBody,
        link: { href: '/join/confirm', label: copy.deliveryDelayedContinue },
      }
    : retry === null
      ? pending === null
        ? null
        : { role: 'status', tone: 'info', message: copy.pendingNotice }
      : statusOf(copy, messages.wait, locale, retry);

  // Per-field failure sentences, mapped from the retry cookie's `C-001` reason tokens.
  const fieldErrors: Readonly<Record<string, string>> = retry?.fields ?? {};
  const sentenceFor = (field: keyof typeof copy.fields): string | undefined => {
    const reason = fieldErrors[field];
    return reason === undefined ? undefined : fieldErrorSentence(copy, field, reason);
  };
  const fields = {
    fullName: {
      label: copy.fields.fullName.label,
      hint: copy.fields.fullName.hint,
      error: sentenceFor('fullName'),
    },
    declaredAge: {
      label: copy.fields.declaredAge.label,
      hint: copy.fields.declaredAge.hint,
      error: sentenceFor('declaredAge'),
    },
    telephoneNumber: {
      label: copy.fields.telephoneNumber.label,
      hint: copy.fields.telephoneNumber.hint,
      error: sentenceFor('telephoneNumber'),
    },
    displayName: {
      label: copy.fields.displayName.label,
      hint: copy.fields.displayName.hint,
      error: sentenceFor('displayName'),
    },
  };

  // The summary names every failing field; the field's own sentence sits under its control.
  const failingFields = Object.keys(fieldErrors).filter(
    (field) => fields[field as keyof typeof fields]?.error !== undefined,
  );
  const summary =
    failingFields.length === 0
      ? null
      : {
          heading: copy.errorSummaryHeading,
          items: failingFields.map((field) => ({
            href: `#${field}`,
            label: fields[field as keyof typeof fields]?.label ?? field,
          })),
        };

  return (
    <EntryScreen
      title={copy.heading}
      tagline={messages.brand.tagline}
      disclosure={messages.footer.disclosure}
      index={
        <EntryIndex
          items={[
            { id: 'join', label: copy.heading, current: true },
            { id: 'confirm', label: messages.confirm.heading },
          ]}
        />
      }
      action={
        <a
          href="/sign-in"
          className={`inline-flex min-h-button items-center text-small text-primary-500 underline underline-offset-2 hover:text-primary-700 ${focusRingClasses}`}
        >
          {copy.signIn}
        </a>
      }
    >
      {/* The publication statement, before any field (`screens/03` Visual Focus). */}
      <section
        aria-labelledby="join-publication"
        className="rounded-md border border-primary-300 bg-primary-100 p-lg text-primary-900"
      >
        <h2 id="join-publication" className="font-display text-h3 text-primary-900">
          {copy.publicationHeading}
        </h2>
        <p className="mt-sm max-w-prose text-body">{copy.publicationBody}</p>
        <a
          href="/privacy"
          target="_blank"
          rel="noopener noreferrer"
          className={`mt-sm inline-flex min-h-button items-center gap-xs text-small text-primary-700 underline underline-offset-2 hover:no-underline ${focusRingClasses}`}
        >
          {copy.privacyLink}
          <span aria-hidden="true">&#8599;</span>
        </a>
      </section>

      {/* The eligibility panel: the band, and the policy it follows. */}
      <aside
        aria-label={copy.heading}
        className="max-w-prose border-s border-primary-300 ps-md text-small text-text-secondary"
      >
        {copy.eligibility}
      </aside>

      <JoinRegistrationForm
        action={registerResidentAction}
        defaults={defaults}
        copy={{
          offline: copy.offline,
          offlineSubmit: copy.offlineSubmit,
          sendCode: copy.sendCode,
          sending: copy.sending,
          optional: copy.fields.displayName.optional,
          fields,
          previewTyped: copy.displayNamePreviewTyped,
          previewBlank: copy.displayNamePreviewBlank,
        }}
        status={status}
        summary={summary}
      />
    </EntryScreen>
  );
}
