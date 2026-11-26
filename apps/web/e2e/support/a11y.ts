/**
 * The accessibility bar the browser flows enforce (`NFR-044`, `apps/web/AGENTS.md` Checks).
 *
 * "Every shipped page and state meets all Level A and AA success criteria" is asserted at the bar
 * the area manual sets for automated checks: no serious or critical violation. Axe cannot judge a
 * reading order or a screen reader's experience, so the flows also walk the keyboard path where a
 * screen declares one; the manual audit remains the launch gate (`nfr.md` Measurement).
 *
 * A violation is reported with its rule, its impact and the selector axe found, so a failure names
 * the control rather than a count.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** The WCAG 2.2 Level A and AA tags axe understands; 2.1 is included because 2.2 layers on it. */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Assert a rendered screen carries no serious or critical accessibility violation.
 *
 * @param page - The page to scan, in the state whose criteria are under test.
 * @param context - What is being scanned, for the failure message.
 */
export async function expectAccessible(page: Page, context: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );
  const summary = blocking.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.flatMap((node) => node.target),
  }));
  expect(blocking, `${context}: ${JSON.stringify(summary, null, 2)}`).toHaveLength(0);
}
