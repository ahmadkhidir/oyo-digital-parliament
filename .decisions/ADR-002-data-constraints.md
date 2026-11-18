# ADR-002: Decision chain constraints and durable worker run keys

- Status: Accepted
- Date: 2026-11-18
- Resolves: ADR-001 open gaps 1 and 2

## Context

ADR-001 recorded two data-model questions surfaced while freezing the interfaces.

First, `Decision` carries `supersedesDecisionId` but no live marker or superseded timestamp. The
specification requires exactly one live decision per submission and a revision that never erases the
earlier version, so the database must enforce that shape without adding product data the specification
does not define.

Second, the worker contracts require a durable prior result when a run key is replayed, but `schema.md`
defines no job-run entity. The worker must not duplicate an overdue flag, a report snapshot, a cache
invalidation, a backup check, or a handover.

## Decision

### One live decision is the tip of a single supersession chain

`Decision` remains exactly as specified. The database enforces a linear revision chain with two partial
unique indexes:

- one root per submission: unique on `submission_id` where `supersedes_decision_id is null`;
- one successor per decision: unique on `supersedes_decision_id` where `supersedes_decision_id is not null`.

The live decision is selected as the row for which no other row names it as `supersedes_decision_id`.
There is no `is_live` column, no pointer table, and no trigger. A revision inserts a new row that
supersedes the current tip; the earlier row remains readable and is published as superseded. A revision
that names a decision which is no longer the tip is a conflict, not a second branch.

This satisfies "exactly one live decision", "a revision never erases the earlier version", and the
immutability rule without changing `schema.md`.

### Worker run keys use the durable idempotency store

Worker jobs use the same durable idempotency mechanism as the idempotent write paths, scoped by job name
and run key, with a request fingerprint and the stored result. A repeated run key returns the stored
result and performs no second effect.

No `JobRun` or run-ledger entity is added to `schema.md`. The idempotency store is internal
infrastructure, not part of the public record: it is excluded from public projections, exports, the
handover archive, and analytics.

## Consequences

- The Phase 0 migration includes the two partial unique indexes and the idempotency table.
- `packages/domain` publishes the live decision as the chain tip; `packages/db` enforces the chain and
  maps a stale supersession to the contract's conflict code.
- Every worker job must derive a stable run key — job name plus window, quarter, or transfer identity —
  and must return the stored result on replay.
- The idempotency store's retention follows the operational window for the job it serves; it is not a
  permanent record and is never used to reconstruct the public history.
- The worker keeps its existing contract `C-083` to `C-088`; no new contract is required for the store.
