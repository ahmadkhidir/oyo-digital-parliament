/**
 * The entry and reading surfaces of Phase 1: `screens/02-sign-in.md`, `screens/03-registration-form.md`,
 * `screens/23-privacy-notice.md`, `screens/27-contact.md` and the signed-out state of
 * `screens/13-my-record.md`, against `C-001` and `NFR-044`.
 *
 * The flows prove the default state of every signed-out screen, that the public reads render their
 * primary content with scripting disabled, that both launch locales render, and that the keyboard
 * path reaches the skip link and the form controls in order. The `@a11y` scan asserts WCAG 2.2 AA at
 * the automated bar for every route in both locales.
 */
import { expect, test } from '@playwright/test';

import { expectAccessible } from './support/a11y';

/** Set the anonymous visitor's language choice exactly as the footer's switch does (`C-001`). */
async function chooseLocale(page: import('@playwright/test').Page, locale: string): Promise<void> {
  await page
    .context()
    .addCookies([{ name: 'odp_locale', value: locale, url: 'http://localhost:3000' }]);
}

test.describe('entry and reading surfaces', () => {
  test('screens/02, 03, 23, 27: every signed-out screen renders its default state', async ({
    page,
  }) => {
    await page.goto('/join');
    await expect(page.getByRole('heading', { name: 'Join the record', exact: true })).toBeVisible();
    // The publication statement is the screen's visual focus and precedes any field.
    await expect(
      page.getByRole('heading', { name: 'What becomes public', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Your full name', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Your age', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Telephone number', { exact: true })).toBeVisible();

    await page.goto('/sign-in');
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.getByLabel('Telephone number', { exact: true })).toBeVisible();

    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy notice', exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'What is public and what is held' }),
    ).toBeVisible();
    // The lawful basis, rights and retention sections are native accordions.
    await expect(page.getByText('Your rights', { exact: true })).toBeVisible();

    await page.goto('/contact');
    await expect(
      page.getByRole('heading', { name: 'Contact the campaign', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ask for a right', exact: true })).toBeVisible();

    await page.goto('/staff/sign-in');
    await expect(page.getByRole('heading', { name: 'Staff sign in', exact: true })).toBeVisible();
    await expect(page.getByLabel('Username', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();

    // A dead session cookie is presented, so the proxy lets My Record render its signed-out state
    // rather than redirecting (`screens/13` Signed out).
    await page
      .context()
      .addCookies([
        { name: 'odp_session', value: 'e2e-opaque-dead-session', url: 'http://localhost:3000' },
      ]);
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: 'Sign in to see your record' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in to your account' }).first()).toBeVisible();
  });

  test('screens/23, 27, 03: the public reads render their primary content with scripting disabled', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto('/privacy');
      await expect(
        page.getByRole('heading', { name: 'Privacy notice', exact: true }),
      ).toBeVisible();
      await expect(page.getByText('What you submit is public.', { exact: false })).toBeVisible();

      await page.goto('/contact');
      await expect(
        page.getByRole('heading', { name: 'Contact the campaign', exact: true }),
      ).toBeVisible();

      await page.goto('/join');
      await expect(page.getByLabel('Your full name', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Send the code', exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('screens/03: a form posted without scripting re-renders with its field reason and typed text', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto('/join');
      await page.getByLabel('Your full name', { exact: true }).fill('E2E No Scripting');
      await page.getByLabel('Your age', { exact: true }).fill('29');
      await page.getByLabel('Telephone number', { exact: true }).fill('not-a-number');
      await page.getByRole('button', { name: 'Send the code', exact: true }).click();

      // The boundary refuses the number and the screen states it, with the typed text kept.
      await expect(page).toHaveURL(/\/join$/);
      await expect(
        page.getByText('That is not a Nigerian mobile number we can text.', { exact: false }),
      ).toBeVisible();
      await expect(page.getByLabel('Your full name', { exact: true })).toHaveValue(
        'E2E No Scripting',
      );
      await expect(page.getByLabel('Telephone number', { exact: true })).toHaveValue(
        'not-a-number',
      );
    } finally {
      await context.close();
    }
  });

  test('C-001: both launch locales render the entry screens', async ({ page }) => {
    await chooseLocale(page, 'yo-NG');
    await page.goto('/join');
    await expect(page.locator('html')).toHaveAttribute('lang', 'yo-NG');
    await expect(page.getByRole('heading', { name: 'Join the record', exact: true })).toHaveCount(
      0,
    );

    await page.goto('/privacy');
    await expect(page.locator('html')).toHaveAttribute('lang', 'yo-NG');
    await expect(page.getByRole('heading', { name: 'Privacy notice', exact: true })).toHaveCount(0);

    // The switch back to English restores the English copy (`screens.md` Footer).
    await chooseLocale(page, 'en-NG');
    await page.goto('/privacy');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en-NG');
    await expect(page.getByRole('heading', { name: 'Privacy notice', exact: true })).toBeVisible();
  });

  test('screens/03: an offline form is held and says so before any request', async ({ page }) => {
    await page.goto('/join');
    await page.context().setOffline(true);
    await expect(
      page.getByText('You are offline. The form is held; it sends when the connection returns.', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Send when back online', exact: true }),
    ).toBeVisible();
    await page.context().setOffline(false);
  });

  test('NFR-044: the keyboard path reaches the skip link and then the first field', async ({
    page,
  }) => {
    await page.goto('/join');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to the main content', exact: true });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    // The skip link moves the sequential focus position into the main content region, so the next
    // tab stop is the product name inside it.
    await page.keyboard.press('Tab');
    await expect(
      page
        .getByRole('main')
        .getByRole('link', { name: /Oyo Digital Parliament/ })
        .first(),
    ).toBeFocused();

    for (let step = 0; step < 12; step += 1) {
      const focused = await page.evaluate(() => document.activeElement?.id ?? '');
      if (focused === 'fullName') break;
      await page.keyboard.press('Tab');
    }
    await expect(page.getByLabel('Your full name', { exact: true })).toBeFocused();
  });

  test('@a11y NFR-044: every signed-out screen passes axe in both launch locales', async ({
    page,
  }) => {
    const routes = ['/join', '/sign-in', '/privacy', '/contact', '/staff/sign-in'];
    for (const locale of ['en-NG', 'yo-NG']) {
      await chooseLocale(page, locale);
      for (const route of routes) {
        await page.goto(route);
        // The staff auth shell renders its own `main` inside the document shell's; the first is the
        // document's content region. The duplication is reported as a finding.
        await expect(page.locator('main').first()).toBeVisible();
        await expectAccessible(page, `${route} (${locale})`);
      }
      // My Record's signed-out state is behind the member gate only when a cookie is presented.
      await page
        .context()
        .addCookies([
          { name: 'odp_session', value: 'e2e-opaque-dead-session', url: 'http://localhost:3000' },
        ]);
      await page.goto('/me');
      await expect(page).toHaveURL(/\/me$/);
      await expect(page.locator('main')).toBeVisible();
      await expectAccessible(page, `/me signed-out (${locale})`);
    }
  });
});
