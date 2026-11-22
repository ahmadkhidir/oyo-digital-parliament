# ADR-005: Entry screens follow the register direction

- Status: Accepted
- Date: 2026-11-19
- Supersedes: none

## Context

The screen specification now states components and states without prescribing placement: "the
implementer may add what the screen needs to be complete, and decides how it is composed, styled, and
laid out" (`screens.md`). The first implementation of Sign In, Registration and Number Confirmation
was built for completeness, with bare semantic markup, and three facts undercut its presentation:

1. The brand mark and the two font slots were never served by the deployable, so the product rendered
   in fallback faces without its mark.
2. Tailwind did not scan `packages/ui`, because the workspace package resolves through `node_modules`.
   Every utility that existed only in the design system - the button fill, its height, the focus ring,
   the footer gaps - was missing from the shipped stylesheet.
3. Nothing set the visual relationship between the three entry screens, so each page opened without
   context and the code step had no focus of its own.

The brand asks for something closer to a well-kept register than to a website, with almost no motion,
and it names the register as the mark's own concept.

## Decision

Adopt one presentation direction for the entry screens, expressed through shared components:

1. **The register frame.** Paper surface, Noto Serif for the screen title, a left margin rail from
   desktop that carries the mark, the tagline and an index of the entry screens, and hairline rules
   between sections. On tablet and mobile the rail folds into a compact index above the title. The
   screen title closes with a rule and, where the screen declares one, a quiet exit route beside it.
2. **Numbered entries.** Multi-field forms number their lines in the margin in the display face. The
   ordinal is decorative and hidden from the accessibility tree; the label always names the control.
3. **One visible system of states.** A shared `Notice` primitive carries the alert and inline-message
   components: a tinted, bordered block with a caller-chosen tone, an optional strong first line and an
   optional recovery action. Tone supplies only the tint; the sentence is always the reason. The
   demoted action in the expired-code state becomes an outline button so it stays visible without
   competing with the lead action.
4. **Mobile posture from the brand.** The form's primary action is bottom-anchored on mobile and joins
   the flow at the end of the form from tablet, matching the declared single-column, bottom-anchored
   posture. No motion is added beyond the button's pending spinner.
5. **Assets are bridged, not duplicated.** `apps/web/scripts/sync-assets.mjs` copies the ledger's mark,
   font, icon and status files from `assets/` into the application's `public/` directory at dev and
   build time. The destination is git-ignored, and the mark's ink and knockout forms swap on the token
   family so the brand's one-tone reversal holds in both themes.
6. **The design system is a Tailwind source.** The stylesheet entry declares `@source` for
   `packages/ui/src`, so a utility is generated from the component that owns it, not only when a route
   happens to use the same class.

## Consequences

- The three entry screens share one shell, one index and one notice, and every later screen can adopt
  the same frame instead of inventing a second visual language.
- The mark and the brand fonts now render, which was a correctness defect as well as a design one; the
  page-weight budget gains only the two font files already planned for it.
- `apps/web/public/` is generated output and must never be edited or committed; a missing ledger file
  fails the build rather than falling back silently. The standalone server bundle must include that
  directory, as Next does not copy `public/` into it on its own; the container task owns that copy.
- The console shell and the public record screens still choose their own composition within the same
  tokens. This decision fixes the entry direction only; a console direction is a later decision.
- The test suite proves state content, not appearance. The direction was checked in both token families
  and both launch locales at mobile, tablet and desktop widths before this record was accepted.
