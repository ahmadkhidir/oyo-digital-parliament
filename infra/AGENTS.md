# infra

The local environment contract the repository's development stack is built against. It states which
variables the app, the worker and Docker Compose read, renders the committed `.env.example` from that
list, and validates a candidate `.env` before any container starts. The application variables are not
declared here: `packages/platform/src/config/schema.ts` owns them and this area imports that schema, so
the local stack, the application and the worker validate one list (`NFR-024`).
Root `AGENTS.md` is the coordinator's manual: read it for repository-wide workflow, dispatch, and verification gates.

## Scope

This area owns the local environment contract: the Compose project name, the environment-file names, the
local-only variables the stack reads (the PostgreSQL role, database and published ports), the disposable
placeholder each application variable carries, the cross-field checks that catch an environment edited in
two places, and the renderer that writes `.env.example`.

It does not own the application variable list, their types, ranges or secret classification — that is
`packages/platform`. It does not own the Compose services themselves (`docker-compose.yml` at the root),
the command line around validation and rendering (`scripts/dev/env.mjs`), the stack lifecycle
(`scripts/dev/services.mjs`), or the CI export (`scripts/ci/export-env.mjs`). Those are consumers; this
area is the contract they read. The issue's `Own` paths are binding; everything outside `Own` is
read-only.

Read-only inputs: `architecture.md` for Environments; `nfr.md` `NFR-024` for credential handling and its
data-lifecycle requirements for synthetic Development data; `packages/platform/AGENTS.md` for the one
configuration schema and its loading boundary; `packages/platform/src/config/schema.ts` for the
authoritative variable list. The specification says what must hold; this file says how the contract here
is built.

## Structure

| Path | Holds |
|---|---|
| `infra/local/environment.mjs` | The whole contract: the Compose project name, the `.env` and `.env.example` names, every variable's declaration and local placeholder, the per-variable validators, the cross-field checks, the environment-file reader and validator, and the `.env.example` renderer. |

Placement rules:

- **A new application variable** is declared in `packages/platform/src/config/schema.ts` first, then given
  a disposable local placeholder in `LOCAL_EXAMPLES` here. A schema variable with no placeholder fails
  this module's own load, so `.env.example` cannot silently omit it.
- **A new local-only variable** — one Docker Compose reads and the application does not — is added to
  `VARIABLES` as a `localEntry` with its group, description, placeholder and validation spec. It never
  enters the application schema.
- **A new validation rule** goes in the variable's `spec`, or in `LOCAL_CHECKERS` when it applies only to
  a local-only declaration. Application variables are parsed with the schema's own `parseVariable`, so
  there is one implementation of every rule that matters.
- **A new cross-field check** is added to `crossCheck` and reports a message naming the variables and no
  value. It runs only when every variable passed its own check, and only against a loopback host.
- **A new environment file** is a new exported name or a parameter, never a hard-coded path inside the
  module.

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

- **The variable list has one owner.** `packages/platform/src/config/schema.ts` declares every variable
  the process reads, its type, its range and its secret classification; this module imports it and adds
  only the local plumbing and the disposable placeholder. No variable is declared here that the schema
  does not know, and no schema variable lacks a placeholder. A change to the list is a change in
  `packages/platform` first.
- **`.env.example` carries placeholders only.** Every value in the committed example is a disposable
  Development placeholder or a declared default; the header says so. The file is rendered from this
  module, never hand-edited, so it cannot drift from the variables the schema validates. `.env` itself is
  git-ignored and never committed.
- **No real credential enters the repository.** Staging and production values come from the managed
  secret store, and a missing secret fails boot rather than falling back to a default (`NFR-024`). The
  local database password, object-store keys, TOTP key and initial staff passwords in this contract exist
  only so a clean clone can start the disposable stack; none of them is valid outside it.
- **No value is logged, echoed or reported.** A validation problem names the variable and the reason —
  "`DATABASE_URL` must connect as `POSTGRES_USER` declares" — and never the value, including a value
  that failed validation. Cross-field checks compare values without printing either side. A script that
  consumes this contract prints counts and names, never assignments.
- **Validation is the gate, not a warning.** A candidate environment is either valid and returned, or
  every problem is collected and returned; callers refuse to start a container, boot the application or
  export to a runner when any problem remains. `process.env` wins over file values, an empty value counts
  as unset, and a URL aimed off the loopback host is deliberately not cross-checked against the local
  stack's port.
- **The example is generated, and drift is a failure.** `render` writes the file; `render --check`
  compares it and exits non-zero when it is stale. A hand edit to `.env.example` is overwritten and a
  stale file fails the check.

## Checks

Run from the repository root, with Node 24 and no Docker required.

- `node scripts/dev/env.mjs render --check` — the committed `.env.example` matches what this contract
  renders, so no variable was added, removed or renamed without regenerating it.
- `node scripts/dev/env.mjs check --no-file` — the process environment validates, or every missing or
  malformed variable is named without its value.
- `node scripts/ci/export-env.mjs --from .env.example` — the example itself passes validation, which
  proves every placeholder is well formed (`NFR-024`).
- `rg -n "process\.env" infra` matches nothing; the contract receives the environment it validates and
  never reads the ambient one itself.
- Placeholder scan: `rg -n "NFR-024|placeholder" infra/local/environment.mjs` confirms every secret entry
  carries the disposable-placeholder statement, and no entry carries a production-looking value.
- Manual before a new variable lands: confirm it exists in `packages/platform/src/config/schema.ts`,
  confirm its placeholder is disposable, regenerate the example, and confirm no credential appears in the
  working tree.

## Definition of Done

- Every variable the application or the local stack reads is declared once, in its owning place, and this
  contract covers it with a placeholder or a declared default.
- `.env.example` is regenerated from the contract, carries placeholders only, and `render --check` passes.
- Validation reports every missing or malformed variable by name with no value, in any message or exit
  path.
- The cross-field checks prove `DATABASE_URL`, `REDIS_URL` and `S3_ENDPOINT` agree with the ports and
  credentials the stack publishes, and a mismatch fails rather than warns.
- No real credential, production host or personal data exists in this area or in the example file.
- The checks above pass, spec anchors are cited in docstrings, and any contract gap was reported rather
  than worked around.
