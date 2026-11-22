/**
 * The account summary, the "what is held" accordion and the correction forms
 * (`screens/13-my-record.md`, `C-032`, `C-033`, `NFR-040`).
 *
 * The summary names the public name and the private fields in plain language, and the accordion
 * repeats every field the platform holds — the access right is the page itself, not a request.
 * The correction form is a plain form post: it works with scripting disabled, and a refused save
 * re-renders with the echoed values and the field's own sentence under its control.
 */
import type { ReactNode } from 'react';
import { Button, focusRingClasses } from '@odp/ui';
import type { MyRecord } from '@odp/domain';
import type { LaunchLocale, Messages } from '../../../../messages';
import { formatRecordDate } from '../_lib/dates';
import { correctionErrorWord } from '../_lib/forms';
import type { RecordEcho } from '../_lib/echo';
import { RecordField } from './field';

export interface AccountPanelProps {
  readonly copy: Messages['myRecord'];
  readonly locale: LaunchLocale;
  readonly member: MyRecord['member'];
  /** The recorded ward's name, or `null` when the member has none or it cannot be read. */
  readonly wardName: string | null;
  /** The echoed values and field reasons of a refused save, when one is being re-rendered. */
  readonly echo: RecordEcho | null;
  /** The opaque key this render mints for the correction form's echo. */
  readonly echoKey: string;
  /** The single `C-033` action the correction form and the language switch post to. */
  readonly action: (formData: FormData) => Promise<void>;
  /** The two launch languages' names, from the footer's own catalogue entries. */
  readonly languages: Messages['footer']['languages'];
  readonly consentCount: number;
  readonly submissionCount: number;
  readonly backingCount: number;
  readonly requestCount: number;
  readonly heldItemCount: number;
}

/** One labelled value in the account summary. */
function SummaryRow({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col gap-xs border-b border-border py-sm tablet:flex-row tablet:gap-md">
      <dt className="text-small text-text-secondary tablet:w-2xl tablet:shrink-0">{label}</dt>
      <dd className="text-body text-text-primary">{children}</dd>
    </div>
  );
}

export function AccountPanel({
  copy,
  locale,
  member,
  wardName,
  echo,
  echoKey,
  action,
  languages,
  consentCount,
  submissionCount,
  backingCount,
  requestCount,
  heldItemCount,
}: AccountPanelProps): ReactNode {
  const displayNameError =
    echo?.fields['displayName'] === undefined
      ? undefined
      : correctionErrorWord(copy, 'displayName', echo.fields['displayName']);
  const fullNameError =
    echo?.fields['fullName'] === undefined
      ? undefined
      : correctionErrorWord(copy, 'fullName', echo.fields['fullName']);
  const languageError =
    echo?.fields['locale'] === undefined
      ? undefined
      : correctionErrorWord(copy, 'locale', echo.fields['locale']);

  const languageOptions = [
    { value: 'en-NG', label: languages['en-NG'] },
    { value: 'yo-NG', label: languages['yo-NG'] },
  ] as const;

  return (
    <section aria-labelledby="account-heading" className="flex flex-col gap-md">
      <h2 id="account-heading" className="text-h2 text-text-primary">
        {copy.accountHeading}
      </h2>
      <p className="max-w-prose text-body text-text-secondary">{copy.accountIntro}</p>

      <dl className="flex flex-col">
        <SummaryRow label={copy.fields.displayName}>{member.displayName}</SummaryRow>
        <SummaryRow label={copy.identityStateLabel}>
          {copy.identityStates[member.identityState]}
        </SummaryRow>
        <SummaryRow label={copy.wardLabel}>
          {wardName ?? copy.wardUnresolved}
          {member.wardStatus === 'resolved' ? null : (
            <>
              {' '}
              <a
                href="/join/ward"
                className={`inline-flex min-h-button items-center text-primary-500 underline underline-offset-2 ${focusRingClasses}`}
              >
                {copy.wardConfirm}
              </a>
            </>
          )}
        </SummaryRow>
        <SummaryRow label={copy.memberSinceLabel}>
          {formatRecordDate(locale, member.createdAt)}
        </SummaryRow>
      </dl>

      {/* Every field held, in plain language (`screens/13` — What is held about me). */}
      <details className="rounded-md border border-border">
        <summary
          className={`flex min-h-button cursor-pointer items-center px-md py-sm text-body-strong text-text-primary ${focusRingClasses}`}
        >
          {copy.heldSummary}
        </summary>
        <div className="flex flex-col gap-sm border-t border-border px-md py-md">
          <p className="max-w-prose text-small text-text-secondary">{copy.heldHint}</p>
          <dl className="flex flex-col">
            <SummaryRow label={copy.fields.fullName}>{member.fullName}</SummaryRow>
            <SummaryRow label={copy.fields.telephoneNumber}>{member.telephoneNumber}</SummaryRow>
            <SummaryRow label={copy.fields.declaredAge}>{String(member.declaredAge)}</SummaryRow>
            <SummaryRow label={copy.fields.language}>
              {languageOptions.find((option) => option.value === member.locale)?.label ??
                member.locale}
            </SummaryRow>
            <SummaryRow label={copy.fields.consents}>{String(consentCount)}</SummaryRow>
            <SummaryRow label={copy.fields.submissions}>{String(submissionCount)}</SummaryRow>
            <SummaryRow label={copy.fields.backings}>{String(backingCount)}</SummaryRow>
            <SummaryRow label={copy.fields.requests}>{String(requestCount)}</SummaryRow>
            <SummaryRow label={copy.fields.heldItems}>{String(heldItemCount)}</SummaryRow>
          </dl>
        </div>
      </details>

      {/* Corrections (`C-033`). */}
      <details className="rounded-md border border-border">
        <summary
          className={`flex min-h-button cursor-pointer items-center px-md py-sm text-body-strong text-text-primary ${focusRingClasses}`}
        >
          {copy.correction.summary}
        </summary>
        <div className="flex flex-col gap-md border-t border-border px-md py-md">
          <p className="max-w-prose text-small text-text-secondary">{copy.correction.hint}</p>
          <form action={action} className="flex flex-col gap-md">
            <input type="hidden" name="echoKey" value={echoKey} />
            <RecordField
              id="correct-display-name"
              label={copy.correction.displayNameLabel}
              hint={copy.correction.displayNameHint}
              input={{
                name: 'displayName',
                defaultValue: echo?.displayName ?? member.displayName,
                maxLength: 60,
                required: true,
                autoComplete: 'nickname',
              }}
              {...(displayNameError === undefined ? {} : { error: displayNameError })}
            />
            <RecordField
              id="correct-full-name"
              label={copy.correction.fullNameLabel}
              hint={copy.correction.fullNameHint}
              input={{
                name: 'fullName',
                defaultValue: echo?.fullName ?? member.fullName,
                maxLength: 160,
                required: true,
                autoComplete: 'name',
              }}
              {...(fullNameError === undefined ? {} : { error: fullNameError })}
            />
            <div className="flex flex-col gap-xs">
              <label htmlFor="correct-locale" className="text-body text-text-primary">
                {copy.correction.languageLabel}
              </label>
              <select
                id="correct-locale"
                name="locale"
                defaultValue={echo?.locale ?? member.locale}
                aria-describedby={languageError === undefined ? undefined : 'correct-locale-error'}
                className={`h-input rounded-md border border-border bg-surface px-sm text-body text-text-primary ${focusRingClasses}`}
              >
                {languageOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {languageError === undefined ? null : (
                <p id="correct-locale-error" role="alert" className="text-small text-error-500">
                  {languageError}
                </p>
              )}
            </div>
            <div>
              <Button type="submit" variant="primary">
                {copy.correction.save}
              </Button>
            </div>
          </form>
        </div>
      </details>

      {/* The account's language preference, writable on its own (`C-033`). */}
      <form action={action} className="flex flex-wrap items-end gap-sm">
        <input type="hidden" name="intent" value="language" />
        <input type="hidden" name="echoKey" value={echoKey} />
        <div className="flex flex-col gap-xs">
          <label htmlFor="account-locale" className="text-small text-text-primary">
            {copy.language.label}
          </label>
          <select
            id="account-locale"
            name="locale"
            defaultValue={member.locale}
            className={`h-input rounded-md border border-border bg-surface px-sm text-body text-text-primary ${focusRingClasses}`}
          >
            {languageOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          {copy.language.save}
        </Button>
      </form>
    </section>
  );
}
