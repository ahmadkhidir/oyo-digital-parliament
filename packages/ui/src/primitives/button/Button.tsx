/**
 * Button primitive — `branding.md`, Component Tokens → Buttons; `NFR-044`.
 *
 * Five variants at the component-token colours. Hover maps to the adjacent darker declared
 * shade only where the branding table allows it (primary 700→900, secondary 100→300); the
 * destructive, outline and ghost hover states are a reported specification gap and carry no
 * hover class. Disabled reduces the background to its family's tinted (100) shade; the
 * branding sentence "at reduced opacity" defines no value, so no opacity utility is used and
 * the label falls to `text-secondary` to stay legible on the tinted fill — that text
 * assignment is part of the same reported gap, not a local colour decision. The focus
 * treatment is the shared ring (`src/primitives/focus-ring.ts`).
 *
 * The loading state renders the A-025 glyph (Tabler `loader-2`, sourced at the exact upstream
 * path data pending the asset slot file) beside the unchanged label and marks the control
 * `aria-busy`. Motion appears only to confirm a write in flight and respects reduced motion
 * (packages/ui/AGENTS.md, "Presentation only, motion only for confirmation").
 *
 * Every visible string arrives as the button's children; the component renders no copy of its
 * own. `type` defaults to `button` so a stray press never submits an unintended form.
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { focusRingClasses } from '../focus-ring';

/** The five button variants (`branding.md`, Component Tokens → Buttons). */
export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';

/**
 * Per-variant classes, one row of the component-token table each. The literal class names are
 * the token references; Tailwind resolves them against the generated custom properties, so no
 * colour or spacing value is restated. Disabled uses the tinted (100) shade of the variant's
 * background family — see the module docstring on the reported opacity gap.
 */
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-700 text-primary-100 hover:bg-primary-900 disabled:bg-primary-100 disabled:text-text-secondary',
  secondary: 'bg-primary-100 text-primary-700 hover:bg-primary-300 disabled:text-text-secondary',
  outline: 'border border-primary-500 text-primary-500 disabled:text-text-secondary',
  ghost: 'text-text-secondary',
  destructive: 'bg-error-900 text-error-100 disabled:bg-error-100 disabled:text-text-secondary',
};

/** Geometry and type shared by every variant (`branding.md`, Component Tokens → Buttons). */
const baseClasses =
  'inline-flex h-button select-none items-center justify-center gap-sm rounded-md px-lg py-md text-body';

const disabledClasses = 'disabled:cursor-not-allowed';

/**
 * The A-025 glyph (Tabler `loader-2`, outline): the upstream 24×24 arc path, inlined verbatim
 * until `assets/ASSETS.md` slot A-025 is generated, at which point this binding moves to the
 * slot file. `currentColor` carries the variant's text token; the spin confirms pending work
 * only and stops under `prefers-reduced-motion`.
 */
function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="size-icon shrink-0 animate-spin motion-reduce:animate-none"
    >
      <path d="M12 3a9 9 0 1 0 9 9" />
    </svg>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** One of the five component-token variants; required, so a caller never falls through to a default. */
  variant: ButtonVariant;
  /** A write has been accepted and not yet confirmed: spinner, `aria-busy`, control disabled. */
  isLoading?: boolean;
  children?: ReactNode;
}

/** Build the class string for one variant. Exported for the rare anchor that must carry a button's presentation (the sign-in prompt's continue action). */
export function buttonClasses(variant: ButtonVariant, className?: string): string {
  return [baseClasses, variantClasses[variant], focusRingClasses, disabledClasses, className]
    .filter(Boolean)
    .join(' ');
}

export function Button({
  variant,
  isLoading = false,
  disabled,
  className,
  children,
  type,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      className={buttonClasses(variant, className)}
      // Loading keeps the control out of traversal while the write is in flight; `aria-busy`
      // announces the pending state without inventing a label the message catalogue never wrote.
      disabled={disabled === true || isLoading}
      aria-busy={isLoading || undefined}
      {...rest}
    >
      {isLoading ? <Spinner /> : null}
      {children}
    </button>
  );
}
