/**
 * `FEAT-012` — data rights and the non-use constraint, through `screens/13-my-record.md` against
 * `C-032` to `C-036`.
 *
 * The flows prove the member sees every field held about them, grants and withdraws a consent, asks
 * for an export and a deletion, and corrects their own details. The staff side of the export is
 * `staff-data-request.spec.ts`, where the operator works the request the member files.
 */
import { expect, test, type Page } from '@playwright/test';

import { expectAccessible } from './support/a11y';
import { registerResident, resident } from './support/member';

/**
 * Open one native disclosure and leave it open.
 *
 * The screens use `<details>` for their accordions; a click toggles, so a click that lands while a
 * redirect is still settling can close what it meant to open. This asserts the open state instead
 * of assuming the toggle's direction.
 *
 * @param page - The page holding the disclosure.
 * @param label - The disclosure's summary text.
 * @returns The disclosure's locator.
 */
async function openDisclosure(page: Page, label: string) {
  const details = page.locator('details').filter({ hasText: label }).first();
  await details.evaluate((element) => {
    (element as HTMLDetailsElement).open = true;
  });
  await expect(details).toHaveJSProperty('open', true);
  return details;
}

test.describe('FEAT-012 data rights', () => {
  test('@a11y screens/13: every field held is shown to the member in plain language', async ({
    page,
  }) => {
    const person = resident();
    await registerResident(page, person);
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: 'My Record', exact: true })).toBeVisible();
    await expectAccessible(page, '/me populated (en-NG)');

    const held = await openDisclosure(page, 'What is held about me');
    await expect(held.getByText('Full name', { exact: true })).toBeVisible();
    await expect(held.getByText(person.fullName, { exact: true })).toBeVisible();
    // The telephone number is shown to its owner in full; nothing else on the record does that.
    await expect(
      held.getByText(`+234${person.telephone.replace(/^0/, '')}`, { exact: true }),
    ).toBeVisible();
    await expect(held.getByText(String(person.age), { exact: true })).toBeVisible();
  });

  test('screens/13: a consent is granted and withdrawn from the member’s own record', async ({
    page,
  }) => {
    const person = resident();
    await registerResident(page, person);
    await page.goto('/me');

    const consent = await openDisclosure(page, 'Consent records');
    const purposes = (label: string) =>
      consent.getByLabel(label, { exact: true }).locator('xpath=ancestor::form');
    const toggle = consent.getByLabel('Allow Assisted recording', { exact: true });
    await expect(toggle).not.toBeChecked();
    await toggle.check();
    await purposes('Allow Assisted recording')
      .getByRole('button', { name: 'Save consent', exact: true })
      .click();
    await expect(page).toHaveURL(/\/me\?st=consent_saved$/);
    await expect(
      page.getByText('Your consent is saved and applies from now.', { exact: true }),
    ).toBeVisible();

    // Withdrawing takes effect on the next save and is visible on the record. A fresh read of the
    // screen settles the action's navigation before the accordion is opened.
    await page.goto('/me');
    const reopened = await openDisclosure(page, 'Consent records');
    const grant = reopened.getByLabel('Allow Assisted recording', { exact: true });
    await expect(grant).toBeChecked();
    await grant.uncheck();
    await grant
      .locator('xpath=ancestor::form')
      .getByRole('button', { name: 'Save consent', exact: true })
      .click();
    await expect(page).toHaveURL(/\/me\?st=consent_saved$/);

    await page.goto('/me');
    const withdrawn = await openDisclosure(page, 'Consent records');
    await expect(
      withdrawn.getByLabel('Allow Assisted recording', { exact: true }),
    ).not.toBeChecked();
    await expect(withdrawn.getByText('Withdrawn', { exact: false }).first()).toBeVisible();
  });

  test('screens/13: a deletion is requested and the confirmations stay open to the member', async ({
    page,
  }) => {
    const person = resident();
    await registerResident(page, person);
    await page.goto('/me');

    const deletion = await openDisclosure(page, 'Delete my account');
    await deletion.getByRole('button', { name: 'Request deletion', exact: true }).click();

    await expect(page).toHaveURL(/\/me\?st=deletion_requested$/);
    await expect(
      page.getByText(
        'Your deletion is requested. Your direct identifiers are removed within thirty days.',
        { exact: true },
      ),
    ).toBeVisible();
    // Once a deletion is open the panel states it rather than offering a second request.
    await expect(page.getByText('Deletion in progress', { exact: true })).toBeVisible();
  });

  test('screens/13: a display name is corrected and the change is recorded', async ({ page }) => {
    const person = resident();
    await registerResident(page, person);
    await page.goto('/me');

    const correction = await openDisclosure(page, 'Correct my details');
    const corrected = `${person.displayName} Jr`;
    await correction.getByLabel('Display name', { exact: true }).fill(corrected);
    await correction.getByRole('button', { name: 'Save changes', exact: true }).click();

    await expect(page).toHaveURL(/\/me\?st=details_saved/);
    await expect(page.getByText('Your details are saved.', { exact: true })).toBeVisible();
    await expect(page.getByText(corrected, { exact: true }).first()).toBeVisible();
  });
});
