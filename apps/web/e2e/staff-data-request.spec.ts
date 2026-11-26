/**
 * The operator's data-request flow — `screens/22-data-request-queue.md` against `C-066` and
 * `C-067`, and the member's side of the same request against `C-035` and `C-036`.
 *
 * A member asks for an export; the operator signs in with the seeded credential, enrols the second
 * factor, completes the request (which produces the file through the identity service), and the
 * member downloads the machine-readable archive. The same session then proves the role boundary: an
 * operator cannot open the ward review queue.
 *
 * The export request lives in this file only, so the queue always holds exactly the case the flow is
 * about; the data-rights flows exercise consent, correction and deletion, and never leave an export
 * open.
 */
import { expect, test } from '@playwright/test';

import { expectAccessible } from './support/a11y';
import { registerResident, resident } from './support/member';
import { signInStaff } from './support/staff';

test.describe('operator data requests', () => {
  test('@a11y screens/22, screens/13: an export is worked and downloaded', async ({
    browser,
    page,
  }) => {
    test.setTimeout(180_000);
    const person = resident();
    await registerResident(page, person);

    // `C-035`: the member asks for a machine-readable export from their own record.
    await page.goto('/me');
    await page.getByText('Download my data', { exact: true }).click();
    await page.getByRole('button', { name: 'Request the file', exact: true }).click();
    await expect(page).toHaveURL(/\/me\?st=export_requested$/);

    const staffContext = await browser.newContext();
    const operator = await staffContext.newPage();
    try {
      await signInStaff(operator, 'operator');
      await operator.goto('/admin/data-requests');
      await expect(
        operator.getByRole('heading', { name: 'Data request queue', level: 1 }),
      ).toBeVisible();
      await expectAccessible(operator, '/admin/data-requests (en-NG)');

      // `C-066`: the open request is listed. The queue read is the operator's whole surface; if it
      // cannot answer, no rights request can be worked at all.
      const rows = operator.getByRole('link', { name: /^Export/ });
      await expect(rows.first()).toBeVisible();

      // The queue states plainly that it never shows a resident's name or number.
      await expect(
        operator.getByText('This queue never shows a resident’s name or number.', { exact: false }),
      ).toBeVisible();

      // The one open export is the member's request.
      await rows.first().click();
      await expect(operator.getByText('Export', { exact: true }).first()).toBeVisible();
      await operator.getByRole('button', { name: 'Mark completed', exact: true }).click();
      await expect(operator.getByText('The request is completed.', { exact: true })).toBeVisible();

      // A completed request leaves the open queue (`C-066`); its file is proven by the member's
      // download below, which resolves through the recorded `fileReference` (`C-036`, `C-067`).
      await expect(operator.getByRole('link', { name: /^Export/ })).toHaveCount(0);

      // The member's record shows the completed request and the short-lived download (`C-036`).
      await page.goto('/me');
      const requests = page.getByRole('region', { name: 'Your data requests' });
      await expect(requests.getByText('Export', { exact: true })).toBeVisible();
      await expect(requests.getByText('Completed', { exact: true })).toBeVisible();
      const download = requests.getByRole('link', { name: 'Download your export', exact: true });
      await expect(download).toBeVisible();

      const href = await download.getAttribute('href');
      expect(href).not.toBeNull();
      const file = await page.request.get(href ?? '');
      expect(file.status()).toBe(200);
      expect(file.headers()['content-type']).toContain('application/zip');
      const body = await file.body();
      expect(body.byteLength).toBeGreaterThan(0);

      // The role boundary holds: an operator may not open the ward review queue.
      await operator.goto('/admin/wards/review');
      await expect(
        operator.getByText('The ward review queue is worked by response staff.', { exact: false }),
      ).toBeVisible();
    } finally {
      await staffContext.close();
    }
  });
});
