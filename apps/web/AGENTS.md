# apps/web

This file is authoritative for work in this directory and its subdirectories. Root `AGENTS.md` is the coordinator's manual: read it for repository-wide workflow, dispatch, and verification gates. This area is the single deployable: one Next.js App Router application serving the public record and the role-scoped `/admin` console. Its intended manifest is `apps/web/package.json` (`@odp/web`), created in Phase 0.

## Scope

Routing, Server and Client Components, server actions, route handlers, session and role enforcement, request validation, cache tags and invalidation, internationalisation, progressive enhancement, accessibility and telemetry dispatch for every route in the screen inventory.

It does not own business invariants (they live in `packages/domain`), schema or queries (`packages/db`), design tokens and primitives (`packages/ui`), model calls (`packages/inference`) or scheduled jobs (`services/worker`). The issue's `Own` paths are binding; everything outside `Own` is read-only.

## Structure

Route groups are the shells a screen runs inside, so a group is chosen by the screen file's header and footer, never by convenience.

```
apps/web/
  app/
    layout.tsx          document shell: language, locale, skip link
    (record)/           public record and the member's own surface, under Record Header and Footer
    (entry)/            sign-in, registration and the notice read before it, under the minimal header
    (admin)/admin/      staff console, under a guarded staff shell
    api/                one route.ts per route-handler contract
  components/           UI used by more than one route group
  lib/                  session, contract client, schemas, cache tags, telemetry, formatting
  messages/             en-NG and yo-NG catalogues
  styles/               stylesheet entry and the token bridge to packages/ui
  e2e/                  Playwright flows and axe scans
```

- `app/(record)/` — `/`, `/submit`, `/s/[reference]`, `/commitments`, `/declined`, `/wards/[ward]`, `/report-card`, `/sessions/[id]`, `/me`.
- `app/(entry)/` — `/sign-in`, `/join`, `/join/confirm`, `/join/ward`, `/privacy`.
- `app/(admin)/admin/` — `/admin/intake`, `/admin/queue`, `/admin/queue/[reference]/decide`, `/admin/moderation`, `/admin/legal`, `/admin/wards/review`, `/admin/report-card`, `/admin/sessions/[id]/compose`, `/admin/data-requests`. The group layout resolves the staff session, role and second factor before any child renders; admin actions re-check the same facts rather than trusting the layout.
- **New screen.** Create the segment inside the group whose shell its screen file declares, with `page.tsx` naming the screen file it implements in its module docstring. Add `loading.tsx` or `error.tsx` only for the fetch-level states a route boundary can distinguish; states that depend on a datum — partial, suppressed, withheld, overdue, thread locked — stay in the page, because a boundary cannot tell them apart.
- **Form action.** A server action lives in the folder of the component that renders its form: `actions.ts` beside the route's `page.tsx`, or beside a shared component in `components/` when that component is the form. One exported action per contract entry its form posts to; never a catch-all actions module.
- **Shared component.** Keep a component beside its route in an underscore folder while one route uses it, and move it to `components/` when a second route group needs it. Never duplicate it. The shared components named in `screens.md` live in `components/` from the start.
- **Route handler.** One `route.ts` under `app/api/`, at the exact path its contract names: parse, authorise, validate, call the domain, return the shared envelope. No rendering and no business rule. A Server Component resolves its read through the read contract's domain boundary, never by calling this app's own `/api` endpoint over HTTP.
- **Test.** Unit and component tests sit beside the module as `*.test.ts` or `*.test.tsx`; Playwright flows and axe scans sit in `e2e/`, one file per flow in `user-flow.md`. A test name cites the screen file and the contract entry it exercises.

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

- **Server first; a client component earns its place.** Render with Server Components until an interaction cannot be expressed as a form post or a navigation, then take the smallest client boundary that carries it. Every public route returns its primary content as server HTML: readable, navigable and complete with scripting disabled. A form posts as a plain request, enhances only once the base submission works, and a failed enhancement re-renders with the submitted values still in the fields.
- **Every write is the contract entry that owns it.** Mutations are a server action or route handler named in `CONTRACTS.md`, with its envelope and idempotency key; never invent an endpoint, and never open a database query or a model call from this area. Re-validate the payload at the action boundary even when the browser validated, and map a field failure onto the control that produced it rather than a page-level apology.
- **Session and role decide access; personal data never leaves the server.** Authorise every action and every read from the resolved session and role, never from whether a control is rendered. `/admin` is unreachable without a staff session and a satisfied second factor, enforced in the console layout and again in each admin action. Name, telephone number, member identifier, ward description and free text never enter a client bundle, a URL, a cache key, a log line or an event payload, and the external reviewer's surface is built from data that has no member object to leak.
- **Cache tags are declared here and invalidated by the write that changes them.** Tag each read with the entities and period it renders, and invalidate every affected tag from the action that publishes or revises a decision, removes or restores a comment, withholds or takes down an item, publishes or corrects a report card, changes a commitment, or resolves a ward. Nothing depends on the pre-warm job or a timer to make a figure true; a figure that outlives its source renders with its `asAt` and never as current.
- **A screen is done when every declared state renders, in both languages, for a screen reader.** The state table in the screen's own file is the checklist — empty, loading, error, submitting, success, withheld, overdue and the partials — with no stub and no state reachable only by the happy path. All interface strings resolve from `messages/` for `en-NG` and `yo-NG` with no concatenated sentences; dates, numbers and currency go through locale formatting; every input has a label, every asynchronous outcome is announced in a live region, focus is visible, and status is never carried by colour alone (`NFR-044`).
- **Weight is a budget; telemetry is a closed vocabulary.** Keep the public route inside the page-weight budget that `NFR-001` sets: no client library for a decorative effect, and no motion beyond the confirmation of a write. Emit events only through the telemetry dispatcher, only names and properties the taxonomy in `analytics.md` defines, keyed to a pseudonymous identifier — never free text, a name, a telephone number, a ward description or submission content.

## Checks

Run from the repository root; the scripts are declared in `apps/web/package.json`.

- `pnpm --filter @odp/web typecheck` — strict types across `app`, `components` and `lib`; an untyped contract payload fails it.
- `pnpm --filter @odp/web lint` — fails on a raw string literal rendered as interface copy and on a suppression comment with no stated reason.
- `pnpm --filter @odp/web test` — unit and component tests, including the action validation and the state mapping.
- `pnpm --filter @odp/web build` — the production build proves the route tree is legal: every segment, layout and metadata export compiles.
- `pnpm --filter @odp/web test:e2e` — Playwright with scripting disabled on the public reads and enabled on the writes, plus an axe scan on every route in both locales with no serious or critical violation.

## Definition of Done

- Every state its screen file declares renders and is reachable; no stub, no placeholder copy, no path that only works with scripting enabled.
- Every form round-trips through its server action and preserves submitted values on validation failure, write failure and lost connection.
- Every write validates at the boundary, carries its idempotency key, and returns the shared failure envelope with field-level reasons.
- Every read carries the tags its writes invalidate, and no page serves pre-publication figures as current.
- Both locales render the screen with no hardcoded date, number, currency or copy, and no personal data appears in a bundle, a URL, a cache key, a log or an event.
- The checks above pass, including the axe scan, the signed-out, signed-in and role-refused paths, and the second-factor gate on every admin route.
- Nothing outside the issue's `Own` paths changed, and no dependency was added outside `apps/web/package.json`.
