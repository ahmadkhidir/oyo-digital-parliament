/**
 * Record Footer — `docs/OyoDigitalParliament/screens.md`, Shared / Common Components.
 *
 * One footer group: the campaign disclosure, the record links, the privacy notice, the
 * published contact address, the data-rights link and the language switch. The disclosure is
 * text and stays text — the platform states what it is in the same voice on every page.
 *
 * The language switch is a form, not a widget: a native select and an apply button, so the
 * choice submits with scripting disabled. The switch's action is the caller's — either a
 * route address (posted) or a server action the application passes in; this component owns
 * neither the write nor the sentence. An anonymous visitor's choice is held for the session
 * and applied to the pending registration (screens.md, Footer note) — that policy lives above
 * this package; here the current value is simply selected.
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

const linkClasses = `text-small text-primary-500 underline underline-offset-2 ${focusRingClasses}`;

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
    <footer className="border-t border-border bg-surface px-md py-2xl tablet:px-lg">
      <p className="text-small text-text-secondary">{disclosure}</p>

      <nav aria-label={navLabel} className="mt-lg">
        <ul className="flex flex-col gap-sm tablet:flex-row tablet:flex-wrap tablet:gap-lg">
          {recordLinks.map((link) => (
            <li key={link.href}>
              <a href={link.href} className={linkClasses}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ul className="mt-md flex flex-col gap-sm tablet:flex-row tablet:gap-lg">
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

      {/* Language switch: label, select, apply — a plain form, working without scripting. */}
      <form
        action={languageSwitch.action}
        method={typeof languageSwitch.action === 'string' ? 'post' : undefined}
        className="mt-lg flex flex-wrap items-end gap-sm"
      >
        <div className="flex items-center gap-sm">
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
    </footer>
  );
}
