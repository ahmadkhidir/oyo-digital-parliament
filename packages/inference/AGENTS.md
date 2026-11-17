# packages/inference

This package is the platform's only path to a model provider: the gateway that strips identifiers, enforces the pinned version, timeout and spend ceiling per capability, the four capability implementations it serves, and the evaluation harness that measures each one against its judged bar before a version is promoted. Root `AGENTS.md` is the coordinator's manual: read it for repository-wide workflow, dispatch, and verification gates. The specification in `docs/OyoDigitalParliament/` states what the capabilities must achieve; `CONTRACTS.md` `C-078` to `C-082` states the wire shapes; this file states how code here is built.

## Scope

In scope: capability invocation, the de-identification boundary, provider adaptation, pinned configuration, capability flags as they are read and enforced, cost accounting, inference telemetry, labelled-set storage and the evaluation runner that produces a `ModelEvaluation`.

Out of scope: the features that consume suggestions and render them, the operator console that administers flags (`C-069`), audit-event storage, the search index, and any decision about publication, moderation or legal hold. Those belong to the calling domain packages and to the admin surface; this package returns a candidate list or nothing, and never writes the record.

Two documents decide behaviour when this file and the specification disagree: `architecture.md` (Inference Gateway, Evaluation Harness, Model Version & Fallback) and `nfr.md` (`NFR-012` to `NFR-015`, `NFR-045`, `NFR-050` to `NFR-053`). Read them before changing a threshold, a fallback or a payload field.

## Structure

| Path | Holds |
|---|---|
| `src/gateway/invoke.ts` | The single exported entry point. Accepts the `C-078` envelope, rewrites caller-supplied version, timeout and ceiling from pinned configuration, and is the only place an adapter is called. |
| `src/gateway/outcome.ts` | Maps adapter and harness results onto `ok`, `timeout`, `refused`, `disabled`, `error`, and guarantees `result` is `null` for every outcome but `ok`. |
| `src/gateway/registry.ts` | The capability registry. Rejects an unknown capability; a capability is reachable only if it is registered here with its full pinned contract. |
| `src/capabilities/similar_submission/` | Payload schema, result schema, versioned instruction, fallback declaration and reason code for `C-079`. |
| `src/capabilities/ward_candidate/` | The same five artefacts for `C-080`. |
| `src/capabilities/moderation_routing/` | The same, plus the closed label enum and the rule that an out-of-enum label is discarded as `error` (`C-081`). |
| `src/capabilities/budget_line_extraction/` | The same for `C-082`, including line-reference and amount shaping. |
| `src/deidentification/` | The field allow-list, the removal and substitution rules, the telephone-pattern refusal, `removedFields` reporting, and the payload-shape digest that telemetry carries. |
| `src/adapters/` | One directory per provider, each implementing the same adapter interface: send a de-identified payload, return raw output or a typed failure. Adapters translate and transport; they never shape a prompt, choose a capability or apply a fallback. |
| `src/config/` | Pinned model version, timeout, cost ceiling, flag state and labelled-set pointer per capability, loaded once and read-only at runtime. |
| `src/cost/` | Per-call cost from provider-reported usage, per-capability aggregation per window, and the trip that switches a capability off when the ceiling is crossed. |
| `src/telemetry/` | `EVT-038` to `EVT-041` emission: capability, latency, model version, outcome, cost, rank, reason code. Never text. |
| `src/harness/` | The evaluation runner: loads a labelled set, invokes the pinned capability, scores it against the metric named in `nfr.md`, writes the `ModelEvaluation` and lists failing cases. |
| `eval/` | One directory per capability holding its labelled set, its labels and the scoring definition. Read-only to capability work; changed only through the evaluation process. |
| `test/` | Vitest suites, provider responses recorded or stubbed, no live call. |

The intended manifest is `packages/inference/package.json`, workspace name `@odp/inference`. Phase 0 creates it; this package does not carry its own dependency list outside that manifest.

A new capability belongs under `src/capabilities/`, one directory per capability and nowhere else, and only after the specification names it: registry entry, payload and result schemas, versioned instruction, pinned configuration in `src/config/`, a labelled set under `eval/`, and its judged bar in `nfr.md`. A new provider belongs under `src/adapters/`, one directory per provider behind the existing interface, with the provider and processing region recorded in `.decisions/` and named in the privacy notice; no capability module and no caller changes when the provider changes.

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

- **One egress, enforced by import graph.** This package is the only place that imports a provider SDK, holds a provider credential, or opens a connection to a model endpoint. Every other package calls `invoke`. A model call reached from anywhere else is a defect to remove, not a shortcut to keep, and the boundary is proven by a test that fails on a stray provider import.
- **De-identification precedes serialisation.** A payload is assembled from a per-capability allow-list, never by stripping fields from a caller object, so a field added upstream cannot leak by default. Name, telephone number, member identifier and every other direct identifier are omitted before the payload is serialised; where structure forces a value, a constant is substituted. A payload matching a telephone pattern is refused rather than cleaned. Record the shape and `removedFields`; the payload text never reaches a log, a span, a metric label or an error message.
- **Four capabilities, four pinned contracts, one all-or-nothing result.** Each capability module declares exactly one pinned version, one timeout, one spend ceiling and one deterministic fallback, and the gateway rewrites caller-supplied values from that declaration. Timeout, refusal, provider error, malformed output and a disabled flag all produce `result: null` plus a reason code; there is no partial result, no repaired output and no retry that outlives the timeout. A fifth capability is a specification change with its own judged bar, not a prompt added to an existing module.
- **Advisory output, never authority.** Nothing returned here publishes, decides, moderates, removes, ranks a published figure, or becomes a resident's words. The gateway returns a result the caller may render or discard; it never persists a result as authoritative text, and a caller that stores one as fact is out of contract. No call originates from a public page read, and no read path may await this package.
- **Off, not tuned.** A capability below its measured bar is switched off and its fallback runs; there is no in-place prompt tweak, no threshold move, no shadow model and no "temporary" override. A version change is a controlled release that requires a stored evaluation run for that capability and version, and the harness is the only route to approval. Labelled sets are fixed once labelled; a run records sample size, metric, threshold and failing cases, and no one edits a case, drops a failing case or relaxes a threshold to make a run pass.
- **Cost is a tripwire, not a report.** Cost is measured per call from provider-reported usage, aggregated per capability per window against the per-1,000-unit ceiling in `nfr.md`, and crossing the ceiling switches the capability off through the same flag path as a quality failure. A retry, a batch job or a harness run does not spend past a tripped capability.

## Checks

- `pnpm --filter @odp/inference typecheck` — strict TypeScript across `src`, `test` and the harness.
- `pnpm --filter @odp/inference test` — Vitest; must pass with no network access, every provider response stubbed or recorded.
- `pnpm --filter @odp/inference eval -- --capability moderation_routing` — runs the stored labelled set for one capability, writes a `ModelEvaluation`, prints the failing cases, and exits non-zero when the bar is missed. Run it for each of the four capabilities before a version is promoted.
- `pnpm --filter @odp/inference lint` — includes the import-boundary rule that keeps provider SDKs inside `src/adapters/`.
- Manual before enabling inference in an environment: inspect sample payloads for name, telephone number, member identifier and address text, and confirm the provider, processing region and agreement against `NFR-045`.
- Manual after any payload-shape change: re-inspect a sample payload and confirm `removedFields` still reports every removed identifier.

## Definition of Done

- The capability or adapter is registered and reachable through `invoke` only, with no second export that reaches a provider.
- De-identification is proven by a test that feeds a fully populated caller payload and asserts every direct identifier is absent from the serialised outbound body and from `removedFields`-adjacent logging.
- All five outcomes are implemented and tested, and every non-`ok` outcome returns `result: null` with the reason code its fallback declares.
- The deterministic fallback is reachable and named, and a test shows the calling feature receiving nothing rather than a degraded partial answer.
- Cost is recorded per call and aggregated per capability, and a ceiling breach flips the capability off in a test.
- A behaviour change to a capability is accompanied by an evaluation run against its stored labelled set, with sample size, metric, threshold and failing cases recorded in the `ModelEvaluation`.
- No inference path is reachable from a public read, and no result is persisted as authoritative text.
- Tests, typecheck and lint pass offline, and the issue's declared non-happy paths are covered rather than stubbed.
