/**
 * Record Header — `docs/OyoDigitalParliament/screens.md`, Shared / Common Components.
 *
 * Four fixed pieces, one per row of the screen table:
 * - Lockup (mark + name link) fixed top left. The mark is an image and holds nothing; it sits
 *   beside the name, never around it. The name is set in the body family at `body-strong`
 *   (the lockup setting in `assets/ASSETS.md`, Family: Brand mark) and is never shortened; on
 *   a narrow screen the mark yields first, because the caller can simply omit it.
 * - Menu fixed top right, a `<details>` disclosure so the record destinations open with no
 *   scripting at all — the server-render path of `packages/ui/AGENTS.md`.
 * - Ward fixed bottom left on mobile, top centre from tablet.
 * - Sign-in fixed bottom right on mobile and inside the menu from tablet.
 *
 * The mark, the product name and every word arrive as props; the component binds no asset and
 * authors no copy. Positioning, surface and the focus treatment use the generated token layer
 * only.
 */
import { focusRingClasses } from '../../primitives/focus-ring';

/** One resolved destination: the caller owns the copy and the address. */
export interface HeaderDestination {
  href: string;
  label: string;
}

export interface RecordHeaderProps {
  /** The product name, translated; the lockup's link back to the record home. */
  productName: string;
  homeHref: string;
  /** The brand mark (slot A-001), bound by the caller; omit it and the mark yields first on a narrow screen. */
  markSrc?: string;
  markAlt?: string;
  /** The Menu control's word. */
  menuLabel: string;
  /** The record destinations the Menu opens. */
  destinations: readonly HeaderDestination[];
  /** The member's ward (slot.ward), present only when a member is signed in. */
  ward?: HeaderDestination | null;
  /** The sign-in action (slot.sign-in), present only when the visitor is signed out. */
  signIn?: HeaderDestination | null;
}

/** Classes for one floating piece of header chrome. */
const chromeClasses = `fixed z-40 flex items-center bg-surface shadow-sm ${focusRingClasses}`;

export function RecordHeader({
  productName,
  homeHref,
  markSrc,
  markAlt,
  menuLabel,
  destinations,
  ward,
  signIn,
}: RecordHeaderProps) {
  return (
    <header>
      {/* Lockup: the mark beside the name, one unit. The name never shortens or wraps. */}
      <div className={`${chromeClasses} left-0 top-0 h-button gap-sm px-md`}>
        {markSrc ? (
          // Plain <img>, not next/image: this package never imports the framework
          // (packages/ui/AGENTS.md, Boundary audit); the caller owns the asset binding.
          <img src={markSrc} alt={markAlt} className="size-icon shrink-0" />
        ) : null}
        <a
          href={homeHref}
          className={`whitespace-nowrap text-body-strong text-text-primary ${focusRingClasses}`}
        >
          {productName}
        </a>
      </div>

      {/* Menu: a <details> disclosure, so the destinations are reachable with scripting disabled. */}
      <details className="fixed top-0 right-0 z-40">
        <summary
          className={`relative flex h-button cursor-pointer list-none items-center bg-surface px-md text-body text-text-primary shadow-sm ${focusRingClasses}`}
        >
          {menuLabel}
        </summary>
        <nav
          aria-label={menuLabel}
          className="absolute top-full right-0 mt-xs w-max max-w-full rounded-md bg-surface p-sm shadow-md"
        >
          <ul className="flex flex-col">
            {destinations.map((destination) => (
              <li key={destination.href}>
                <a
                  href={destination.href}
                  className={`flex min-h-button items-center rounded-md px-md py-sm text-body text-text-primary hover:bg-primary-100 ${focusRingClasses}`}
                >
                  {destination.label}
                </a>
              </li>
            ))}
            {signIn ? (
              // The sign-in action joins the menu from tablet, where the table moves it out of the fixed bottom row.
              <li className="hidden tablet:block">
                <a
                  href={signIn.href}
                  className={`flex min-h-button items-center rounded-md px-md py-sm text-body text-primary-500 ${focusRingClasses}`}
                >
                  {signIn.label}
                </a>
              </li>
            ) : null}
          </ul>
        </nav>
      </details>

      {/* Ward: the member's ward, reachable on every device class. */}
      {ward ? (
        <a
          href={ward.href}
          className={`${chromeClasses} bottom-0 left-0 h-button px-md text-small text-primary-500 tablet:bottom-auto tablet:left-1/2 tablet:top-0 tablet:-translate-x-1/2`}
        >
          {ward.label}
        </a>
      ) : null}

      {/* Sign-in: fixed bottom right on mobile; inside the menu from tablet. */}
      {signIn ? (
        <a
          href={signIn.href}
          className={`${chromeClasses} bottom-0 right-0 h-button px-md text-body text-primary-500 tablet:hidden`}
        >
          {signIn.label}
        </a>
      ) : null}
    </header>
  );
}
