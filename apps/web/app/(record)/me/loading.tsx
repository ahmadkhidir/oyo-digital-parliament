/**
 * My Record's loading state (`screens/13-my-record.md`: a skeleton for the profile and the
 * submission list).
 *
 * The page resolves the session and the record before it renders, so this boundary is the
 * fetch-level state the framework can distinguish. It carries the localized loading sentence in a
 * live region and no invented copy; the skeleton blocks are decorative and hidden from assistive
 * technology, which hears the label alone.
 */
import { getMessages } from '../../../messages';
import { resolveLocale } from '../../../lib/i18n/locale';

export default async function MyRecordLoading() {
  const copy = getMessages(await resolveLocale()).myRecord;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-xl px-lg py-xl">
      <div role="status" className="flex flex-col gap-sm border-b border-border pb-md">
        <span className="text-body text-text-secondary">{copy.loadingLabel}</span>
      </div>
      <div aria-hidden="true" className="flex flex-col gap-md">
        <div className="h-xl w-2xl rounded-sm bg-surface-secondary" />
        <div className="h-button w-full rounded-sm bg-surface-secondary" />
        <div className="h-button w-full rounded-sm bg-surface-secondary" />
        <div className="h-button w-full rounded-sm bg-surface-secondary" />
      </div>
      <div aria-hidden="true" className="flex flex-col gap-sm">
        <div className="h-button w-xl rounded-sm bg-surface-secondary" />
        <div className="h-button w-full rounded-sm bg-surface-secondary" />
        <div className="h-button w-full rounded-sm bg-surface-secondary" />
      </div>
    </div>
  );
}
