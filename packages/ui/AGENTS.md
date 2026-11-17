# packages/ui

`@odp/ui` is the design system for both surfaces of the Oyo Digital Parliament deployable: the public record and the `/admin` console. It owns the token layer derived from `docs/OyoDigitalParliament/branding.md`, the primitives, the shared record components, the form controls, the accessible charts and the accessibility utilities that every screen composes. Root `AGENTS.md` is the coordinator's manual: read it for repository-wide workflow, dispatch, and verification gates.

## Scope

This package is the single place where presentation is defined. A status label, a focus ring, a decision reason block or a chart is written once here and consumed everywhere, so the record cannot look like two different products on two screens. Every screen in `docs/OyoDigitalParliament/screens.md` and its `screens/` files composes this package rather than restating its markup.

It is presentation only. It does not fetch or cache data, call server actions or route handlers, read cookies or sessions, apply domain rules, format locale-sensitive values, author copy or generate assets. It does not import from `@odp/domain`, `@odp/db` or `@odp/inference`. Views pass typed, already-resolved props; the package renders them and nothing else.

Two requirements are implementation obligations here rather than page-level afterthoughts: `NFR-044` (WCAG 2.2 Level AA) for every component and state, and the package's own share of `NFR-001` (500 KB page weight) through the fonts, icons and marks it binds.

## Structure

The intended manifest is `packages/ui/package.json`, publishing the workspace package as `@odp/ui`. Phase 0 creates it; this file declares no dependency, script or version.

```text
packages/ui/
  AGENTS.md
  package.json                  created in Phase 0
  src/
    tokens/
      source.ts                 the only transcription of branding.md into code
      theme.css                 generated custom properties, light and dark
      tailwind.preset.ts        maps Tailwind scales onto those properties
    primitives/
    records/
    forms/
    charts/
    a11y/
    assets/
    test/
    index.ts                    the package barrel
```

**Manifest and barrel.** `package.json` is the package's only manifest and owns dependencies, scripts and export paths. Consumers import from the root barrel at `src/index.ts`; a deep import across the package boundary is a defect, because it lets a screen depend on a file that may move or disappear.

**Token source.** `src/tokens/source.ts` transcribes `branding.md` once: every colour family in both its light and dark columns, the type scale with its device values and weights, spacing, sizing, radii, shadows, focus treatment and motion. It is the only file in this package permitted to hold a literal colour, pixel value, shadow or duration. A value the branding document does not define is a specification gap to report, not a local decision.

**Generated outputs.** `src/tokens/theme.css` is generated from that source into namespaced CSS custom properties for the light and dark families, including the structural role mappings; `src/tokens/tailwind.preset.ts` maps Tailwind's colour, spacing, typography, radius and shadow scales onto those properties so a component never needs an arbitrary value. Both are build artifacts: regenerate them, never hand-edit them. A branding change arrives through the specification first, then through the source, then through regeneration.

**Primitives.** `src/primitives/` holds one folder per component: the component, its variant and size unions, and its test. Primitives know nothing about submissions, wards, decisions, sessions or roles. They take semantic props, render accessible markup and style themselves only through the token layer. Every variant union is exhaustive, so an unknown value fails the typecheck instead of falling through to a default.

**Record components.** `src/records/` holds the shared components named in `screens.md`: the record header, footer, commitment row, decision reason block, status label and sign-in prompt. They compose primitives and receive already-resolved slot props, because the caller owns the copy and the data. They never fetch, never decide what a role may see, never truncate a reason or hide it behind a disclosure, and never render a status without its word. The single status label takes the caller's translated word plus a status key, and the key selects the marker and tone from the branding mapping; it never chooses the text.

**Forms.** `src/forms/` owns labelled field composition: label binding, hint and error association, required and optional markers, character counts, the inline error summary, and the pending, disabled and read-only presentation of a control. Validation rules, messages and permitted values arrive from the caller; the package renders them and owns neither the rule nor the sentence. The same field components serve the public forms and the admin console, so their states cannot diverge.

**Charts.** `src/charts/` implements only the chart forms `branding.md` permits, with the reference line, the legend and direct labels as first-class parts of each component. A chart receives resolved, labelled series; every value appears as text in the DOM, every series carries its marker, keyboard users can reach the values, and no meaning depends on hover or on colour. A new chart type is a specification change, not a new folder.

**Accessibility utilities.** `src/a11y/` holds the focus ring and skip-link primitives, visually hidden text, a live-region announcer for polite and assertive outcomes, reduced-motion handling, and the contrast-checked token pairings. Components consume these utilities rather than reimplementing focus, announcement or hiding behaviour.

**Asset bindings.** `src/assets/` maps the slots in `assets/ASSETS.md` to typed bindings: the mark and its lockup forms, the seven pillar glyphs, the interface icons, the ten status markers and the two font files. Nothing here redraws, recolours, crops, inlines or vendors a second copy. A missing slot is reported, not substituted, and a pillar never borrows another pillar's glyph.

**Tests.** Tests sit beside the file they cover and are named for it, such as `Button.test.tsx` beside `Button.tsx`. A shared render and axe helper lives in `src/test/` with the single setup file. Each test renders every state the component declares, asserts the accessible name or role rather than a class name, and runs the accessibility check in both token families.

**Placement.** A component belongs in this package when two or more screens use it, or when it carries brand, status, asset or accessibility behaviour that must not drift. A single-use composition stays in its route. A new primitive goes to `src/primitives/`, a new shared record component to `src/records/`, and either is exported from the barrel with its test beside it.

## Task rules

- Work only inside the issue's `Own` paths; everything outside `Own` is read-only.
- Code tasks never write under `docs/`. A doc gap becomes a `doc-gap` issue.
- Commit only your owned paths. Conventional Commits linking spec and issue (e.g. `Implements: FEAT-###`, `Fixes #<n>`). Never `git add -A`.
- Branch from `main` with `<class>/<issue-number>-<slug>` (e.g. `implement/12-feat-001-auth`), open a PR, never push to `main`.
- In code and tests, cite permanent spec anchors (`FEAT-###`, `NFR-###`, `EVT-###`, or `C-###`). Commits and PRs link the spec and the GitHub issue.
- Implement all states, schemas, and events assigned to your area; never leave stubbed states or skip declared non-happy paths.
- Never log or commit secrets, tokens, or unmasked identity; credentials live in the secret store.
- Document code inline with docstrings and comments on non-obvious logic; skip trivial comments. Never create ad-hoc markdown documentation files.
- Write lean unit tests for the behavior your issue names.
- If a contract is wrong or incomplete, report a change request; never deviate.
- Execute strictly against the assigned issue contract. Never modify files outside your owned paths. If feedback or findings uncover defects outside your scope, report back to the coordinator for triage rather than performing out-of-scope edits.
- Do not reinvent the wheel: prefer established, battle-tested ecosystem packages over bespoke implementations. Research standard libraries and agree with the user before adding or changing external dependencies.
- Packages and dependencies belong strictly in this area's coordinating manifest, never in `AGENTS.md`.
- If blocked, state the assumption or ask for clarification before proceeding.
- When a fact resists you, verify it with evidence before falling back on recall.
- User-facing copy reads as human-written.

## Discipline

- **One source for design values.** Colour, type, spacing, sizing, radius, shadow, focus treatment and motion come from `branding.md` through `src/tokens/source.ts` and its generated output. No hex literal, functional colour, pixel font size, shadow string, arbitrary Tailwind value or invented breakpoint appears in a component, a preset consumer or a test fixture. A value the branding document does not carry is reported as a specification gap.
- **Server-first, hydrated only for interaction.** Every component renders meaningful, navigable markup with scripting disabled, because the public record must be readable before a bundle arrives. A client boundary is added only for transient state, focus management or gesture, is placed at the smallest leaf that needs it, and never wraps a page, a list or a record block. If a component can be a server component, it is one.
- **State is word, then shape, then colour.** Every status label, outcome badge and chart series renders its word first and its marker second; colour is an accent. A component that communicates state only through a token colour, or that drops the word when space is tight, is broken. The same rule governs errors, offline notices and disabled controls: the reason is text, never a tint.
- **Accessibility is the component's contract.** Controls are labelled and their hints and errors are associated; touch targets meet the branding minimum for mobile and tablet, never below 44px, and the desktop minimum with spacing; focus shows the specified visible ring with offset and is never removed without an equivalent; asynchronous outcomes announce through a live region; a dialog traps focus and returns it; both token families are contrast-checked. axe clean is the floor, not the proof.
- **No copy, no formatting, no domain knowledge.** Every visible string arrives as a prop from the externalised message catalogue, already translated. The package concatenates no sentence, pluralises nothing, and formats no date, number, currency or list; `Intl` and `toLocaleString` do not appear in shipped source. Props are explicit, `any` is banned, and a component that can be empty, loading, errored or disabled exposes each as a prop instead of guessing from its input.
- **Presentation only, motion only for confirmation.** No import from `@odp/domain`, `@odp/db` or `@odp/inference`, no `fetch`, no server action, no cookie or session read, no route handler, no asset generation. Charts use only the permitted forms and direct-label every value. Motion appears only to confirm that a write was accepted, respects reduced motion, and never delays reading or animates data into place.

## Checks

The Phase 0 manifest defines the commands; every gate below exists as a package script and runs in CI. Run the gates from `packages/ui` before handing work back.

- **Typecheck.** Strict TypeScript with no `any`, no suppression comment left in shipped source, and exhaustive handling of every variant and state union.
- **Unit tests.** Vitest covers every exported component and helper, with one case per declared state and per status key.
- **Accessibility.** Testing Library plus axe on every state fixture, in light and dark, with zero violations under the WCAG 2.2 AA rule set. A manual keyboard pass covers focus order, the ring, dialog focus trap and return, and live-region announcement.
- **Server render.** Every component renders through the server path with no client JavaScript; a new client boundary is named and justified in the pull request.
- **Token audit.** A scan of `src/` and of class usage finds no hex or functional colour, no raw font-size pixel, no arbitrary Tailwind value, and no hand-written shadow or duration outside `src/tokens/source.ts`.
- **Copy and format audit.** No visible string literal in shipped source, no `Intl`, no `toLocaleString`, no template-literal sentence assembly.
- **Boundary audit.** No import of `@odp/domain`, `@odp/db` or `@odp/inference`, no `next/headers`, and no `fetch`, server action, cookie read or database client anywhere in the package.
- **Asset audit.** Every rendered mark, pillar glyph, interface icon, status marker and font resolves to a slot in `assets/ASSETS.md`; no second copy, redraw, recolour or glyph substitution exists in the package.
- **Chart audit.** Each chart renders every value as text and every series with its marker; nothing is hover-only or colour-only, and keyboard reach is verified.
- **Weight.** The production build reports the package's shipped CSS and JavaScript plus the fonts and icons it binds, and the public record's total stays inside the `NFR-001` budget.

## Definition of Done

- The change names the spec anchor it implements (`FEAT-###`, `NFR-###` or `C-###`) in its test or docstring, and cites the contract where it renders a frozen shape.
- Every state the component declares exists, is reachable by keyboard, and passes accessibility checks in both token families.
- Tokens were regenerated from source rather than edited in the generated file; both families resolve and the structural role mappings hold.
- No literal design value, visible copy, locale formatting, network call, domain import or second asset copy was introduced.
- The barrel exports the component, its prop types and its state types; no consuming route needs a deep import.
- The component was checked at mobile, tablet and desktop widths with Yoruba-length text and a long submitted body, without clipping, mid-word truncation or a hidden reason.
- Only paths under `packages/ui` were touched, and the pull request links the issue and the specification.
