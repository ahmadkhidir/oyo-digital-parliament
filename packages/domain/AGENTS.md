# packages/domain

The authoritative business rules and use-case orchestration of the monolith: identity and access, ward
reference, submissions and backing, discourse and moderation, decisions and commitments, reporting and
the answer rate, notification dispatch policy, audit events, and analytics event construction. Everything
here is usable without a web framework and without a server running, because it is called from request
handlers, scheduled jobs and tests alike.
Root `AGENTS.md` is the coordinator's manual: read it for repository-wide workflow, dispatch, and verification gates.

## Scope

This package decides what is true about the record: whether a submission may publish, whether a decision
may stand, who may read what, when a commitment is valid, and how a published figure is derived. It owns
the rules that must hold whichever caller invokes them, and it is the only place a rule may be written
down.

It does not own transport, persistence, rendering, delivery or model calls. Repositories, the clock, the
ID generator, the notification sender, the inference gateway, the cache invalidator, the audit writer and
the analytics emitter arrive as injected ports, implemented by `packages/db` and the adapter packages. A
rule that exists only to shape one screen is a screen concern and stays out of this package; a rule that a
second caller could break by forgetting it belongs here.

Read-only inputs: `docs/OyoDigitalParliament/schema.md` for field names, enum spellings and required
fields; `CONTRACTS.md` for the failure taxonomy and the boundary envelopes; `analytics.md` for event names
and their permitted properties; the relevant `features/FEAT-###.md` for behaviour. The specification is
the source of truth for *what*; this document governs *how*.

## Structure

- `package.json` — the intended manifest is `@odp/domain`, created in Phase 0. Dependencies and scripts are
  declared there and nowhere else.
- `src/` — one directory per bounded responsibility: `identity`, `wards`, `submissions`, `discourse`,
  `decisions`, `reporting`, `notifications`, `audit`, `analytics`. A module holds only the shapes it needs,
  drawn from the four below.
- `use-cases/` inside a module — one exported function per command or query, named for the verb and the
  noun it acts on. A use case receives the caller context first and a single port bundle second; it
  returns a result, never a framework response. Use cases never call other use cases.
- `policies.ts` inside a module — pure, total functions for the rules that outlive one call site: the
  overdue derivation, the answer-rate computation, the commitment-validity check, the suppression rule,
  the dispatch decision, the permission check. No I/O, no clock read, no argument mutation.
- `entities.ts` inside a module — the domain types. Field names and enum spellings mirror `schema.md`
  verbatim so the projection to `packages/db` and to the wire stays a rename-free mapping; never invent a
  second vocabulary for a concept the schema already names.
- `src/ports/` — interfaces only, one capability per method. A port exists only for an effect the domain
  cannot perform: persistence per aggregate, clock, identifier generation, delivery, inference, cache
  invalidation, audit append, analytics emit. Ports describe what a use case needs, not what an adapter
  happens to offer.
- `src/errors.ts` — the `DomainError` type: a `code` taken from the `C-001` taxonomy, a stable
  upper-snake `cause` token naming the specific reason, a `fields` map for validation, and the contract's
  recovery metadata where an entry defines it. Adding a failure mode adds a `cause`; a new `code` is a
  change request against `CONTRACTS.md`.
- `src/index.ts` — the package's public surface: types, policies, and the per-module use-case factories.
  Nothing else is exported from the package root.
- Tests sit beside the unit they test: `policies.test.ts` beside the policy, and a test file beside the
  use case that names it (for example `use-cases/publish-decision.test.ts`). Cross-module flows live in
  `test/flows/`, and in-memory port fakes in `test/fakes/`. Adapters, database schema and composition
  roots live in other packages; this one imports none of them.

Placement rules: a new use case goes in the module that owns the state it commits, even when it reads
another module's state through a policy function. A new invariant becomes a named policy function with a
failing test, never an inline branch inside one handler. A new port is added only when an effect crosses
the process boundary, and it is declared in `src/ports/` with the narrowest signature that serves the
callers that exist.

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
- Packages and dependencies belong strictly in this area's manifest (package.json), never in `AGENTS.md`.
- If blocked, state the assumption or ask for clarification before proceeding.
- When a fact resists you, verify it with evidence before falling back on recall.
- User-facing copy reads as human-written.

## Discipline

- **One live decision per submission; publication is transactional and idempotent.** Writing a decision
  and, for a commit, its commitment is one unit of work: either both are recorded or neither is, and a
  failed audit append fails the write. Republishing is a conflict that names the existing decision, never
  an overwrite; a change of answer is a revision that increments the version, supersedes the live decision
  and updates the existing commitment rather than creating a second one. The superseded version stays
  readable. An idempotent replay of the same write returns the recorded result instead of a second record.
- **Derived state is computed, never stored.** The overdue state, the published answer rate, days since
  submission and every overdue count are derived from `submittedAt`, the submission's status, the live
  decision and the injected clock at the moment of the read (see `FEAT-007`, `FEAT-008` and `C-074` for the
  definition and the exclusions). No `overdue` flag, no cached numerator or denominator, no counter column.
  Out-of-area submissions never enter the decision queue or the denominator; withheld submissions stay in
  the denominator until cleared.
- **A commitment is a promise with a fixed shape, and it outlives its author's withdrawal.** A commit is
  valid only with an owner, a cost band, a target date, a pillar and the status Committed; a missing one
  refuses publication by naming the field. A dropped commitment stays in the register with its stated
  reason, and a withdrawn submission leaves the commitment in place, marked as withdrawn by the author.
  Throughout this package removal means a state change: nothing is deleted, and every softer-looking
  operation still records who did it and why.
- **Identity has exactly two states and exactly one reader.** A member is Registered or Checked, and every
  other notion of trust is a projection of those two. A telephone number belongs to at most one account, so
  a second registration on a number already held creates no account and is offered sign-in; accounts are
  never merged. No function in this package produces a member register by ward or by any other grouping, and no
  caller outside the member's own data view receives a real name, telephone number or declared age — the
  rest of the system receives a member identifier and a display name, and the external reviewer path
  receives neither identifier nor name.
- **The model advises; people decide.** Inference may rank, label, extract or suggest, and its output is
  never a status, a decision, a reason, a published word or an audit record. A timeout, refusal or disabled
  capability yields nothing and the deterministic fallback runs; no call originates from a read path. The
  payload handed to the gateway carries no name, telephone number, member identifier or ward description
  beyond the identifier needed to scope a ranking.
- **Every state change is audited, and analytics carries no person.** A use case that changes state
  appends exactly one audit event through its port before it returns, carrying actor, actor role, action,
  target and reason; a failed append fails the write. Analytics events carry the event name and only the
  properties the taxonomy permits for it, with a pseudonymous member identifier and no name, telephone
  number, ward description, submission text or free text. Effects enter only through ports and time only
  through the clock: no ambient `Date.now()`, `new Date()`, `Math.random()`, `randomUUID()`,
  `process.env`, direct network call or framework import anywhere in `src/`. Role and ownership checks run
  inside the use case against the caller context, never in a caller that might forget, and they fail with
  the contract's code plus a stable cause rather than an ad-hoc string.

## Checks

- `pnpm --filter @odp/domain run typecheck` — strict TypeScript, no `@ts-ignore`/`@ts-expect-error` and no
  `any` in an exported signature.
- `pnpm --filter @odp/domain run test` — unit and policy tests, run without a database, network or real
  clock.
- Ambient-dependency scan: `rg -n "Date\.now|new Date\(\)|Math\.random|randomUUID|process\.env" packages/domain/src`
  returns nothing.
- Import-boundary scan: `rg -n 'from "(next|react|@prisma|pg|better-sqlite3|axios|node-fetch)"' packages/domain/src`
  returns nothing.
- Deletion scan: `rg -n "\.delete\(|DELETE FROM|\.destroy\(" packages/domain/src` returns nothing outside a
  repository port's comment, because removal is a state change rather than a delete.
- Personal-data scan: `rg -n "telephoneNumber|fullName|declaredAge" packages/domain/src` matches nothing
  outside `src/identity/`, and nothing at all inside `src/analytics/` or `src/audit/`.

## Definition of Done

- Every use case the issue names is implemented for every outcome its contract declares, including
  refusals, conflicts, duplicates and queued writes; no stub, no `not implemented`, no unreachable branch
  left for a later issue.
- Each invariant the change touches has a policy test that fails when the invariant is removed, not merely
  a test that the happy path returns.
- Every failure path returns a `C-001` code with its stable cause, and a test asserts that pair.
- Every state-changing use case has a test proving exactly one audit event is appended, with actor, target
  and reason, and that a failed append refuses the write.
- No returned projection or emitted event contains a personal field; a test asserts the public shape of
  each new result.
- The checks above pass, spec anchors are cited in docstrings, and any contract gap was reported rather
  than worked around.
