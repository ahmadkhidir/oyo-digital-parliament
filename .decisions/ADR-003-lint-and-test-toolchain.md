# ADR-003: Lint, format and browser-test toolchain

- Status: Accepted
- Date: 2026-11-18

## Context

The Phase 0 workspace scaffold established a pnpm/Turborepo toolchain, but the first lint pass was
TypeScript hygiene only (`tsc --noEmit --noUnusedLocals --noUnusedParameters`). The area manuals depend on
rules TypeScript cannot express: import boundaries that keep vendor SDKs and private packages out of the
wrong areas, a ban on raw interface copy in components, a requirement that a suppression comment states
its reason, and JSX accessibility checks. The confirmed stack also names Playwright and axe, but no
browser-test configuration existed, so `test:e2e` and `test:a11y` could not run.

Leaving this as "lint is tsc" would make the area manuals aspirational and the Phase 0 gate unable to
verify the claims it inherits.

## Decision

Adopt one repository-wide lint, format and browser-test toolchain:

1. **ESLint 9 flat config at the repository root** (`eslint.config.mjs`) with TypeScript, import-boundary,
   JSX accessibility and repository rules. The import-boundary rule keeps `@odp/domain`, `@odp/db` and
   `@odp/inference` out of `packages/ui`, vendor SDKs inside their adapter directories, and direct database
   access out of `apps/web`. The copy rule fails a raw interface string rendered in a component, and a
   suppression comment without a stated reason fails review.
2. **Prettier** for formatting, with one root config and an ignore file. Formatting is not a review topic.
3. **Every area's `lint` script runs ESLint**; `typecheck` remains TypeScript. The root `pnpm lint` runs
   both through Turborepo, so a green lint run means both.
4. **Playwright config at `apps/web/playwright.config.ts`**, wiring `test:e2e` and `test:a11y`; the gate
   owns the actual flows and axe scans.
5. **A `test:integration` script** for adapter and database integration suites that need disposable
   PostgreSQL, Redis or object storage.
6. **CI runs lint, typecheck, unit, build, migration, e2e and accessibility checks.** A capability that
   cannot run in CI is named in the task that introduces it.

`--passWithNoTests` is permitted only while an area has no suite; it is removed before the Phase 0 gate.

## Consequences

- ESLint, Prettier and their plugins join the workspace catalog and the lockfile; the stack table gains a
  lint and format row.
- The area manuals' Checks sections become enforceable rather than aspirational.
- The Phase 0 gate can verify import boundaries, copy discipline and browser accessibility, not only types.
- Formatting churn is isolated from behaviour review, and a suppression must explain itself.
- The first CI run after this decision may surface violations in scaffold code; fixing them belongs to the
  task that introduced the code, not to a threshold relaxation.
