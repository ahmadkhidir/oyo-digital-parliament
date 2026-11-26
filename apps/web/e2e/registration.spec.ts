/**
 * `FEAT-001` — member registration and identity tiers, through the screens that carry it:
 * `screens/03-registration-form.md` and `screens/04-number-confirmation.md`, against `C-002`,
 * `C-003` and `C-004`.
 *
 * The flows prove the acceptance criteria behaviourally: no account before the code is accepted, an
 * age outside the band refused with the reason stated, one number on at most one account, and the
 * wrong-code and resend states the screen declares.
 */
import { expect, test } from '@playwright/test';

import { expectAccessible } from './support/a11y';
import { registerResident, resident, submitRegistration, waitForCode } from './support/member';

test.describe('FEAT-001 registration and number confirmation', () => {
  test('screens/03: an age outside the band is refused with the band stated and the typed text kept', async ({
    page,
  }) => {
    const person = resident({ age: 41 });
    await submitRegistration(page, person);
    // The age control carries the browser's own band constraint, so a typing visitor is stopped
    // before the post. The acceptance criterion is about the boundary, which re-checks every value
    // itself (`apps/web/AGENTS.md` Discipline); disabling the advisory constraint is how the
    // server's answer is observed rather than assumed.
    // The registration form is the one holding the four fields; the footer's language switch is the
    // other form on the page.
    const registrationForm = page
      .locator('form')
      .filter({ has: page.getByLabel('Your full name', { exact: true }) });
    await registrationForm.evaluate((form) => {
      (form as HTMLFormElement).noValidate = true;
    });
    await page.getByRole('button', { name: 'Send the code', exact: true }).click();

    await expect(page).toHaveURL(/\/join$/);
    await expect(
      page.getByText('Registration is for ages 18 to 35. No account was created.', { exact: true }),
    ).toBeVisible();
    // The typed text survives the refusal (`screens/03` Validation Error: "the typed text kept").
    await expect(page.getByLabel('Your full name', { exact: true })).toHaveValue(person.fullName);
    await expect(page.getByLabel('Your age', { exact: true })).toHaveValue('41');
    await expect(page.getByLabel('Telephone number', { exact: true })).toHaveValue(
      person.telephone,
    );
    // Nothing was created and no session was opened: My Record is behind the member gate, so a
    // visitor with no session is sent to the sign-in door (`C-007`, `NFR-026`).
    await page.goto('/me');
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fme$/);
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('@a11y C-002: the pending registration exists but no account until the code is accepted', async ({
    page,
  }) => {
    const person = resident();
    await submitRegistration(page, person);

    // The code step shows the number in full (`screens/04` Visual Focus).
    await expect(page).toHaveURL(/\/join\/confirm$/);
    await expect(
      page.getByText(`We sent a six-digit code to +234`, { exact: false }),
    ).toBeVisible();
    await expectAccessible(page, '/join/confirm (en-NG)');

    // No account is on the number yet: the sign-in door routes an unknown number to registration
    // (`C-005` `NO_ACCOUNT_FOR_NUMBER`, `meta.recoveryPath:"/join"`).
    await page.goto('/sign-in');
    await page.getByLabel('Telephone number', { exact: true }).fill(person.telephone);
    await page.getByRole('button', { name: 'Send the code', exact: true }).click();
    await expect(page).toHaveURL(/\/join$/);
    await expect(page.getByLabel('Telephone number', { exact: true })).toHaveValue(
      person.telephone,
    );

    // Accepting the code creates the account and opens the session (`C-003`).
    await page.goto('/join/confirm');
    await page
      .getByLabel('The six digits from the message')
      .fill(await waitForCode(person.telephone));
    await page.getByRole('button', { name: 'Confirm the code', exact: true }).click();
    await expect(page).toHaveURL(/\/join\/ward$/);
    await expectAccessible(page, '/join/ward (en-NG)');
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: 'My Record', exact: true })).toBeVisible();
    await expect(page.getByText('Registered', { exact: true }).first()).toBeVisible();
    await expectAccessible(page, '/me populated (en-NG)');
  });

  test('screens/03: a number already on an account offers sign-in instead of a second account', async ({
    page,
  }) => {
    const person = resident();
    await registerResident(page, person);

    // The same browser, with the session cleared, stands in for a second visitor on the same number.
    await page.context().clearCookies();
    await submitRegistration(page, person);

    await expect(page).toHaveURL(/\/join$/);
    await expect(
      page
        .getByText('That number already has an account. Sign in to it instead.', { exact: true })
        .first(),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in', exact: true }).first()).toBeVisible();
  });

  test('screens/04: a wrong code states the tries remaining and the field is cleared', async ({
    page,
  }) => {
    const person = resident();
    await submitRegistration(page, person);
    await expect(page).toHaveURL(/\/join\/confirm$/);

    const code = await waitForCode(person.telephone);
    // A six-digit value that is not the delivered one. The chance of collision is one in a million.
    const wrong = code === '000000' ? '000001' : '000000';
    await page.getByLabel('The six digits from the message').fill(wrong);
    await page.getByRole('button', { name: 'Confirm the code', exact: true }).click();

    await expect(page).toHaveURL(/\/join\/confirm$/);
    await expect(
      page.getByText('That code is not right. You have 2 tries left.', { exact: true }),
    ).toBeVisible();
    // The field is cleared (`screens/04` Incorrect state).
    await expect(page.getByLabel('The six digits from the message')).toHaveValue('');

    // The code that was sent still works after one wrong attempt.
    await page.getByLabel('The six digits from the message').fill(code);
    await page.getByRole('button', { name: 'Confirm the code', exact: true }).click();
    await expect(page).toHaveURL(/\/join\/ward$/);
  });

  test('screens/04: a resend inside the cooldown states the time remaining', async ({ page }) => {
    const person = resident();
    await submitRegistration(page, person);
    await expect(page).toHaveURL(/\/join\/confirm$/);

    // The countdown is live once hydration lands; the server refuses the request either way and the
    // screen states the wait (`C-004` `RESEND_COOLDOWN`).
    await page.getByRole('button', { name: 'Send a new code', exact: true }).click();
    await expect(
      page.getByText('A new code was just sent. Ask for another in', { exact: false }),
    ).toBeVisible();
    // The screen is still the confirmation step, with the code field available.
    await expect(page.getByLabel('The six digits from the message')).toBeVisible();
  });
});
