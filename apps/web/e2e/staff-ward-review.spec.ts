/**
 * The response-staff flow — `screens/19-ward-review-queue.md` against `C-055` to `C-057`, and
 * `screens/25-staff-totp.md` against `C-092`.
 *
 * The route carries two work types, and the flow exercises both in the order a reviewer works them:
 *
 * - **Descriptions** — a resident whose words match no ward is queued; the reviewer resolves the
 *   description to a recorded ward, which moves the member and their unresolved submissions
 *   (`C-056`).
 * - **Residences** — a member whose ward is recorded and whose residence is not yet accepted appears
 *   in registration order. Acceptance is the only route from Registered to Checked and removes the
 *   member from the list (`C-057`); a refusal states its reason, leaves the member Registered and
 *   keeps them on the list for a further review.
 *
 * The flow also covers the amended edge case: a resident who confirmed a candidate ward never enters
 * the description queue, so the residence review is their only case and is worked from the
 * Residences list.
 *
 * Each member works in their own browser context, so the assertions about a record are always the
 * record of the member they name: registering a second resident in the same context would swap the
 * session the first context holds.
 */
import { expect, test, type Browser, type Page } from '@playwright/test';

import { expectAccessible } from './support/a11y';
import { runAddress } from './support/environment';
import { describeArea, registerResident, resident } from './support/member';
import { signInStaff } from './support/staff';

/** One member's browser context, presenting the run's own source address (`NFR-027`). */
async function memberContext(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    extraHTTPHeaders: { 'x-forwarded-for': runAddress() },
  });
  return context.newPage();
}

test.describe('response staff ward review', () => {
  test('@a11y screens/25, screens/19: staff resolve a description, then check and refuse residences', async ({
    browser,
  }) => {
    test.setTimeout(240_000);

    // The three sessions are opened before any navigation: each member works in their own context so
    // a record assertion always names the member it is about, and the reviewer works in a third.
    const describedPage = await memberContext(browser);
    const confirmedPage = await memberContext(browser);
    const staffContext = await browser.newContext({
      extraHTTPHeaders: { 'x-forwarded-for': runAddress() },
    });
    const staff = await staffContext.newPage();
    try {
      // The description case: the resident's words match no ward, so the description is queued while
      // the account stays usable and unresolved (`FEAT-002`).
      const described = resident();
      await registerResident(describedPage, described);
      const description = 'zzodp behind the old post office, past the stream';
      await describeArea(describedPage, {
        localGovernmentArea: 'Ibadan North',
        description,
      });
      await describedPage.getByRole('button', { name: 'None of these', exact: true }).click();
      await expect(describedPage).toHaveURL(/\/join\/ward\?sent=review$/);
      // The residence case: this resident confirms a candidate ward, so no description review
      // exists and the residence review is their only case (`screens/19` edge case).
      const confirmed = resident();
      await registerResident(confirmedPage, confirmed);
      await describeArea(confirmedPage, {
        localGovernmentArea: 'Afijio',
        description: 'I live at Ilora near the market',
      });
      const candidates = confirmedPage.getByRole('radio');
      await expect(candidates.first()).toBeVisible();
      await candidates.first().check();
      // The candidate's own label carries the ward's recorded name; read it before the confirmation
      // navigates away, and reuse it when the Residences row is checked.
      const confirmedWard =
        (await candidates.first().locator('xpath=..').innerText()).split(' \u2014 ')[0] ?? '';
      expect(confirmedWard.length).toBeGreaterThan(0);
      await confirmedPage.getByRole('button', { name: 'Confirm ward', exact: true }).click();
      await expect(confirmedPage).toHaveURL(/\/$/);
      await signInStaff(staff, 'response');
      await staff.goto('/admin/wards/review');
      await expect(
        staff.getByRole('heading', { name: 'Ward review queue', level: 1 }),
      ).toBeVisible();
      // The route opens on Descriptions and names both work types (`screens/19` Work type).
      await expect(staff.getByRole('navigation', { name: 'Work type' })).toBeVisible();
      await expect(staff.getByRole('link', { name: 'Descriptions', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expectAccessible(staff, '/admin/wards/review — descriptions (en-NG)');

      // `C-056`: resolving records the ward, states both sentences, and moves the member.
      await staff.getByRole('link', { name: new RegExp(description.slice(6)) }).click();
      await expect(staff.getByText(description, { exact: true }).first()).toBeVisible();
      const candidate = staff.getByLabel('Candidate ward', { exact: true });
      await candidate.selectOption({ index: 1 });
      const describedWard =
        (await candidate.locator('option:checked').innerText()).split(' \u2014 ')[0] ?? '';
      await staff.getByRole('button', { name: 'Resolve to this ward', exact: true }).click();
      await expect(staff.getByText('The ward was recorded', { exact: false })).toBeVisible();
      await expect(staff.getByText(/submission\(s\) moved/, { exact: false })).toBeVisible();

      await describedPage.goto('/me');
      await expect(describedPage.getByText(describedWard, { exact: true }).first()).toBeVisible();

      // `C-055`: the Residences work type lists both members — the one just resolved and the one who
      // confirmed a candidate — with their confirmed ward and registration date.
      await staff.getByRole('link', { name: 'Residences', exact: true }).click();
      await expect(staff).toHaveURL(/\/admin\/wards\/review\?work=residences$/);
      await expect(staff.getByRole('link', { name: 'Residences', exact: true })).toHaveAttribute(
        'aria-current',
        'page',
      );
      await expectAccessible(staff, '/admin/wards/review — residences (en-NG)');
      await expect(staff.getByText('Members awaiting a residence review')).toBeVisible();
      const describedRow = staff
        .locator('details')
        .filter({ hasText: described.displayName })
        .first();
      const confirmedRow = staff
        .locator('details')
        .filter({ hasText: confirmed.displayName })
        .first();
      await expect(describedRow).toBeVisible();
      await expect(confirmedRow).toBeVisible();
      await expect(describedRow.getByText(describedWard, { exact: false }).first()).toBeVisible();
      await expect(confirmedRow.getByText(confirmedWard, { exact: false }).first()).toBeVisible();

      // `C-057` acceptance: the member moves to Checked and leaves the list.
      await confirmedRow.locator('summary').click();
      await confirmedRow
        .getByLabel('How the residence was checked', { exact: true })
        .selectOption('ward_confirmation');
      await confirmedRow.getByRole('radio', { name: 'Accept the residence', exact: true }).check();
      await confirmedRow
        .getByRole('button', { name: 'Record residence review', exact: true })
        .click();
      await expect(
        staff.getByText('The residence is checked. The member now appears as Checked', {
          exact: false,
        }),
      ).toBeVisible();
      await expect(staff.locator('details').filter({ hasText: confirmed.displayName })).toHaveCount(
        0,
      );
      await confirmedPage.goto('/me');
      await expect(confirmedPage.getByText('Checked', { exact: true }).first()).toBeVisible();

      // `C-057` refusal: a rejection without a stated reason is itself refused (the boundary, not the
      // browser, is under test, so the native constraint is disabled for this one post).
      await staff.goto('/admin/wards/review?work=residences');
      const refusedRow = staff
        .locator('details')
        .filter({ hasText: described.displayName })
        .first();
      await expect(refusedRow).toBeVisible();
      await refusedRow.locator('summary').click();
      await refusedRow
        .getByLabel('How the residence was checked', { exact: true })
        .selectOption('ward_confirmation');
      await refusedRow.getByRole('radio', { name: 'Reject the residence', exact: true }).check();
      await expect(refusedRow.getByLabel('Refusal reason', { exact: true })).toBeVisible();
      await refusedRow.locator('form').evaluate((form) => {
        (form as HTMLFormElement).noValidate = true;
      });
      await refusedRow
        .getByRole('button', { name: 'Record residence review', exact: true })
        .click();
      await expect(
        staff.getByText(
          'The residence review was not recorded. Check the method and the decision, and give a reason if you rejected the residence.',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        staff.locator('details').filter({ hasText: described.displayName }).first(),
      ).toBeVisible();
      await describedPage.goto('/me');
      await expect(describedPage.getByText('Registered', { exact: true }).first()).toBeVisible();

      // With a reason, the refusal is recorded: the member stays Registered and on the list.
      await staff.goto('/admin/wards/review?work=residences');
      const reasonRow = staff.locator('details').filter({ hasText: described.displayName }).first();
      await reasonRow.locator('summary').click();
      await reasonRow
        .getByLabel('How the residence was checked', { exact: true })
        .selectOption('ward_confirmation');
      await reasonRow.getByRole('radio', { name: 'Reject the residence', exact: true }).check();
      await reasonRow
        .getByLabel('Refusal reason', { exact: true })
        .fill('The address given is outside the recorded ward.');
      await reasonRow.getByRole('button', { name: 'Record residence review', exact: true }).click();
      await expect(
        staff.getByText('The residence review was rejected. The member remains Registered.', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        staff.locator('details').filter({ hasText: described.displayName }).first(),
      ).toBeVisible();
      await describedPage.goto('/me');
      await expect(describedPage.getByText('Registered', { exact: true }).first()).toBeVisible();

      // A later acceptance still works after a refusal: the member leaves the list on acceptance.
      const acceptedRow = staff
        .locator('details')
        .filter({ hasText: described.displayName })
        .first();
      await acceptedRow.locator('summary').click();
      await acceptedRow
        .getByLabel('How the residence was checked', { exact: true })
        .selectOption('ward_confirmation');
      await acceptedRow.getByRole('radio', { name: 'Accept the residence', exact: true }).check();
      await acceptedRow
        .getByRole('button', { name: 'Record residence review', exact: true })
        .click();
      await expect(staff.getByText('The residence is checked.', { exact: false })).toBeVisible();
      await expect(staff.locator('details').filter({ hasText: described.displayName })).toHaveCount(
        0,
      );
      await describedPage.goto('/me');
      await expect(describedPage.getByText('Checked', { exact: true }).first()).toBeVisible();
    } finally {
      await staffContext.close();
      await describedPage.context().close();
      await confirmedPage.context().close();
    }
  });
});
