# packages/db

This file is authoritative for work in this directory and its subdirectories. Root `AGENTS.md` is the coordinator's manual: read it for repository-wide workflow, dispatch, and verification gates.

## Scope

`packages/db` owns the PostgreSQL 16 schema, Drizzle ORM table definitions, drizzle-kit migrations, deterministic seeds, repository implementations, indexes, Postgres full-text search projection, transaction boundaries, durable idempotency storage and the constraints that keep the public record consistent. It implements the ports declared by `packages/domain` and enforces only the integrity the database must enforce; business policy stays in the domain package or the calling application.

It does not own HTTP contracts, UI, notification delivery, inference, Redis or object storage. Those systems reach persistence through their own adapters and through the repositories exported here. The issue's `Own` paths are binding; everything outside `Own` is read-only.

## Structure

- `packages/db/package.json` is the intended manifest (`@odp/db`) and is created in Phase 0. This file does not create it and does not restate its dependencies.
- `drizzle.config.ts` at the package root points drizzle-kit at `src/schema/` and `drizzle/`. `vitest.config.ts` at the package root configures the test projects.
- `drizzle/` holds the generated SQL migrations and the drizzle-kit journal. `drizzle/down/` holds the reviewed reverse SQL for each migration, named after the migration it reverses. Never edit the journal or renumber an applied migration.
- `src/schema/` holds one module per entity or aggregate root from `schema.md`; that module is the only declaration of the table, its columns, constraints, enums and indexes. A table that exists only as part of an aggregate lives in that aggregate's module. Enums are declared once in `src/schema/enums.ts`, and `src/schema/index.ts` is the barrel that the client and drizzle-kit read. Each module declares the physical table and column identifiers beside the specification names; those identifiers appear only in the module and its migration.
- `src/client.ts` owns the pool, the Drizzle client and the `withTransaction` helper. Nothing else constructs a connection.
- `src/repositories/` holds one repository per domain port, with the file named for the aggregate it serves and suffixed `.repository.ts`. `src/repositories/index.ts` is the only export surface for them.
- `src/search/` holds the full-text projection and its query builders. `src/search/projection.ts` defines the derived, rebuildable projection table; `src/search/query.ts` turns user input into a `tsquery` and a ranking expression.
- `src/idempotency/` holds the durable idempotency store: fingerprinting, claim and response replay. Its table lives with the other tables in `src/schema/`.
- `src/seeds/` holds one module per reference dataset plus `run.ts`. Seeds are code, not migration SQL.
- `src/testing/` holds the disposable-database harness: per-worker database creation, migration application, reset helpers and deterministic factories. Tests import it through `src/testing/index.ts`.
- `src/index.ts` is the only package entry. It exports repository constructors, the transaction helper and the idempotency helper; schema modules stay internal to the package.
- Unit tests are collocated as `*.test.ts` beside the unit they cover. Migration round-trip and cross-repository integration tests live under `test/migrations/` and `test/repositories/`, and both use `src/testing/`.

Placement rules:

- New table: add or extend the entity module in `src/schema/`, export it from `src/schema/index.ts`, declare its relations, then generate the migration. A table that `schema.md` does not contain is a doc gap, not a schema addition.
- New column: add it to the entity module with its personal-data classification and its default or backfill plan, then generate the migration. A backfill runs as its own idempotent step, never inside the schema change that adds the column.
- New index: declare it on the table with a comment naming the read path it serves, include it in the migration, and exercise that path in a test. An index without a caller is not added.
- New migration: generate it with drizzle-kit from a schema change, review the SQL, add the matching down path under `drizzle/down/`, and test both directions.
- New repository: implement the `packages/domain` port in `src/repositories/`, return domain types rather than Drizzle rows, and export it from `src/repositories/index.ts`.

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

- **Schema fidelity and the migration path.** The schema mirrors `schema.md` exactly: entity names, field names, enum members, required fields, formats and relationships. Where this package crosses a module boundary, `CONTRACTS.md` governs the shape. A discrepancy is a `doc-gap` issue, never a rename, an alias or a "close enough" column. Every change to `schema.md` is a migration with a tested down path. Production migrations are forward-only and backward-compatible for one release; no migration drops or rewrites the public record, and a migration without a tested down path needs a written decision before it runs.
- **Field-level classification, identifier exclusion.** Every personal-data field is classified in its schema module and in the migration that introduces it. Direct identifiers classified as personal data by `CONTRACTS.md` C-001 never appear in an audit row, a search document, an analytics event, a cache payload or a log line. A repository returns the narrowest type its port needs; a query that widens a public projection to carry an identifier fails review.
- **Append-only audit.** The audit table accepts inserts only. No update or delete path exists in this package, no foreign key cascades into it, and the application role holds no update or delete privilege on it. A correction is a new event that cites the event it corrects.
- **Retry-safe writes and one live decision.** Every write the domain declares idempotent stores its key scope, request fingerprint and original response in the same transaction as the business change; a replay returns the stored response and creates no second submission, backing, decision or replay batch, while a key reused with a different fingerprint is a conflict. Decision publication runs in one transaction guarded by a partial unique constraint that permits one live decision per submission; a revision is a new version that supersedes the previous one. A decision reservation is acquired and released by conditional writes on holder and expiry, so two staff cannot hold the same case. A write that spans aggregates composes repositories inside one `withTransaction` call; no repository opens a nested transaction.
- **Real references, justified indexes, FTS as the index.** Foreign keys are declared and enforced by PostgreSQL, not by application cleanup. Every index names the read path it serves, whether the twenty-one-day overdue query, a ward report, ledger pagination or the full-text query, in its declaration and its migration; no index is added speculatively, and a constraint that changes write behaviour is reviewed as carefully as an index. Search is the Postgres full-text projection rebuilt from the authoritative tables, never an application-side scan and never a source of truth.
- **Deterministic seeds, disposable verification.** Seeds are deterministic and idempotent: stable natural keys, no random identifiers, and no invented authoritative external dataset the specification says is not assumed. Tests and migration checks run against a disposable PostgreSQL 16 database created by `src/testing/`; schema changes reach a shared environment only through a reviewed migration, never by hand.

## Checks

Run from the repository root with `DATABASE_URL` pointing at a disposable PostgreSQL 16 instance:

- Typecheck: `pnpm --filter @odp/db typecheck`
- Tests, including repository, migration round-trip, full-text search, idempotency and seed idempotency suites: `pnpm --filter @odp/db test`
- Migration collisions and journal drift: `pnpm --filter @odp/db db:check`
- Apply migrations to the disposable database: `pnpm --filter @odp/db db:migrate`
- After a schema edit: `pnpm --filter @odp/db db:generate`, then review the generated SQL and add the matching down path under `drizzle/down/`
- Seed idempotency: run `pnpm --filter @odp/db db:seed` twice against the same disposable database through the test harness; the second run must change no row
- Lint and format: `pnpm --filter @odp/db lint`; this package adds no second style toolchain

## Definition of Done

- `pnpm --filter @odp/db typecheck` and `pnpm --filter @odp/db test` pass against a freshly created disposable PostgreSQL 16 database.
- Every schema change corresponds to a merged `schema.md` change and ships with a generated migration, a tested down path and the matching entry under `drizzle/down/`. A shape the specification does not contain is reported as `doc-gap`, not migrated.
- Idempotency replay, single-live-decision, reservation contention and audit-append tests pass for every write path the change touches.
- No direct identifier appears in a search document, audit row, cache payload, analytics event or log line introduced by the change.
- Every new index cites a named read path and is exercised by a test; every new foreign key is enforced by the database rather than by application code.
- Seeds run twice with no row change, and no seed invents an authoritative external dataset the specification does not assume.
- No stubs, skipped tests or unresolved placeholders remain in the package.
