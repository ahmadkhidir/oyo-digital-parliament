# ADR-001: Technology stack and platform choices

- Status: Accepted
- Date: 2026-11-18

## Context

The specification defines a web-only, SSR-plus-hydration monolith for Oyo Digital Parliament. It
requires public pages that stay readable on a throttled 3G connection without scripting, a relational
authority for the record, a read cache, full-text search, an append-only audit log, object storage,
scheduled obligations, a role-scoped staff console, and four model capabilities behind one de-identified
gateway. Member data must remain in Nigeria, the interface must ship in English (Nigeria) and Yoruba, and
every page must meet WCAG 2.2 AA within a 500 KB budget. The build window is twelve working days to a
public launch on 30 November 2026.

The stack and the platform decisions below were confirmed with the product owner before any code was
written. They are binding for every roadmap phase.

## Decision

### Stack

| Layer | Choice |
|---|---|
| Language | TypeScript 5.x, `strict` |
| Runtime | Node.js 24 LTS |
| Application | Next.js App Router + React, one deployable |
| Workspace | pnpm 10 workspaces + Turborepo |
| Database | PostgreSQL 16 + Drizzle ORM and drizzle-kit |
| Cache, sessions, rate limits | Redis 7 |
| Search | PostgreSQL full-text search (`tsvector`) |
| Object storage | S3-compatible bucket |
| SMS | Nigerian SMS gateway behind a provider port |
| Model access | One Inference Gateway, provider-agnostic, pinned per capability |
| Styling | Tailwind CSS driven by generated design tokens |
| Localisation | Externalised messages, en-NG and yo-NG |
| Tests | Vitest, Testing Library, Playwright, axe, k6 |
| CI/CD | GitHub Actions |
| Hosting | Docker containers, single Nigerian region, rolling replacement |

### Repository topology

The specification lives in its own private repository,
`https://github.com/ahmadkhidir/oyo-digital-parliament-docs`, and is mounted at `docs/` as a git
submodule. The application repository records only the pointer. Specification commits happen in the docs
repository; the pointer bump is a separate PR here. This keeps specification churn out of code review and
keeps a clean, isolated context for specification work.

### Platform decisions

1. **One deployable.** The public record and the `/admin` console are route groups in the same Next.js
   application. The console is role-scoped at the boundary, not separated into a second service. This
   matches the monolith in `architecture.md` and keeps one release, one set of contracts and one
   migration path.

2. **Domain outcomes.** Expected business failures are returned as a discriminated `Result` carrying the
   contract `code`, a stable `cause`, and field errors. Unexpected programming or infrastructure failures
   throw. The transport layer maps both to the frozen error envelope in `C-001`; no domain use case
   returns a framework response.

3. **Enum storage.** Enum values are declared once in `packages/db/src/schema/enums.ts` and stored as text
   columns with generated `CHECK` constraints. This keeps migrations reversible and satisfies the
   one-release backward-compatibility rule, while still rejecting an invalid value at the database.

4. **Design tokens.** The token layer lives at `packages/ui/src/tokens/` and generates CSS custom
   properties plus the Tailwind preset. There is no separate theme package at this scale.

5. **Charts.** Ward and report-card charts are hand-built accessible SVG and CSS primitives, not a chart
   dependency. The specification calls for one horizontal bar form and one line form, direct-labelled and
   sparse; a chart library would cost more page weight than the two forms it replaces.

6. **Assisted-intake durability.** The assisted-intake route uses an IndexedDB-backed queue with a
   service worker scoped to `/admin/intake` only. Replays are idempotent on the contract's client record
   identifier and preserve the original submission time. No public route registers a service worker, so
   the scripting-disabled read path is unaffected.

7. **Inference fallback ownership.** The Inference Gateway returns nothing on timeout, refusal, provider
   error, or a disabled flag. The consuming feature owns its deterministic fallback — alias matching for
   wards, string matching for duplicates, the chronological queue for moderation, and manual
   reconciliation for budget lines. Feature ranking logic never moves behind the model egress boundary.

8. **Cost accounting.** Provider spend is normalised to USD micros and compared against the per-1,000-unit
   ceilings in `nfr.md`. `costMicros` in the gateway contract is USD micros.

9. **Operational probes.** The application and the worker expose `GET /healthz` for liveness and
   `GET /readyz` for readiness. Both are data-free and unauthenticated, and the reverse proxy restricts
   them to the uptime monitor. They are foundation infrastructure, recorded here because the contract
   set predates them.

10. **Provider ports.** The SMS gateway and the model provider are adapters behind ports. Phase 0 wires a
    test double for each and selects the production provider; no feature imports a vendor SDK. The model
    provider is chosen only when its data-processing agreement and processing region satisfy `NFR-045`.

## Consequences

- Toolchains and package manifests are bootstrapped and pinned during Phase 0 (Foundation).
- Commands for build, test, boot, lint, migrations and evaluation are wired into workspace scripts and CI.
- Code in every later phase conforms to these choices; changing one requires a new ADR.
- The docs submodule adds one operational step: `git submodule update --init --recursive` after a clone,
  and a separate pointer-bump PR for every specification change.
- The Nigerian single-region constraint means managed-service availability may be narrower than a
  hyperscaler region. The Docker-based deployment keeps the provider replaceable.
- Hand-built charts and the in-package token layer reduce dependencies but make `packages/ui` responsible
  for the accessibility of both.

## Open specification gaps

These were surfaced while authoring the contracts and area manuals. They are recorded here so they are
not lost, and each becomes a `doc-gap` issue before the phase that needs it. They are **not** decided by
this ADR.

1. **One live decision has no schema marker.** `Decision` carries `supersedesDecisionId` but no live flag
   or superseded timestamp, so a database constraint for "at most one live decision" needs a schema
   decision.
2. **The worker run ledger has no entity.** The worker contracts require a durable prior result for a
   repeated run key, but `schema.md` defines no job-run record.
3. **In-product search has a contract but no surface.** `C-038` and `NFR-009` require search; no screen in
   `screens.md` declares a search control or route.
4. **`/admin` has no landing screen.** Contracts name `/admin` as an action surface, while the screen
   inventory begins at `/admin/intake` and `/admin/queue`.
5. **The seven pillar objects are not in Tabler.** The branding document fixes both the Tabler set and
   seven named objects that Tabler does not contain. Either the substituted objects are named or seven
   custom glyphs are commissioned on the Tabler grid.
6. **Social preview cards are not declared.** `assets/ASSETS.md` defines them because links are shared;
   the specification should state which surfaces emit preview metadata.
7. **Handover publication authority is asymmetric.** The handover job publishes its own public notice in
   `C-088`, while report cards are staged for staff publication in `C-084`. The asymmetry should be
   stated explicitly upstream.
