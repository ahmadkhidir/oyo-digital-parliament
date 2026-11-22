/**
 * Record Footer - `docs/OyoDigitalParliament/screens.md`, Component Library: Footer.
 *
 * The record's colophon. It carries the campaign disclosure, the record links, the privacy
 * notice, the published contact address, the data-rights link and the language switch, and it
 * stays the same on every screen so the record closes in the same voice everywhere.
 *
 * Composition: the disclosure leads on the left as the statement of what the product is, the
 * record links sit under it as the register's contents, and the language switch closes the block
 * on the right. On a phone the same parts stack in that order; nothing is moved into a menu,
 * because a record destination must never be reachable only by a typed address.
 *
 * The language switch is a form, not a widget: a native select and an apply button, so the
 * choice submits with scripting disabled. The action is the caller's - a route address (posted)
 * or a server action - and this component owns neither the write nor the sentence. An anonymous
 * visitor's choice is held for the session and applied to the pending registration
 * (`screens.md`, Footer note); that policy lives above this package.
 *
 * Every link meets the mobile touch minimum through its row height, and every visible string
 * arrives already translated.
 */
import type { ReactNode } from 'react';
import { Button } from '../../primitives/button/Button';
import { focusRingClasses } from '../../primitives/focus-ring';

/** One resolved link: the caller owns the copy and the address. */
export interface FooterLink {
  href: string;
  label: string;
}

export interface LanguageSwitchProps {
  /** The select's `id`, from the caller's view, so the visible label binds to it. */
  id: string;
  /** The field name submitted with the form. */
  name: string;
  /** The switch's visible label. */
  legend: string;
  /** A route address the form posts to, or the application's server action. */
  action: string | ((formData: FormData) => void | Promise<void>);
  /** The locale currently in force. */
  currentValue: string;
  /** The two launch locales as value/label pairs, already translated. */
  options: readonly { value: string; label: string }[];
  /** The apply button's word, for the no-scripting submit path. */
  submitLabel: string;
}

export interface RecordFooterProps {
  /** The campaign disclosure, translated: the platform is a campaign instrument, not a government body. */
  disclosure: ReactNode;
  /** Accessible name for the record-links group. */
  navLabel: string;
  /** The record links: commitment register, ledger, ward report, report card, sessions, My Record. */
  recordLinks: readonly FooterLink[];
  privacy: FooterLink;
  /** The published contact address; it leaves the record, so the caller may mark it in its label. */
  contact: FooterLink;
  /** My Record, for consent and data requests. */
  dataRights: FooterLink;
  languageSwitch: LanguageSwitchProps;
}

const linkClasses = `inline-flex min-h-button items-center text-small text-primary-500 underline underline-offset-2 hover:text-primary-700 ${focusRingClasses}`;

export function RecordFooter({
  disclosure,
  navLabel,
  recordLinks,
  privacy,
  contact,
  dataRights,
  languageSwitch,
}: RecordFooterProps) {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-lg px-lg py-xl desktop:grid desktop:grid-cols-3 desktop:gap-2xl desktop:py-2xl">
        <div className="flex flex-col gap-md desktop:col-span-2">
          <p className="max-w-2xl text-small text-text-secondary">{disclosure}</p>

          <nav aria-label={navLabel} className="flex flex-col gap-xs">
            <p className="text-caption text-text-secondary">{navLabel}</p>
            <ul className="flex flex-wrap gap-x-lg">
              {recordLinks.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={linkClasses}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <ul className="flex flex-wrap gap-x-lg border-t border-border pt-sm">
            <li>
              <a href={privacy.href} className={linkClasses}>
                {privacy.label}
              </a>
            </li>
            <li>
              <a href={contact.href} className={linkClasses}>
                {contact.label}
              </a>
            </li>
            <li>
              <a href={dataRights.href} className={linkClasses}>
                {dataRights.label}
              </a>
            </li>
          </ul>
        </div>

        {/* Language switch: label, select, apply - a plain form, working without scripting. */}
        <form
          action={languageSwitch.action}
          method={typeof languageSwitch.action === 'string' ? 'post' : undefined}
          className="flex flex-wrap items-end gap-sm desktop:content-start"
        >
          <div className="flex flex-col gap-xs">
            <label htmlFor={languageSwitch.id} className="text-small text-text-primary">
              {languageSwitch.legend}
            </label>
            <select
              id={languageSwitch.id}
              name={languageSwitch.name}
              defaultValue={languageSwitch.currentValue}
              className={`h-input rounded-md border border-border bg-surface px-sm text-body text-text-primary ${focusRingClasses}`}
            >
              {languageSwitch.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" type="submit">
            {languageSwitch.submitLabel}
          </Button>
        </form>
      </div>
    </footer>
  );
}
