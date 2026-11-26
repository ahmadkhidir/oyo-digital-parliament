/**
 * The resident flows the browser suite drives (`FEAT-001`, `FEAT-002`, `FEAT-012`).
 *
 * Each helper walks the screens as a resident does and asserts only the step it owns; the spec file
 * asserts the acceptance criterion. The one-time code is read from the capture gateway, because it
 * is the only copy outside the message a resident receives (`C-076`).
 */
import { expect, type Page } from '@playwright/test';

import { normalizedTelephone, SMS_GATEWAY_ORIGIN, uniqueTelephone } from './environment';

/** A resident as the registration form collects them (`screens/03-registration-form.md`). */
export interface Resident {
  readonly fullName: string;
  readonly displayName: string;
  readonly age: number;
  /** The local form a resident types, for example `08031234567`. */
  readonly telephone: string;
}

/** What the capture gateway recorded, in the shape `e2e/support/sms-gateway.ts` answers. */
interface CapturedMessage {
  readonly to: string;
  readonly body: string;
  readonly sender: string;
  readonly receivedAt: string;
}

/**
 * A resident with a telephone number no earlier run holds.
 *
 * @param overrides - The fields a spec needs to state itself.
 * @returns The resident, with a fresh number unless one was supplied.
 */
export function resident(overrides: Partial<Resident> = {}): Resident {
  return {
    // The `E2E ` prefix makes the run's own artefacts distinguishable, so the fixture reset can
    // clear the queues it filled last time without touching anything a person created.
    fullName: 'E2E Adebayo Ogunlana',
    displayName: `E2E Ade ${uniqueTelephone().slice(-4)}`,
    age: 26,
    telephone: uniqueTelephone(),
    ...overrides,
  };
}

/**
 * Every message the gateway has captured this run.
 *
 * @returns The messages, oldest first.
 */
async function capturedMessages(): Promise<readonly CapturedMessage[]> {
  const response = await fetch(`${SMS_GATEWAY_ORIGIN}/messages`);
  if (!response.ok) throw new Error(`the SMS gateway answered ${String(response.status)}`);
  return (await response.json()) as readonly CapturedMessage[];
}

/**
 * How many messages the gateway has captured for one destination.
 *
 * A flow captures the count before it asks for a code, so the wait can ignore the message an earlier
 * step left behind: a registration code is still on the gateway when the same resident later asks to
 * sign in, and picking it would prove nothing about the newer one.
 *
 * @param localTelephone - The number in the local form the resident typed.
 * @returns The number of matching messages, oldest first.
 */
export async function messageCount(localTelephone: string): Promise<number> {
  const destination = normalizedTelephone(localTelephone);
  return (await capturedMessages()).filter((message) => message.to === destination).length;
}

/**
 * Wait for a six-digit code sent to one number.
 *
 * A resend supersedes an earlier message, so the newest matching message is the one that can still
 * be confirmed; the code store holds one digest per target (`C-004`).
 *
 * @param localTelephone - The number in the local form the resident typed.
 * @param options - `after` is how many messages for the number to ignore (those already present when
 *   the request was made); `timeoutMs` bounds the wait.
 * @returns The six digits.
 */
export async function waitForCode(
  localTelephone: string,
  options: { readonly after?: number; readonly timeoutMs?: number } = {},
): Promise<string> {
  const destination = normalizedTelephone(localTelephone);
  const skip = options.after ?? 0;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const matching = (await capturedMessages()).filter((message) => message.to === destination);
    const fresh = matching.slice(skip);
    const newest = fresh[fresh.length - 1];
    const digits =
      newest === undefined ? null : /(?:^|[^0-9])([0-9]{6})(?:[^0-9]|$)/.exec(newest.body);
    if (digits !== null) return digits[1] ?? '';
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`no code reached ${destination} within ${String(timeoutMs)}ms`);
}

/**
 * Fill the registration form and send the code (`screens/03`, `C-002`).
 *
 * @param page - The resident's page.
 * @param person - The four facts.
 */
export async function submitRegistration(page: Page, person: Resident): Promise<void> {
  await page.goto('/join');
  await page.getByLabel('Your full name', { exact: true }).fill(person.fullName);
  await page.getByLabel('Your age', { exact: true }).fill(String(person.age));
  await page.getByLabel('Telephone number', { exact: true }).fill(person.telephone);
  await page.getByLabel(/^Display name/).fill(person.displayName);
  await page.getByRole('button', { name: 'Send the code', exact: true }).click();
}

/**
 * Register a resident and confirm the number, ending on the ward screen (`C-002`, `C-003`).
 *
 * @param page - The resident's page.
 * @param person - The four facts.
 */
export async function registerResident(page: Page, person: Resident): Promise<void> {
  await submitRegistration(page, person);
  await expect(page).toHaveURL(/\/join\/confirm$/);
  await page
    .getByLabel('The six digits from the message')
    .fill(await waitForCode(person.telephone));
  await page.getByRole('button', { name: 'Confirm the code', exact: true }).click();
  await expect(page).toHaveURL(/\/join\/ward$/);
}

/**
 * Describe the resident's area on the ward screen and wait for the client island to take it.
 *
 * The description field is a controlled component: an input event that lands before hydration is
 * adopted by the browser but never reaches React's state, so the debounced suggestion never fires
 * and the screen sits idle with no candidates and no "no match" sentence. Typing the same text again
 * once the document is idle proves the control is live; the call is idempotent either way.
 *
 * @param page - The resident's page, on `/join/ward`.
 * @param input - The local government area to select and the resident's own words.
 */
export async function describeArea(
  page: Page,
  input: { readonly localGovernmentArea: string; readonly description: string },
): Promise<void> {
  const area = page.getByLabel('Local government area', { exact: true });
  const field = page.getByLabel('Describe your area', { exact: true });
  await area.selectOption(input.localGovernmentArea);
  await field.fill(input.description);
  await page.waitForLoadState('networkidle');
  await area.selectOption(input.localGovernmentArea);
  await field.fill(input.description);
}

/**
 * Sign an existing member in with a one-time code (`C-005`, `C-006`).
 *
 * @param page - The member's page.
 * @param localTelephone - The number on the account.
 * @param returnTo - The internal path to land on after the session opens.
 */
export async function signIn(page: Page, localTelephone: string, returnTo = '/me'): Promise<void> {
  await page.goto(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel('Telephone number', { exact: true }).fill(localTelephone);
  const before = await messageCount(localTelephone);
  await page.getByRole('button', { name: 'Send the code', exact: true }).click();
  await page
    .getByLabel('The six digits from the message')
    .fill(await waitForCode(localTelephone, { after: before }));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${returnTo.replace('/', '\\/')}(\\?.*)?$`));
}

/**
 * End the member session from My Record (`FEAT-012`: sign out).
 *
 * @param page - The member's page.
 */
export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}
