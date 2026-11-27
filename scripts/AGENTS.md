# scripts

The repository's operational tooling, written in Node ESM and run directly by CI and by hand: the
capability probe and aggregate verdict around the pipeline, the supply-chain reports, the local service
stack's command line, the local environment's command line, and the boot check that proves the built
application and worker start. None of it is product behaviour, and none of it is imported by the
application.
Root `AGENTS.md` is the coordinator's manual: read it for repository-wide workflow, dispatch, and verification gates.

## Scope

This area owns the command-line scripts that build, start, audit, export and verify the workspace: the CI
capability probe, environment export, dependency audit, software bill of materials, aggregate gate, the
local environment `check`/`render` command, the local Compose stack's `up`/`down`/`reset`/`status`/`logs`
command, and the Phase 0 boot check. Each script is one purpose with a documented usage block and explicit
exit codes.

It does not own product code, the application variable list (`packages/platform`), the local environment
contract (`infra/local/environment.mjs` — imported, never re-implemented), the Compose service definitions
(`docker-compose.yml`), the workflow that invokes these scripts (`.github/workflows/ci.yml`), or the
workspace commands in the root `package.json`. It implements no business rule and makes no product
decision. The issue's `Own` paths are binding; everything outside `Own` is read-only.

Read-only inputs: `architecture.md` for the environment and deployment model; `nfr.md` `NFR-010` for
availability probes, `NFR-024` for credential handling and `NFR-029` for pinned versions and the
supply-chain gate; `CONTRACTS.md` `C-091` for the probe bodies the boot check asserts; `package.json` and
`.github/workflows/ci.yml` for the commands a script must stay compatible with. The specification says
what must hold; this file says how tooling here is built.

## Structure

| Path | Holds |
|---|---|
| `scripts/ci/capabilities.mjs` | The preflight probe: reports which Phase 0 capabilities the tree provides so the workflow can skip only a job whose subject is absent. |
| `scripts/ci/export-env.mjs` | Validates one environment file through `infra/local/environment.mjs` and writes its values to `$GITHUB_ENV` for later workflow steps, printing only a count. |
| `scripts/ci/audit.mjs` | The dependency audit gate: turns the `pnpm audit` report into a pass/fail at a severity threshold, failing closed when the report cannot be read. |
| `scripts/ci/sbom.mjs` | Generates a CycloneDX 1.5 JSON bill of materials from the resolved `pnpm-lock.yaml`, refusing an unpinned version or a missing integrity hash. |
| `scripts/ci/gate.mjs` | The aggregate verdict: reads the workflow's job results from `CI_RESULTS` and passes only when every job passed or was skipped with a stated reason. |
| `scripts/dev/env.mjs` | The command line around the local environment contract: `check` validates, `render` writes `.env.example`, `render --check` detects drift. |
| `scripts/dev/services.mjs` | The local Compose stack: `up`, `down`, `reset --yes`, `status` and `logs`, always scoped to the fixed `odp-local` project and always validating the environment first. |
| `scripts/verify/boot-check.mjs` | The Phase 0 boot check: starts the built web application and the worker against the disposable stack and asserts the `C-091` probe bodies before stopping them. |

Placement rules:

- **A new CI script** lives in `scripts/ci/` and is invoked by `.github/workflows/ci.yml`. It reads its
  inputs from arguments, environment variables the workflow sets, or a committed file, and writes outputs
  to stdout, `$GITHUB_OUTPUT`, `$GITHUB_STEP_SUMMARY` or a path under the git-ignored `build/` directory.
- **A new developer command** lives in `scripts/dev/` and is documented in the root `AGENTS.md` command
  table only when the root `package.json` exposes it.
- **A new verification** lives in `scripts/verify/` and states its prerequisites, its exit codes and the
  contract or NFR it is evidence for.
- **Shared logic** that more than one script needs belongs in the area that owns the fact — the local
  environment contract in `infra/local/environment.mjs`, the variable schema in `packages/platform` — not
  in a copied helper. Scripts do not grow a `lib/` of product-adjacent code.
- **One script, one purpose.** A new purpose is a new file, not a mode flag on an unrelated script.

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

- **Node ESM, run directly.** Every script is a `.mjs` file with a shebang, imported only from `node:`
  built-ins and — where the local environment is the subject — `infra/local/environment.mjs`. It runs
  with `node scripts/<area>/<name>.mjs` on the pinned Node 24, with no build step, no TypeScript
  transpilation and no loader flag.
- **No product imports.** A script never imports from `apps/`, `packages/` or `services/`; it produces,
  inspects or verifies their outputs from the outside. The single permitted non-built-in import is the
  local environment contract, which is tooling. A script that needs a product fact reads the committed
  file that states it rather than reaching into the module graph.
- **Deterministic output.** The same inputs produce the same bytes: no timestamps, no absolute machine
  paths, no random identifiers, no dependency on the working directory beyond the repository root the
  script resolves from its own location, and no ordering that depends on filesystem enumeration. A
  generated artefact is reproducible from a clean clone.
- **Explicit non-zero exit on failure.** Every failure path writes one line naming what failed and exits
  non-zero — `1` for a failed check or invalid input, `2` for a usage error where the script documents it.
  A gate never exits `0` because a source was unreachable, a report could not be parsed or nothing was
  verified; it fails closed and says why. Success is the only path to `0`.
- **No secrets or personal data in output.** A script prints variable names, counts, file paths relative to
  the repository root and stable messages — never an environment value, a connection string, a token, a
  signed URL, a name, a telephone number or a member identifier. A value that failed validation is named,
  not quoted.
- **One purpose per script.** The usage block at the top states the purpose, the arguments and the exit
  codes. A script that needs a second unrelated mode is two scripts. A script whose subject has retired
  is deleted with its workflow edge, not left disabled.
- **Read-only unless the purpose is to write.** A check, probe or gate writes nothing outside
  `$GITHUB_OUTPUT`, `$GITHUB_STEP_SUMMARY` and the git-ignored `build/` directory. Only `render`, `up`,
  `down`, `reset` and the SBOM writer change state, and each says so in its usage block.

## Checks

Run from the repository root on the pinned Node 24.

- `node scripts/ci/capabilities.mjs` — prints one `name=true|false` line per capability and writes the
  same outputs to `$GITHUB_OUTPUT` when it is set.
- `node scripts/dev/env.mjs render --check` and `node scripts/dev/env.mjs check --no-file` — the
  committed example is current and the process environment validates.
- `node scripts/ci/export-env.mjs --from .env.example` — the example validates and exports, printing only
  a count.
- `node scripts/ci/sbom.mjs --out build/sbom.cdx.json` — a reproducible CycloneDX document with no
  machine path and no unpinned entry.
- `node scripts/ci/audit.mjs` — the resolved tree has no advisory at or above the configured threshold,
  and an unreachable report fails closed.
- `node scripts/ci/gate.mjs` with `CI_RESULTS` set — the aggregate verdict matches the job results.
- `pnpm build`, `node scripts/dev/services.mjs up`, `node scripts/verify/boot-check.mjs`, then
  `node scripts/dev/services.mjs down` — the boot path starts both processes and asserts the `C-091`
  probe bodies.
- Import scan: `rg -n "from '(\.\./)+(apps|packages|services)" scripts` matches nothing, and every
  non-built-in import resolves to `infra/local/environment.mjs`.
- Mode scan: every `.mjs` file here is executable as written — `node --check` on each file passes, and
  each has a shebang and a usage block.
- Output scan: `rg -n "console\.(log|error)" scripts` shows only names, counts, relative paths and stable
  messages; no call interpolates an environment value.

## Definition of Done

- The script or command the issue names does its one purpose, documents its usage and exit codes, and
  changes no state its purpose does not name.
- It imports only `node:` built-ins and, where the local environment is its subject, the local environment
  contract; nothing from `apps/`, `packages/` or `services/`.
- Output is deterministic and contains no secret, credential, connection string, personal datum or
  absolute machine path.
- Every failure path exits non-zero with one line naming what failed; a gate fails closed when its source
  is unreachable or empty.
- The checks above pass, spec anchors are cited in docstrings, and any contract or workflow gap was
  reported rather than worked around.
