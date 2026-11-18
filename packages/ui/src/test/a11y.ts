/**
 * The shared axe helper (`packages/ui/AGENTS.md`, Accessibility check): run axe-core over one
 * rendered fixture under the WCAG 2.2 rule set (`NFR-044`) in a chosen token family and
 * locale, and assert zero violations.
 *
 * jsdom cannot compute real rendering, so axe reports its contrast rule as "incomplete" rather
 * than as a violation; the actual contrast of every declared pairing, in both columns, is
 * proven numerically in `src/tokens/source.test.ts`, and these components colour themselves
 * only through those pairings. The run here covers structure, roles, names, association and
 * keyboard-reachability. `data-theme` selects the family exactly as `theme.css` does.
 */
import axe from 'axe-core';
import { expect } from 'vitest';
import type { ColorMode } from '../tokens/source';

/** The WCAG 2.2 Level A and AA tags of axe-core (`NFR-044`). */
const RUN_ONLY = {
  type: 'tag' as const,
  values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'],
};

/**
 * Assert no accessibility violation on a rendered container.
 *
 * @param container the rendered fixture
 * @param mode the token family to run under, applied the way `theme.css` reads it
 * @param lang the fixture's locale, so the language attribute matches the copy under test
 */
export async function expectNoViolations(
  container: HTMLElement,
  mode: ColorMode = 'light',
  lang = 'en',
): Promise<void> {
  const root = document.documentElement;
  const previousTheme = root.getAttribute('data-theme');
  const previousLang = root.getAttribute('lang');
  root.setAttribute('data-theme', mode);
  root.setAttribute('lang', lang);
  try {
    const results = await axe.run(container, { runOnly: RUN_ONLY, resultTypes: ['violations'] });
    const reported = results.violations.map(
      (violation) =>
        `${violation.id} (${violation.impact}): ${violation.nodes
          .map((node) => node.target.join(' ') || node.html)
          .join('; ')}`,
    );
    expect(reported).toEqual([]);
  } finally {
    if (previousTheme === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', previousTheme);
    if (previousLang === null) root.removeAttribute('lang');
    else root.setAttribute('lang', previousLang);
  }
}
