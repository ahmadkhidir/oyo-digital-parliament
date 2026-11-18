# services/worker

The scheduled process that carries the obligations which cannot wait for someone to be at a desk: the overdue check that keeps the public ledger honest, quarterly report card generation, backing anomaly review, cache pre-warming, backup verification, and the handover or archive task. It runs as its own container from this monorepo, reads and writes only through the repositories `@odp/db` exposes, and reaches business behaviour only through the use cases exported by `@odp/domain`. It serves no HTTP traffic except a health probe, and no browser request ever reaches it. Root `AGENTS.md` is the coordinator's manual: read it for repository-wide workflow, dispatch, and verification gates.

## Scope

This area owns the worker process end to end: the scheduler that turns a contract's `Surface` into a tick, the run bookkeeping that makes a run replayable, the advisory lock that keeps two instances off the same batch, the retry and backoff policy that wraps each attempt, the telemetry and audit events a run emits, the graceful shutdown that finishes or releases the current batch, and the live/ready probe.

It owns the six scheduled jobs in `CONTRACTS.md` Domain 6 and nothing else. Each job takes its input, output, failure codes, and authority from its frozen contract (`C-083` to `C-088`); the schedule itself, the retention and recovery targets it asserts, and the reporting and lifecycle rules it serves stay in `architecture.md`, `nfr.md`, and `CONTRACTS.md`. This file never restates them.

It does not own the rules those jobs apply. Anomaly thresholds, suppression, the answer-rate definition, what a quarter contains, and what may be published are domain and reporting behaviour; the worker asks for a decision and records that it happened. It does not render public pages, does not own the read cache's contents beyond asking reporting to re-render a target, and does not decide that a report card or a public record is published. Operational response to a failed run belongs to the runbooks in `operations.md`; the worker raises the failure and stops.

## Structure

- `services/worker/package.json` — the intended manifest for `@odp/worker`, created in Phase 0. It is the only place dependencies and run scripts are declared. Nothing in this area adds, upgrades, or removes a dependency outside it.
- `src/main.ts` — the single entry point the container starts: load configuration, start the probe listener, start the scheduler, and install signal handlers. There is no second binary and no ad-hoc script that reaches production data.
- `src/scheduler.ts` — the only file that defines when a job runs. Each entry names the contract `Surface` it implements, builds that job's run key, and dispatches into one job directory. Calendar expressions are written in Africa/Lagos, never in the host's local zone.
- `src/jobs/overdue-check/` — one directory per job, named exactly the `job` value its contract's `Surface` names. The overdue check is the example; every other job directory follows the same three files:
  - `index.ts` — registration: job name, run-key builder, lock scope, the schedule entry it serves.
  - `run.ts` — the job body. It validates its request, opens the scope lock, calls domain and reporting use cases through their ports, and returns the contract's response shape.
  - `run.test.ts` — the job's tests, colocated with the body they exercise.
- `src/runtime/` — the shared machinery every job uses and none reimplements: `lock.ts` (scope advisory locking), `retry.ts` (bounded attempts and backoff), `telemetry.ts` (event emission through the fixed taxonomy), `audit.ts` (system-actor audit append), `clock.ts` (the injectable clock and calendar helpers), `runs.ts` (run ledger and run-key bookkeeping), `shutdown.ts` (drain and batch release), `health.ts` (live and ready probes). Tests for these sit beside them.
- `src/config.ts` — reads and validates configuration once at boot; a missing or malformed value fails the process before any job runs.

A new job belongs in a new `src/jobs/` directory named for its contract's `job` value, plus one `src/scheduler.ts` entry, and only after its contract is frozen in `CONTRACTS.md` Domain 6. A job that needs to answer an HTTP request, render a page, or accept browser input is not a worker job; it belongs to the area that owns that boundary.

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

- **A run key is the unit of idempotency.** Every job is safe to re-run: a repeated run with the same run key produces the same record state and never duplicates an event, a report snapshot, an overdue flag, or a voided backing. A run key already recorded as complete returns its prior result unchanged rather than recomputing, exactly as the contract's conflict cause states; a partial run either commits its whole batch or leaves no trace of it.
- **The lock is in the database, and shutdown respects it.** A job takes a database advisory lock scoped to what it processes and exits cleanly, without work and without an error, when another instance holds it. Two workers never process the same batch. An in-process mutex is never the only guard. On shutdown the job finishes or releases the batch it holds and releases the lock in a `finally` path; a killed job resumes on the next tick without duplicating work.
- **The worker stages; it never rules or publishes.** Jobs call domain and reporting use cases through their ports. No job embeds a business rule, writes raw SQL, or publishes content on its own authority: report cards and public records become visible only through the reporting use case (`C-061`, `C-062`, `C-075`), and the generation job leaves its output staged for a person. A generation failure leaves the previously published card readable, and a partial card is never written.
- **Calendar in Lagos, timestamps in UTC, cut-offs frozen.** Every boundary the worker evaluates — a day, a quarter, a window — is computed in Africa/Lagos and stored in UTC. The quarter cut-off is fixed at generation and carried with the snapshot; it is never recomputed later to make a reader's view look current.
- **Failures are bounded, then loud.** A failing attempt retries with bounded backoff and jitter within its own run window; when the budget is exhausted the run alerts and stops rather than looping or narrowing its own scope to look successful. Degraded dependencies leave the last good cache and the last published card in place; nothing is republished to paper over a gap.
- **Observability carries counts, never content.** Every state change writes an audit event with the `system` actor and a stated reason. Logs and telemetry carry no personal data, no submission or comment text, no ward description, and no member identifier beyond an aggregate count, and every emitted event name comes from the fixed taxonomy in `analytics.md` — a new name is a specification change, not a code change. The probe distinguishes live from ready and returns no data.

## Checks

Repository-wide gates live in root `AGENTS.md`. These are the checks this area adds before a change is reviewable:

- The worker suite passes, and the typecheck and lint steps of the repository gate are clean under the strict TypeScript configuration.
- A replay test per job: run the same run key twice and assert identical record state, one audit event per state change, and exactly the contract's already-completed result on the second call.
- A contention test per job: hold the scope lock from a second connection and assert the job exits cleanly without touching a record.
- A boundary test per job: drive the injected clock across an Africa/Lagos midnight and a quarter cut-off, and assert the stored timestamps are UTC and that a fixed cut-off is not recomputed.
- A degraded-dependency test per job: make the port fail and assert the failure code, that no partial output is written, that the run is retried within its window, and that the previously published card or cached page still serves.
- A contract-shape test per job: the request and response payloads conform to the frozen entry in `CONTRACTS.md` Domain 6, including the declared non-happy paths.
- A log and telemetry assertion: capture what a normal and a failing run emit and confirm only counts and run identifiers, with every event name resolving in `analytics.md`.
- A probe assertion: readiness fails when the database or the lock store is unreachable while liveness stays up, and the probe body exposes no record data.

## Definition of Done

- The job's frozen contract is implemented end to end in its own directory: request validation, run key, scope lock, bounded retries, audit, telemetry, and the exact response shape, with every declared failure path reachable.
- Idempotency, lock contention, calendar boundaries, degraded dependencies, contract shape, log hygiene, and the probe are each covered by a test that fails when the behaviour is removed.
- Every state change the job causes is audited with the `system` actor and a reason; no personal data, submission text, or member identifier appears in a log or an event.
- No business rule, SQL statement, or publication decision was added here. Anything the job needed from another boundary arrived as a port, or was reported back as a gap.
- A failed or interrupted run leaves the previous published card, the previous cache entry, and the record itself readable and unchanged.
- The suite, typecheck, and lint pass; dependencies are untouched outside the Phase 0 manifest; no placeholder token remains in code.
