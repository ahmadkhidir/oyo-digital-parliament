/**
 * The consent records accordion and its one-purpose toggles (`C-034`, `FEAT-012`, `EVT-046`).
 *
 * Each optional purpose is a separate record with its own instant, and each toggle posts one
 * purpose to the one `C-034` action. The native checkbox carries a hidden `false` ahead of it, so
 * the form works without scripting and an unticked box still states an answer. Consent is never
 * bundled, never inferred and never required to keep the account.
 */
import type { ReactNode } from 'react';
import { Button, focusRingClasses } from '@odp/ui';
import { CONSENT_PURPOSE_VALUES, type MyRecordConsent } from '@odp/domain';
import { interpolate } from '../../../../lib/i18n/format';
import type { LaunchLocale, Messages } from '../../../../messages';
import { formatRecordDate } from '../_lib/dates';
import { consentStateWord } from '../_lib/forms';

export interface ConsentPanelProps {
  readonly copy: Messages['myRecord']['consent'];
  readonly locale: LaunchLocale;
  readonly consents: readonly MyRecordConsent[];
  /** The single `C-034` action every toggle posts to. */
  readonly action: (formData: FormData) => Promise<void>;
}

export function ConsentPanel({ copy, locale, consents, action }: ConsentPanelProps): ReactNode {
  return (
    <details className="rounded-md border border-border">
      <summary
        className={`flex min-h-button cursor-pointer items-center px-md py-sm text-body-strong text-text-primary ${focusRingClasses}`}
      >
        {copy.summary}
      </summary>
      <div className="flex flex-col gap-lg border-t border-border px-md py-md">
        <p className="max-w-prose text-small text-text-secondary">{copy.hint}</p>
        {CONSENT_PURPOSE_VALUES.map((purpose) => {
          const record = consents.find((consent) => consent.purpose === purpose) ?? null;
          const purposeCopy = copy.purposes[purpose];
          const state = consentStateWord(copy, record === null ? null : record.granted);
          return (
            <div
              key={purpose}
              className="flex flex-col gap-sm border-b border-border pb-md last:border-b-0 last:pb-0"
            >
              <div className="flex flex-col gap-xs">
                <p className="text-body-strong text-text-primary">{purposeCopy.label}</p>
                <p className="text-small text-text-secondary">{purposeCopy.description}</p>
                <p className="text-small text-text-primary">
                  {state}
                  {record === null ? null : (
                    <>
                      {' \u2014 '}
                      {record.withdrawnAt === null
                        ? interpolate(copy.recordedOn, {
                            date: formatRecordDate(locale, record.recordedAt),
                          })
                        : interpolate(copy.withdrawnOn, {
                            date: formatRecordDate(locale, record.withdrawnAt),
                          })}
                    </>
                  )}
                </p>
              </div>
              <form action={action} className="flex flex-wrap items-center gap-sm">
                <input type="hidden" name="purpose" value={purpose} />
                {/* A native checkbox sends nothing when clear; this states the answer either way. */}
                <input type="hidden" name="granted" value="false" />
                <label className="flex min-h-button items-center gap-sm text-body text-text-primary">
                  <input
                    type="checkbox"
                    name="granted"
                    value="true"
                    defaultChecked={record?.granted === true}
                    className={focusRingClasses}
                  />
                  {interpolate(copy.toggleLabel, { purpose: purposeCopy.label })}
                </label>
                <Button type="submit" variant="secondary">
                  {copy.save}
                </Button>
              </form>
            </div>
          );
        })}
      </div>
    </details>
  );
}
