/**
 * The staff flows the browser suite drives (`C-092`, `C-055` to `C-057`, `C-066`, `C-067`).
 *
 * A staff member signs in with the seeded username and the disposable password the fixture reset
 * writes, then finishes the `C-092` enrolment: the enrolment screen prints the TOTP secret once, the
 * helper computes the code an authenticator app would show, and the console opens. The recovery
 * codes are shown once and dismissed.
 */
import { expect, type Page } from '@playwright/test';

import { STAFF_PASSWORDS } from './environment';
import { totpCode } from './totp';

/** The two seeded accounts: their sign-in names and the roles they carry. */
export type StaffRole = 'operator' | 'response';

/** The seeded sign-in names (`packages/db/src/seeds/staff.ts`). */
const USERNAMES: Readonly<Record<StaffRole, string>> = {
  operator: 'operator',
  response: 'response',
};

/**
 * Read the base32 secret the enrolment screen printed.
 *
 * @param page - The second-factor screen, after "Set up the authenticator".
 * @returns The secret.
 * @throws Error when the card does not carry one, which means the screen is not in its enrolment
 *   state.
 */
async function readEnrolmentSecret(page: Page): Promise<string> {
  const card = page
    .getByRole('heading', { name: 'Add this secret to your authenticator', exact: true })
    .locator('..');
  const texts = await card.locator('p').allTextContents();
  const secret = texts.map((text) => text.trim()).find((text) => /^[A-Z2-7]{32}$/.test(text));
  if (secret === undefined) throw new Error('the enrolment screen printed no secret');
  return secret;
}

/**
 * Sign a seeded staff member in and satisfy the second factor, ending on `/admin`.
 *
 * @param page - The staff member's page, in its own browser context so no resident session leaks in.
 * @param role - Which seeded account signs in.
 */
export async function signInStaff(page: Page, role: StaffRole): Promise<void> {
  await page.goto('/staff/sign-in');
  await page.getByLabel('Username', { exact: true }).fill(USERNAMES[role]);
  await page.getByLabel('Password', { exact: true }).fill(STAFF_PASSWORDS[role]);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/2fa$/);

  // The fixture reset leaves the credential unenrolled, so the screen offers the one-time enrolment.
  const start = page.getByRole('button', { name: 'Set up the authenticator', exact: true });
  if (await start.count()) {
    await start.click();
    await expect(
      page.getByRole('heading', { name: 'Add this secret to your authenticator', exact: true }),
    ).toBeVisible();
  }

  const secret = await readEnrolmentSecret(page);
  await page.getByLabel('Six-digit code', { exact: true }).fill(totpCode(secret));
  await page.getByRole('button', { name: 'Finish enrolment', exact: true }).click();
  await expect(page).toHaveURL(/\/staff\/2fa\?enrolled=1$/);
  await page
    .getByRole('button', { name: 'I have saved the codes — open the console', exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin$/);
}
