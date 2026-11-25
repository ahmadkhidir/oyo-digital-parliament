/**
 * The published contact channel (`screens/27-contact.md`; `operations.md` Resident).
 *
 * The screen opens the campaign's published external form in a new page and states the campaign's
 * first-response time. The form's address is a deployment value — `CONTACT_FORM_URL`, declared in
 * `packages/platform/src/config/schema.ts` and validated by the environment contract — so the
 * channel can change without the page changing, and no vendor link is written into a component.
 *
 * `operations.md` names the campaign's privacy mailbox as the permanent channel, and the published
 * external form as the route in use until that mailbox is the public one. When no form is
 * configured the screen states the mailbox and the rights route instead of rendering a dead link.
 *
 * The value is read at request time, never folded in at build time: Next replaces a
 * `process.env.CONTACT_FORM_URL` expression with its build-time value, which would bake one
 * deployment's address into the artifact (`apps/web/lib/logging/runtime.ts` reads the database
 * credential the same way). This module is server-only; a client component must never import it,
 * because the address belongs to the deployment, not to a browser bundle.
 */

/** The one published route to the campaign: the external form, or the statement that it is absent. */
export type ContactChannel =
  | {
      readonly kind: 'configured';
      /** The published external form, already validated as an `http` or `https` address. */
      readonly formUrl: string;
    }
  | { readonly kind: 'unavailable' };

/**
 * The published privacy mailbox.
 *
 * Held here, in one place, because the screen's fallback state and the campaign's stated permanent
 * channel are the same address. The specification names the mailbox but does not fix its value yet,
 * so the coordinator can settle it without touching copy or markup (issue #135).
 */
export const PRIVACY_MAILBOX = 'privacy@oyodigitalparliament.ng';

/** The `mailto:` address the fallback state opens. */
export function privacyMailboxHref(): string {
  return `mailto:${PRIVACY_MAILBOX}`;
}

/**
 * Reads the configured channel.
 *
 * A value outside the two web schemes, an address with no host, or a value that is only whitespace
 * is treated as no channel at all: the screen renders its fallback state rather than a link the
 * browser cannot follow. Nothing here logs or echoes the value.
 *
 * Only an omitted argument reads the deployment value. A value handed in is used as given, even
 * `undefined`: it says "no channel", and it must not be silently replaced by whatever the
 * environment happens to hold (a default parameter would do exactly that, which is why this takes
 * a rest tuple - the arity is the distinction).
 *
 * @param supplied - Nothing, to read the deployment value; or one value to judge as it stands.
 * @returns The channel to render.
 */
export function readContactChannel(...supplied: [] | [unknown]): ContactChannel {
  const raw =
    supplied.length === 0 ? Reflect.get(globalThis.process.env, 'CONTACT_FORM_URL') : supplied[0];

  if (typeof raw !== 'string') return { kind: 'unavailable' };

  const value = raw.trim();
  if (value === '') return { kind: 'unavailable' };

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { kind: 'unavailable' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { kind: 'unavailable' };
  if (url.hostname === '') return { kind: 'unavailable' };

  return { kind: 'configured', formUrl: value };
}
