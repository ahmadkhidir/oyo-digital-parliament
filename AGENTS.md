# Oyo Digital Parliament — build guide

This repository is built from its specification by whichever coding agent is working in it. The rules
live with the code: this file coordinates the build, and the nearest `AGENTS.md` in a folder governs
work in that folder.

The product is a youth civic platform for Oyo State: residents aged 18 to 35 table ward-level proposals,
the campaign answers each one with a costed and dated commitment or a published reason for declining,
and every commitment is tracked in the open until it is delivered, dropped, or handed over. It is a
campaign instrument, disclosed as one. It is never a government body, never a campaign-contact tool, and
never a machine that decides.

## Source of truth

The specification is `docs/OyoDigitalParliament/`, mounted at `docs/` as a git submodule from
`https://github.com/ahmadkhidir/oyo-digital-parliament-docs`. The specification repository is
authoritative; this repository consumes it. This application repository is public; the specification
repository is private and access-controlled, so a public clone fetches the code but not the
specification unless the cloner has been granted access.

A build task never edits the specification. A gap in it becomes a `doc-gap` issue, not an assumption and
not a silent change. A missing field, an unhandled edge case, or a contradiction is a stop-and-report,
not a decision made in code.

### Specification modifications & subagent isolation

The specification is modified only in these situations:

1. **Unsettled requirement (`doc-gap`):** an implementation or verification task discovers an unhandled
   edge case, a missing data field, ambiguous behaviour, or a conflicting requirement. The worker pauses,
   logs the `doc-gap` issue, and halts implementation on that path.
2. **User-directed change:** the user requests a scope adjustment, a new feature, or a requirement
   revision.
3. **Architectural or platform shift:** a structural, scaling, or environmental change requires updating
   `architecture.md`, `schema.md`, or `nfr.md`.

**Mandatory subagent isolation:** specification modifications must never run inside an active coding or
debugging session. Mixing compiler logs, code diffs, and stack traces into specification writing
contaminates the product requirements. The coordinator dispatches a dedicated, isolated subagent
targeting `docs/` with a clean context window. That subagent loads `docs/AGENTS.md`, aligns with the
user, updates the specification under `docs/OyoDigitalParliament/`, and commits in the documentation
repository. The implementation session resumes only after the specification is committed and the
submodule pointer is bumped here.

## Where truth lives

| Question | Source | How to read it |
|---|---|---|
| What to build | `docs/OyoDigitalParliament/` | read the named document |
| Current phase | Lowest open `phase` issue | `gh issue list --label phase --state open` |
| Task scope | Issue body | `gh issue view <n>` |
| Ready work | Blocked-by links | `gh issue list --state open`, then `gh issue view <n> --json blockedBy` |
| Task status | Issue state | `gh issue view <n> --json state` |
| In flight | Pull requests | `gh pr list --state open` |
| Why a choice | `.decisions/` | `ls .decisions/`, `git log -- .decisions/` |
| Interfaces | `CONTRACTS.md` | the `C-###` entry |
| Asset paths | `assets/ASSETS.md` | the `A-###` row |
| Area rules | nearest `AGENTS.md` | `git ls-files '*AGENTS.md'` |
| Done | this file | Definition of Done and Verification |

State that changes per task or phase lives in GitHub. Decisions that outlive a task live in this
repository. Never copy live state into a file.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript 5.x, `strict` | One language across client, domain, data and worker; the schema and contracts are easier to keep honest |
| Runtime | Node.js 24 LTS | Current LTS, native `fetch`, stable test runner interop |
| Application | Next.js App Router + React, one deployable | SSR with hydration satisfies the 500 KB read path, progressive-enhancement forms, and a role-scoped `/admin` console without a second deployable |
| Workspace | pnpm 10 workspaces + Turborepo | Parallel area builds and cached tasks for a twelve-engineer build |
| Database | PostgreSQL 16 + Drizzle ORM and drizzle-kit | Relational authority, transactional decisions, full-text search, and typed migrations |
| Cache / sessions / limits | Redis 7 | Cached public pages, session state, rate-limit counters; invalidated on publication |
| Search | PostgreSQL full-text search (`tsvector`) | One fewer datastore; the search corpus is small and the read path is simple |
| Object storage | S3-compatible bucket | Exports, generated report cards, handover archive, evaluation artefacts |
| SMS | Nigerian SMS gateway behind a provider port | OTP delivery and decision notices; provider swappable without touching features |
| Model access | One Inference Gateway, provider-agnostic and pinned per capability | De-identification, timeouts, cost ceilings and flags in one place |
| Styling | Tailwind CSS driven by generated design tokens | Tokens come from `branding.md`; no hardcoded palette or type scale in components |
| Localisation | Externalised message catalogue, en-NG and yo-NG | Yoruba is a launch locale, not a later translation |
| Tests | Vitest, Testing Library, Playwright, axe, k6 | Unit, component, browser, accessibility and load verification |
| Lint & format | ESLint 9 flat config, Prettier | Import boundaries, copy discipline, accessibility rules and one formatter; see ADR-003 |
| CI/CD | GitHub Actions | Build, lint, typecheck, unit, browser, accessibility and migration checks on every PR |
| Hosting | Docker containers, single Nigerian region, rolling replacement | Member data stays in Nigeria; the read path scales independently of writes |
| Observability | Structured logs, audit log, uptime monitor, product events | No personal data in operational logs; the answer rate is computed from the record |

Changing a stack choice is a decision: record it in `.decisions/` and update this table.

## Repository structure

```text
.
├── AGENTS.md                     # coordinator manual (this file)
├── CONTRACTS.md                  # frozen interfaces, C-001 onward
├── README.md                     # human-facing repository guide
├── .decisions/                   # append-only architecture decisions
├── .github/                      # issue, PR and CI configuration
├── docs/                         # specification submodule (read-only from code tasks)
│   └── OyoDigitalParliament/     # the document set
├── assets/                       # visual asset ledger and generated files
│   ├── AGENTS.md                 # asset area manual
│   └── ASSETS.md                 # slot ledger and prompt families
├── infra/                        # local environment contract for the Compose stack
│   └── local/                    # validated environment and .env.example renderer
├── apps/
│   └── web/                      # Next.js application: public record + /admin
├── packages/
│   ├── domain/                   # business rules and use-case orchestration
│   ├── db/                       # PostgreSQL schema, migrations, repositories
│   ├── ui/                       # design tokens, primitives, record components
│   ├── inference/                # inference gateway and evaluation harness
│   └── platform/                 # config, SMS, object storage, Redis, clock, IDs
├── scripts/                      # CI, local-service and boot-verification tooling
│   ├── ci/                       # pipeline probes, export, audit, SBOM, verdict
│   ├── dev/                      # environment and Compose stack commands
│   └── verify/                   # built application and worker boot check
└── services/
    └── worker/                   # scheduled obligations
```

The workspace manifests and toolchains are established in Phase 0. No area may add a dependency outside
its own manifest.

## Area rules

Area rules live in the nearest `AGENTS.md`: any coding agent working in the area loads them. Read the
nearest `AGENTS.md` at or above the issue's `Own` paths. List them with `git ls-files '*AGENTS.md'`.

| Area | Manual | Responsibility |
|---|---|---|
| `apps/web` | `apps/web/AGENTS.md` | Next.js routes, server actions, route handlers, session enforcement, i18n, caching, progressive enhancement, telemetry dispatch |
| `packages/domain` | `packages/domain/AGENTS.md` | Business invariants and use cases; framework-agnostic, port-driven |
| `packages/db` | `packages/db/AGENTS.md` | Schema, migrations, repositories, indexes, FTS, idempotency, audit append |
| `packages/ui` | `packages/ui/AGENTS.md` | Design tokens and accessible presentation components |
| `packages/inference` | `packages/inference/AGENTS.md` | The only model egress; four capabilities, de-identification, evaluation |
| `packages/platform` | `packages/platform/AGENTS.md` | Configuration, SMS, object storage, Redis, clock and identifier adapters |
| `services/worker` | `services/worker/AGENTS.md` | Scheduled jobs: overdue check, report cards, anomaly review, cache warm, backup verify, handover |
| `assets` | `assets/AGENTS.md` | Asset slots and generated visual files |
| `infra` | `infra/AGENTS.md` | Local environment contract: one variable list from `packages/platform`, placeholder-only `.env.example`, no credential in the repository |
| `scripts` | `scripts/AGENTS.md` | CI, local-service and boot-verification tooling: Node ESM, deterministic output, explicit exit codes, no product imports |
| `docs` | `docs/AGENTS.md` | Specification work, in the documentation repository |

Code ownership is not enforced by `CODEOWNERS`; the issue's `Own` paths and the nearest `AGENTS.md` are
the boundary.

## Work classes

Every task is exactly one class:

- `implement` — writes product code, assets, and configuration under the issue's `Own` paths.
- `fix` — corrects a defect against an existing requirement, under the issue's `Own` paths.
- `verify` — writes test files and test configuration only, under the phase gate.
- `spec` — writes only under `docs/OyoDigitalParliament/`, governed by `docs/AGENTS.md`. Always executed
  in an isolated subagent.
- `chore` — tooling, CI, or repository plumbing with no product behaviour.

## Build workflow

1. **Read the specification.** Resolve `docs/OyoDigitalParliament/` and read every document at plan
   level: scope, personas, features, NFRs, roadmap, architecture, data model, screens, analytics,
   operations, release, branding, risks. The docs are the authority; recall is not.
2. **Adopt the roadmap.** Take its phases and their order as the build order. Do not re-sequence or
   re-group them. The phases are: Foundations; The Record Opens; Debate Under Rules; Every Ward;
   Reporting; Continuity; Sessions. If the roadmap is missing or silent on order, raise a doc gap.
3. **Phase 0: Foundation.** Before any roadmap feature phase is implemented, Phase 0 must be drafted,
   executed, and verified. Foundation sets up:
   - the pnpm workspace root, Turborepo pipeline, Node 24 pin and strict TypeScript base, and every
     area manifest named in Repository structure;
   - verified Git and GitHub infrastructure: remote repository configured, the mandatory `phase` label
     created, `gh` CLI operational with sub-issues and blocked-by dependencies, and `main` protected;
   - verified commands for build, test, boot, lint, typecheck, migrations and evaluation;
   - CI/CD in `.github/workflows/ci.yml` ensuring a clean install, build, lint, typecheck, unit,
     browser, accessibility and migration run;
   - a base test harness and a boot check that starts the app and the worker against disposable
     PostgreSQL and Redis;
   - design tokens and the theme layer generated from `branding.md`;
   - the base telemetry client and event dispatcher generated from `analytics.md`, with the fixed event
     taxonomy and no free-text properties;
   - the operational baseline: `/healthz` and `/readyz`, structured logging with no personal data, the
     database connection and migration harness, and a local Docker Compose stack for PostgreSQL, Redis
     and object storage;
   - the initial schema migration and deterministic seeds from `schema.md`, including the ward reference
     seed that does not assume an external authoritative dataset;
   - the SMS provider port, the model provider port and the object-storage adapter, each with a test
     double;
   - foundational assets: generate every pending core brand asset in `assets/ASSETS.md` that Phase 0
     owns (mark, forms, favicon, lockups, pillar icons), after any branding gap is settled.
   Roadmap feature phases (Phase 1 onward) are strictly blocked by Phase 0.
4. **Confirm frozen contracts.** `CONTRACTS.md` is frozen at version 1.0.0. Verify that every interface
   a task depends on is `Frozen` before dispatch. An interface change is a `change-request` issue and a
   PR that updates both sides; never deviate silently.
5. **Draft the dispatch plan.** One phase issue for Phase 0 and one phase issue per roadmap phase, each
   parented with child task issues.
   - **Declare the Phase Specification Slice:** in each phase issue, record the complete slice the phase
     delivers: roadmap features (`FEAT-###`), screens (`screens/*.md`), data entities (`schema.md`),
     contracts (`C-###`), telemetry events (`EVT-###`), quantitative NFRs (`nfr.md`), and the relevant
     launch gates.
   - **Decompose across areas and contracts for parallel dispatch:** slice features by area and frozen
     `C-###` so workers run concurrently:
     - *Client & presentation:* `apps/web` and `packages/ui`, mapped to screen specifications and tokens,
       wired to frozen contracts.
     - *Services & data:* `packages/domain` and `packages/db`, mapped to contracts, schema migrations and
       service NFRs.
     - *Model & intelligence:* `packages/inference`, mapped to capability behaviour and the judged bars
       in `nfr.md`.
     - *Scheduled obligations:* `services/worker`, mapped to the worker contracts and recovery rules.
   Every task carries `Depends on` — the issue numbers that must close first, or `none`. Tasks in
   different areas bound to a frozen contract run concurrently. Present the tree — phases, tasks, edges —
   and create nothing yet.
6. **Create the plan on agreement.** After the user agrees, confirm the `phase` label exists
   (`gh label create phase`), then create the phase issues in order with `gh issue create --label phase`,
   then each task with `gh issue create --parent <phase>`, then every dependency with
   `gh issue edit <n> --add-blocked-by <dep>`. Change the draft when the user asks.
7. **Ask about dispatch.** With the issues in GitHub, ask once whether to dispatch subagents or work
   them in this session. Follow Dispatch below.
8. **Gate each phase.** The gate is a `verify` task parented to the phase and blocked by every other
   task in it. When those tasks are closed, verify the deliverable against the phase's full Specification
   Slice — contracts, acceptance criteria, screen completeness, schema migrations, telemetry events,
   NFR budgets — and the full regression suite. Close the phase issue only when the gate passes.

## Dispatch

The user decides who does the work. Once the plan exists, ask once whether to dispatch subagents or
work the issues in this session. Either answer is valid, the answer holds for the plan, and the user can
stop it at any point.

- **Draft, approve, then create.** The phase issues, task issues and dependencies are a draft. Create
  them only after the user agrees, and change the draft when they ask.
- **The graph is the schedule.** A task is ready when it is in the lowest open phase and every issue
  blocking it is closed. Tasks with no edge between them may run at the same time and in any order. The
  parent phase groups its tasks; it does not order them.
- **A frozen contract is a precondition.** An issue whose `C-###` is not `Frozen` is not ready, even with
  its blockers closed.
- **Subagent dispatch prompt.** When dispatching a subagent for a task, the prompt is strictly the issue
  identifier:

  ```text
  Issue: #<number>
  ```

  Never restate the issue description, acceptance criteria, or boundaries in the dispatch prompt. The
  subagent runs `gh issue view <number>` to read the task contract (`Class`, `Own`, `Depends on`,
  `Contract`, `Specification`, `Criteria`).
- **Task execution.** A worker focuses on its assigned issue, reads the nearest `AGENTS.md` at or above
  its `Own` paths and the documents it names, stays within its owned paths, and reports back on
  completion.
- **Parallel work uses worktrees.** When two or more tasks run at once, each subagent works in its own
  git worktree and opens a PR; never share the primary checkout. Remove the worktree after the PR merges.
- **Tasks are leaves.** Only a phase issue has sub-issues. Never nest a task under a task.
- **A phase issue is never dispatched.** It groups its tasks and parents the gate.
- **The coordinating session works too.** When the user keeps the work here, do it under the same
  dependency rule.
- **Spec task isolation.** When dispatching a `spec` task or resolving a `doc-gap`, always run it in an
  isolated subagent targeting `docs/`. Never execute spec tasks in an active implementation session.
- **The phase gate.** Verify the phase with a clean test and boot sweep against the criteria before
  closing the phase issue.

## Task contract

Every task is an issue from `.github/ISSUE_TEMPLATE/task.md`, parented to its phase issue, with:

- `Class` — implement, fix, verify, spec, or chore.
- `Own` — the paths the task may write; everything outside `Own` is read-only. The nearest `AGENTS.md`
  at or above `Own` governs the work.
- `Depends on` — the issue numbers that must close first, or `none`. The issue's blocked-by links mirror
  this line; when they disagree, the issue body is the record and the coordinator fixes the links.
- `Contract` — the `C-###` it implements, or `none`.
- `Specification` — the specific feature (`FEAT-###`), screens, schema entities, telemetry events
  (`EVT-###`), or NFRs assigned to this task.
- `Criteria` — where the acceptance criteria live, for example `features/FEAT-007.md` and the named
  screen file.

A task closes when its PR merges and the issue closes. There is no route file and no separate delivery
board.

## Contracts

`CONTRACTS.md` holds one entry per interface: `C-001` onward, frozen at the published contract version. Each entry
names its surface — server action, route handler, internal RPC, or worker secret — its auth, its request
and response shapes, and its error codes.

`Frozen` means both sides agree; `Implemented` means it shipped and conforms. A change after `Frozen` is
a `change-request` issue and a PR that updates both sides. Field names, enum values and required arrays
come from `docs/OyoDigitalParliament/schema.md`; they are not negotiable in code.

## In-flight feedback and defect triage

When the user points out a defect, missing behaviour, or a desired change in conversation — whether
during an active phase or after earlier tasks have closed — never jump directly into editing code.
Impromptu edits bypass verification, violate path boundaries, and create fragmented issue churn.

Follow this protocol:

1. **Inspect and trace first.** Before proposing a fix or opening an issue, inspect the relevant
   codebase, test suites, and specification. Identify the root cause and trace every affected surface:
   client states, service endpoints, data model, contracts, worker jobs.
2. **Conduct a diagnostic interview.** Ask targeted questions to establish intent: is this an
   implementation bug against the existing specification, or a shift in product requirements? Clarify
   edge-case behaviour and whether adjacent screens or workflows should follow the same pattern.
3. **Consolidate and propose the scope.** Synthesize the findings into a clear diagnosis and present one
   comprehensive plan, not a stream of symptom-by-symptom issues.
4. **Contract-first execution.**
   - For defects against existing requirements: draft a `Class: fix` task parented to the active phase,
     with exact `Own` boundaries, confirm it, create it, and dispatch.
   - For requirement shifts or new features: dispatch an isolated subagent under `docs/AGENTS.md` to
     update the specification first, commit it, and bump the submodule pointer; then draft the
     implementation tasks.
   - For interface or data-schema changes: file a `change-request` issue to revise `CONTRACTS.md` before
     writing application code.

## Definition of Done

A task is done when:

- its unit tests pass;
- it conforms to the frozen `C-###` contract;
- only its owned paths changed;
- all states and specifications assigned to the task are fully implemented;
- no placeholder, stub, or `TODO` remains;
- the build and boot still work;
- user-facing copy reads as human-written and is externalised for both launch locales;
- it moves no personal data into a log, a cache key, a URL, an analytics event, or a model payload.

A phase is done when its gate task passes and the phase issue closes.

## Verification

A phase is verified after all its tasks are done.

Inputs: the phase's tasks, `CONTRACTS.md`, the acceptance criteria those issues name, the parent phase's
Specification Slice, the quality bar in `nfr.md`, and the commands in this file.

1. Build the deliverable the way it ships and boot it. A green suite is not proof it runs; the build and
   the boot are. On failure, report the log.
2. Run the full suite, not the slice.
3. Write the integration, end-to-end, and acceptance tests the criteria require. Unit tests belong to
   the implementers; do not duplicate them.
4. Verify behaviour against the criteria and contracts, not pixels.
5. Verify screen completeness: every declared screen state — empty, loading, error, submitting, success,
   withheld, overdue — is implemented and functional rather than stubbed. Verify the public record
   renders its primary content with scripting disabled.
6. Verify telemetry: every declared `EVT-###` fires with a schema-valid payload during the flows, and no
   event carries a name, telephone number, ward description, or free text.
7. Verify quantitative NFRs: password and one-time-code standards, session TTLs, rate limits, latency
   budgets, the read-path page-weight cap, availability, RTO and RPO.
8. Verify accessibility against WCAG 2.2 AA with automated checks and a manual keyboard and screen-reader
   pass.
9. When a phase changes model-backed behaviour, run the labelled set against the pinned model, compute
   the metric, compare it to `NFR-050` to `NFR-053`, and report the metric, sample size, pass rate and
   failing cases. Never tune a set or threshold to make a run pass.
10. Treat placeholders, stubs, `TODO`s, and "just for now" shortcuts as Definition-of-Done failures.
11. Report each failure with file and line, expected versus actual. Never fix it in the verifier.

Write only test files and test configuration; feature code is read-only. If a requirement has no
acceptance criterion, report a doc gap; do not invent the test. Do not judge appearance; that belongs to
the frontend.

## Decisions

`.decisions/ADR-###-<slug>.md`, one decision per file, append-only. A decision records the choice, the
reason and the consequences. Supersede a decision with a new file; never rewrite an accepted one.
`ADR-001-stack.md` records the confirmed stack and the platform decisions taken at scaffold time.

## Commands

The canonical commands are created and verified in Phase 0. Until then, only the scaffold check exists.

| Scope | Command | Purpose |
|---|---|---|
| Root | `pnpm install` | Install the workspace with the pinned lockfile |
| Root | `pnpm dev` | Run the web app and worker against local services |
| Root | `pnpm build` | Build the deployable application and worker |
| Root | `pnpm start` | Boot the built application |
| Root | `pnpm lint` | Lint every area |
| Root | `pnpm typecheck` | Type-check every area |
| Root | `pnpm test` | Unit and integration tests |
| Root | `pnpm test:e2e` | Playwright browser flows |
| Root | `pnpm test:a11y` | axe accessibility checks across declared screens |
| Root | `pnpm test:load` | k6 load profiles against the NFR budgets |
| Root | `pnpm test:integration` | Adapter, repository and migration suites against disposable services |
| Root | `pnpm db:generate` | Generate a migration from the schema |
| Root | `pnpm db:check` | Verify the migration journal and schema drift |
| Root | `pnpm db:migrate` | Apply migrations to the target database |
| Root | `pnpm db:seed` | Apply deterministic seeds |
| Root | `pnpm eval` | Run the inference evaluation harness |
| `apps/web` | `pnpm --filter @odp/web lint` | Lint the web area; `typecheck`, `test` and `build` follow the same form |
| `packages/domain` | `pnpm --filter @odp/domain test` | Test the domain area; `typecheck` and `lint` follow the same form |
| `packages/db` | `pnpm --filter @odp/db db:generate` | Generate a migration inside the data area; `db:migrate`, `db:seed` and `test` follow the same form |
| `packages/ui` | `pnpm --filter @odp/ui test` | Test the UI area; `typecheck` and `lint` follow the same form |
| `packages/inference` | `pnpm --filter @odp/inference eval` | Run the inference harness in the inference area; `test` follows the same form |
| `packages/platform` | `pnpm --filter @odp/platform test` | Test the platform area; `typecheck`, `lint` and `test:integration` follow the same form |
| `services/worker` | `pnpm --filter @odp/worker test` | Test the worker area; `start` follows the same form |
| Scaffold | `node "C:\Users\khidi\.agents\skills\vanguard-scaffold\scripts\scaffold.mjs" check` | Verify the repository scaffolding |

## Git and GitHub

- `main` is protected. Work on a short-lived branch and open a PR.
- **This repository is public; issue, PR and commit text is public.** The specification is private.
  Never quote specification text, personal data, or unpublished campaign detail into an issue, a PR
  body, a commit message, or a code comment. Cite the permanent anchor (`FEAT-###`, `NFR-###`,
  `EVT-###`, `C-###`) and let the reader with access follow it.
- Branch naming: `<class>/<issue-number>-<slug>` where `<class>` matches the task class — `implement`,
  `fix`, `verify`, `spec`, or `chore` — `<issue-number>` is the GitHub issue number without `#`, and
  `<slug>` is a short kebab-case description or spec anchor (for example
  `implement/12-feat-001-auth`).
- Conventional Commits. Commits link the specification and the issue, for example
  `Implements: FEAT-001` and `Fixes #12`.
- Commit only the paths the issue owns. Never `git add -A`.
- A PR carries the issue number, the `C-###` it conforms to, and the checks run.
- A phase issue closes only after its gate task passes.
- Sub-issues and dependencies need GitHub CLI 2.94.0 or newer: `--parent`, `--add-sub-issue`, and
  `--blocked-by`. The installed CLI is 2.96.0.
- **Submodule rule:** a specification change is committed and pushed in
  `oyo-digital-parliament-docs` first. The pointer bump in this repository is a separate PR:
  `git submodule update --remote docs`, then commit the updated `docs` gitlink.

## Boundaries

- Never write under `docs/` from an implementation task. A missing answer is a doc gap.
- Never quote private specification text or personal data into a public issue, pull request, commit
  message, or code comment. This repository is public; the specification repository is not.
- Never log or commit secrets, tokens, or unmasked identity. Credentials live in the secret store.
- Never place a member's real name, telephone number, member identifier, ward description, or free text
  in a log, a cache key, a URL, an analytics event, or an outbound model payload.
- Never produce a member register by ward, for any role, in any export, or through any query. The
  platform exists to be checkable by residents, not to build a canvass list.
- Never make model output authoritative. It may rank, suggest, route, or extract candidates; it never
  writes a resident's words, a decision, a reason, or a figure.
- Never publish a commitment, ledger entry, report card, ward figure, or takedown without the human
  confirmation the specification requires; never silently edit a published figure — publish a correction.
- Never delete the public record to resolve a dispute. Removal is a state change with a cited rule and an
  appeal path; a correction is a new version.
- Never tune a test, threshold, or evaluation set to make a run pass.
- Never add a markdown document where inline documentation is enough.
- In durable code comments and tests, cite permanent spec anchors (`FEAT-###`, `NFR-###`, `EVT-###`, or
  `C-###`). Commits and PRs link the specification and the GitHub issue.
