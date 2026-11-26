/**
 * `FEAT-002` — ward capture and confirmation, through `screens/05-ward-confirmation.md` against
 * `C-009`, `C-010` and `C-011`.
 *
 * The flows prove that a resident's own words produce candidates they must confirm, that a
 * confirmed ward is recorded on the member, and that an unmatched description is queued while the
 * account stays usable and unresolved.
 */
import { expect, test } from '@playwright/test';

import { describeArea, registerResident, resident } from './support/member';

test.describe('FEAT-002 ward capture and confirmation', () => {
  test('screens/05: a description resembling a known ward offers candidates the resident confirms', async ({
    page,
  }) => {
    const person = resident();
    await registerResident(page, person);
    await expect(page).toHaveURL(/\/join\/ward$/);

    await describeArea(page, {
      localGovernmentArea: 'Afijio',
      description: 'I live at Ilora, near the market',
    });

    // `C-010` answers with up to three candidates, each carrying its local government area; the
    // resident must choose one (`FEAT-002`: the model never assigns a ward).
    const candidates = page.getByRole('radio');
    await expect(candidates.first()).toBeVisible();
    const count = await candidates.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(3);
    await expect(page.getByText(/Ilora .*Afijio/).first()).toBeVisible();

    await candidates.first().check();
    await page.getByRole('button', { name: 'Confirm ward', exact: true }).click();

    // `C-011`'s `nextScreen` is `/`; the record home screen belongs to a later phase, so the flow
    // lands there and is followed up on My Record, which is where the recorded ward renders.
    await expect(page).toHaveURL(/\/$/);
    await page.goto('/me');
    await expect(page.getByText('Ilora', { exact: false }).first()).toBeVisible();

    // The recorded ward is named above the form when the screen is opened again.
    await page.goto('/join/ward');
    await expect(page.getByRole('heading', { name: 'Your ward is recorded' })).toBeVisible();
  });

  test('screens/05: no candidate queues the description and the account stays usable', async ({
    page,
  }) => {
    const person = resident();
    await registerResident(page, person);
    await expect(page).toHaveURL(/\/join\/ward$/);

    // A description with no recognisable place name and no token shared with any accumulated alias,
    // unique to this run: the reference learns confirmed wording (`FEAT-002`), so a repeated marker
    // would eventually match. The `qzxv` marker is the fixture reset's own.
    const description = `qzxv qqzz ${person.telephone} vvq`;
    await describeArea(page, { localGovernmentArea: 'Ibadan North', description });

    // No ward matches; the screen states that the area is still accepted and offers "None of these".
    await expect(
      page.getByText('No ward in the reference matches those words.', { exact: false }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'None of these', exact: true }).click();

    // `C-011` queues the description and returns to the screen with the sent state.
    await expect(page).toHaveURL(/\/join\/ward\?sent=review$/);
    await expect(page.getByRole('heading', { name: 'Area sent for confirmation' })).toBeVisible();
    await expect(
      page.getByText('You can carry on now; nothing is blocked while it is unresolved.', {
        exact: false,
      }),
    ).toBeVisible();

    // The account remains usable and names the ward as unresolved (`FEAT-002`).
    await page.goto('/me');
    await expect(page.getByRole('heading', { name: 'My Record', exact: true })).toBeVisible();
    await expect(page.getByText('Not confirmed yet').first()).toBeVisible();
  });
});
