/**
 * The shared focus treatment (`branding.md`, Accessibility): a visible 2px `primary-500` ring
 * with a 2px offset over the base surface, on every interactive element this package renders.
 *
 * Applied with `:focus-visible` so pointer clicks do not announce the ring while keyboard and
 * assistive-technology traversal always does. Every class here resolves to a `theme.css`
 * custom property through the Tailwind mapping — `ring-offset-surface` tracks the active token
 * family, so the offset stays correct in the dark column. The treatment's width, offset and
 * colour come from the focus tokens (`src/tokens/source.ts`); no value is restated here.
 */
export const focusRingClasses =
  'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
