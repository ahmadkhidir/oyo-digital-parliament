/**
 * `FEAT-001` sign-in, through `screens/02-sign-in.md` against `C-005`, `C-006` and `C-007`.
 *
 * The flows prove a returning member opens a session with a one-time code, that a wrong code states
 * the tries remaining, that a number with no account is routed to registration, and that signing out
 * returns the member to the sign-in door.
 */
import { expect, test } from '@playwright/test';

import { messageCount, registerResident, resident, signIn, waitForCode } from './support/member';

test.describe('FEAT-001 sign-in', () => {
  test('screens/02: a member signs in with a one-time code and reaches their record', async ({
    page,
  }) => {
    const person = resident();
    await registerResident(page, person);

    // A new visitor with no session: the number belongs to an account, so the code step opens.
    await page.context().clearCookies();
    await page.goto('/sign-in?returnTo=%2Fme');
    await page.getByLabel('Telephone number', { exact: true }).fill(person.telephone);
    const before = await messageCount(person.telephone);
    await page.getByRole('button', { name: 'Send the code', exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByText('We sent a six-digit code to', { exact: false })).toBeVisible();

    await page
      .getByLabel('The six digits from the message')
      .fill(await waitForCode(person.telephone, { after: before }));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/me$/);
    await expect(page.getByRole('heading', { name: 'My Record', exact: true })).toBeVisible();
    await expect(page.getByText(person.displayName, { exact: false }).first()).toBeVisible();

    // `NFR-026`: the session cookie is HttpOnly, Secure, SameSite=Lax and carries an expiry that
    // never outlives the server-side session.
    const session = (await page.context().cookies()).find(
      (cookie) => cookie.name === 'odp_session',
    );
    expect(session?.httpOnly).toBe(true);
    expect(session?.secure).toBe(true);
    expect(session?.sameSite).toBe('Lax');
    expect(session?.expires ?? 0).toBeGreaterThan(Date.now() / 1000);
  });

  test('screens/02: a wrong code states the tries remaining and clears the field', async ({
    page,
  }) => {
    const person = resident();
    await registerResident(page, person);
    await page.context().clearCookies();

    await page.goto('/sign-in');
    await page.getByLabel('Telephone number', { exact: true }).fill(person.telephone);
    const before = await messageCount(person.telephone);
    await page.getByRole('button', { name: 'Send the code', exact: true }).click();

    const code = await waitForCode(person.telephone, { after: before });
    const wrong = code === '000000' ? '000001' : '000000';
    await page.getByLabel('The six digits from the message').fill(wrong);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByText('That code is not right. You have 2 tries left.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('The six digits from the message')).toHaveValue('');

    await page.getByLabel('The six digits from the message').fill(code);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // No `returnTo` was asked for, so `C-006` returns the member to the record home; the session is
    // proven by My Record opening.
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: 'My Record', exact: true })).toBeVisible();
  });

  test('screens/02: a number with no account is sent to registration with the number kept', async ({
    page,
  }) => {
    const person = resident();
    await page.goto('/sign-in');
    await page.getByLabel('Telephone number', { exact: true }).fill(person.telephone);
    await page.getByRole('button', { name: 'Send the code', exact: true }).click();

    await expect(page).toHaveURL(/\/join$/);
    await expect(page.getByLabel('Telephone number', { exact: true })).toHaveValue(
      person.telephone,
    );
  });

  test('screens/02, screens/13: signing out returns the member to the sign-in door', async ({
    page,
  }) => {
    const person = resident();
    await registerResident(page, person);
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: 'My Record', exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    // `C-008` ends the session and returns to the record home; the member gate then sends the
    // signed-out visitor to the sign-in door.
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/me');
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fme$/);
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  });

  test('screens/02: a signed-in member is returned to the screen they came from', async ({
    page,
  }) => {
    const person = resident();
    await registerResident(page, person);
    await page.context().clearCookies();
    await signIn(page, person.telephone, '/me');
    await expect(page).toHaveURL(/\/me$/);
  });
});
