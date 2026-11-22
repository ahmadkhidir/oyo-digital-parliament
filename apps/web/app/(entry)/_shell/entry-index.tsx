/**
 * The entry register's index (`screens.md` Navigation Map; `screens/02`, `screens/03`,
 * `screens/04` entry and exit points).
 *
 * The three entry screens are leaves of one register, and a visitor should be able to see where
 * they are and step back without hunting. The index is the record's own device: numbered entries,
 * a rule per entry, the current entry marked by weight and a filled rule rather than by colour
 * alone (`branding.md`, Accessibility: state is never carried by colour).
 *
 * It is an ordered list of navigation choices, not a progress bar: an entry with an address is a
 * link, an entry that is not reachable yet has no address, and the current entry carries
 * `aria-current="step"`. The number is decorative - the label states the entry - so it is hidden
 * from the accessibility tree. Every label arrives already translated; the component chooses no
 * words.
 */
import type { ReactNode } from 'react';
import { focusRingClasses } from '@odp/ui';

/** One entry of the register: where it leads, what it is called and whether it is current. */
export interface EntryIndexItem {
  /** Stable key for the list. */
  id: string;
  /** The entry's translated name. */
  label: string;
  /** Present when the entry may be opened from here. */
  href?: string;
  /** The entry the visitor is standing on. */
  current?: boolean;
}

export interface EntryIndexProps {
  items: readonly EntryIndexItem[];
}

export function EntryIndex({ items }: EntryIndexProps): ReactNode {
  return (
    <ol className="grid grid-cols-2 gap-sm desktop:flex desktop:flex-col desktop:gap-0">
      {items.map((item, position) => {
        // Zero-padded ordinal, in the register's handwriting. Numeric only: no copy.
        const ordinal = String(position + 1).padStart(2, '0');
        const labelClasses = [
          'text-small leading-snug',
          item.current === true ? 'text-body-strong text-text-primary' : 'text-text-secondary',
        ].join(' ');
        const ruleClasses = item.current === true ? 'border-primary-500' : 'border-border';

        const body = (
          <>
            <span
              aria-hidden="true"
              className="block font-display text-caption tabular-nums text-text-secondary"
            >
              {ordinal}
            </span>
            <span className={labelClasses}>{item.label}</span>
          </>
        );

        return (
          <li
            key={item.id}
            className={[
              'flex min-w-0 flex-col gap-xs border-t-2 pt-sm',
              'desktop:flex-none desktop:flex-row desktop:items-baseline desktop:gap-sm desktop:border-t-0 desktop:border-s-2 desktop:py-sm desktop:ps-md desktop:pt-0',
              ruleClasses,
            ].join(' ')}
          >
            {item.href === undefined ? (
              <span
                {...(item.current === true ? { 'aria-current': 'step' as const } : {})}
                className="flex flex-col desktop:flex-row desktop:items-baseline desktop:gap-sm"
              >
                {body}
              </span>
            ) : (
              <a
                href={item.href}
                className={`flex flex-col rounded-sm hover:underline desktop:flex-row desktop:items-baseline desktop:gap-sm ${focusRingClasses}`}
              >
                {body}
              </a>
            )}
          </li>
        );
      })}
    </ol>
  );
}
