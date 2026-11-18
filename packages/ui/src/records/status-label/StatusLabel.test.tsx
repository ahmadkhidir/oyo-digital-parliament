/**
 * Status label tests (`branding.md`, Component Tokens → Status labels; `NFR-044`).
 *
 * All ten statuses the register defines: the caller's word first in the DOM, the marker shape
 * hidden from the accessibility tree, the tone from the branding mapping, and the axe run in
 * both token families and both launch locales.
 */
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expectNoViolations } from '../../test/a11y';
import { statusLabels, type StatusKey } from '../../tokens/source';
import { StatusLabel } from './StatusLabel';

/** Fixture words in both launch locales, one per status key. */
const WORDS: Record<StatusKey, { en: string; yo: string }> = {
  'awaiting-decision': { en: 'Awaiting decision', yo: 'Ìdúró ìpinnu' },
  overdue: { en: 'Overdue', yo: 'Tó kọjá' },
  committed: { en: 'Committed', yo: 'Ìfọwọ́sí' },
  referred: { en: 'Referred', yo: 'Tí a fi ránsẹ́' },
  delivered: { en: 'Delivered', yo: 'Tí a ti fún' },
  slipped: { en: 'Slipped', yo: 'Ìṣeríjá' },
  dropped: { en: 'Dropped', yo: 'Tí a fi sílẹ̀' },
  declined: { en: 'Declined', yo: 'Ìkọ̀wọ́' },
  withdrawn: { en: 'Withdrawn', yo: 'Ìfihìn' },
  withheld: { en: 'Withheld', yo: 'Tí a dẹ́nù' },
};

const KEYS = Object.keys(statusLabels) as StatusKey[];

describe('StatusLabel', () => {
  it('renders the word first for every status the register defines', () => {
    for (const key of KEYS) {
      const word = WORDS[key].en;
      const { container, unmount } = render(<StatusLabel statusKey={key} word={word} />);
      // Word first: the text node precedes the marker in the DOM.
      expect(container.textContent?.indexOf(word)).toBeLessThan(
        container.innerHTML.indexOf('<svg'),
      );
      unmount();
    }
  });

  it('hides the marker from the accessibility tree for every status', () => {
    for (const key of KEYS) {
      const { container, unmount } = render(<StatusLabel statusKey={key} word={WORDS[key].en} />);
      const marker = container.querySelector('svg[aria-hidden="true"]');
      expect(marker).toBeInTheDocument();
      unmount();
    }
  });

  it('carries the branding tone for every status', () => {
    for (const key of KEYS) {
      const { container, unmount } = render(<StatusLabel statusKey={key} word={WORDS[key].en} />);
      const chip = container.firstElementChild as HTMLElement;
      // One row of the status-label table each, expressed as token classes.
      expect(chip.className).toMatch(/bg-(neutral|warning|info|success|error)-(100|300)/);
      expect(chip.className).toMatch(/text-(neutral|warning|info|success|error)-(700|900)/);
      unmount();
    }
  });

  it('gives the ten markers ten distinct shapes', () => {
    const shapes = new Set<string>();
    for (const key of KEYS) {
      const { container, unmount } = render(<StatusLabel statusKey={key} word={WORDS[key].en} />);
      shapes.add((container.querySelector('svg')?.innerHTML ?? '').trim());
      unmount();
    }
    // Shape separates the ten, so colour is never the encoding.
    expect(shapes.size).toBe(10);
  });

  it('passes axe in light and dark, in both launch locales (NFR-044)', async () => {
    for (const lang of ['en', 'yo'] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const { container, unmount } = render(
          <ul>
            {KEYS.map((key) => (
              <li key={key}>
                <StatusLabel statusKey={key} word={WORDS[key][lang]} />
              </li>
            ))}
          </ul>,
        );
        await expectNoViolations(container, mode, lang);
        unmount();
      }
    }
  });
});
