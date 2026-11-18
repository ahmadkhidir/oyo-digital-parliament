# packages/platform

The adapters between the application and everything it does not own: the validated configuration the
process boots from, the Nigerian SMS gateway, the S3-compatible object store, the Redis read cache,
sessions and rate-limit counters, the clock, and the identifier factory. It implements the ports that
`packages/domain` declares and hides every vendor behind a narrow seam, so a provider can be replaced in
one directory without a use case, a route or a schema changing.
Root `AGENTS.md` is the coordinator's manual: read it for repository-wide workflow, dispatch, and verification gates.

## Scope

This package owns: configuration schema and loading, secret resolution at boot, the SMS transport adapter,
the object-storage adapter including key naming and signed access, the Redis client and cache adapter
including key namespacing and invalidation, the system clock and its calendar helpers, and the prefixed
identifier factory. It also owns the doubles that stand in for each of those systems in a test, because a
double that drifts from the adapter it replaces is worse than no double.

It does not own business policy. When a message is held, retried or considered delivered; what a cache key
means to a reader; which artefact is written to storage; when a record may be forgotten — those are
`packages/domain` and `packages/db` decisions. This package transports, stores, counts, ticks and names. It
never decides, publishes, renders or audits. `packages/db` owns PostgreSQL and the durable outbound queue;
`packages/domain` owns the dispatch, hold and retry policy; `packages/inference` owns model egress and is
the only package allowed to talk to a model provider. The issue's `Own` paths are binding; everything
outside `Own` is read-only.

Read-only inputs: `architecture.md` for the Notification Service, Object Storage, Read Cache and External
Integrations; `CONTRACTS.md` `C-036` for signed download, `C-076` for the notification boundary, `C-075`
and `C-086` for what the cache serves and who invalidates it, and `C-088` for the handover snapshot;
`schema.md` for identifier prefixes and enum spellings; `nfr.md` `NFR-021` and `NFR-024` for credential
handling, plus its data-protection requirements for any provider that leaves the region. The specification
says what must hold; this file says how code here is built.

## Structure

The intended manifest is `packages/platform/package.json`, workspace name `@odp/platform`, created in
Phase 0. Dependencies, scripts and subpath exports are declared there and nowhere else.

| Path | Holds |
|---|---|
| `src/config/schema.ts` | The one configuration schema: every variable the process reads, its type, whether it is required, its permitted range or enum, and its secret classification. Adding a variable starts here. |
| `src/config/load.ts` | Reads the environment once, parses it through the schema, resolves secrets from the secret store, freezes the result and fails the process on a missing, malformed or out-of-range value before anything listens. |
| `src/config/index.ts` | The typed configuration object and the module-level guard that refuses a second load. |
| `src/clock/clock.ts` | The system clock: the only production implementation of the domain clock port, returning UTC instants. |
| `src/clock/calendar.ts` | Pure calendar helpers — day, week, quarter and month boundaries, and the Lagos rendering of an instant — that take the instant as an argument and never read the clock themselves. |
| `src/ids/ids.ts` | The identifier factory: one function per entity kind, each carrying the prefix `schema.md` assigns, ULID-ordered, opaque, generated once and never derived from a person. |
| `src/ports/` | The provider seams, one file per external system: `sms-provider.ts`, `object-store.ts`, `cache-store.ts`. These are narrower than the domain ports and describe what a vendor must do, not what a use case needs. |
| `src/adapters/sms/<vendor>/` | One directory per SMS vendor: `client.ts` (the vendor SDK call and its raw response), `adapter.ts` (the domain delivery port over that client, mapping failures to stable causes), `adapter.test.ts`. |
| `src/adapters/storage/<vendor>/` | The same three files for object storage, plus `keys.ts` for the key-naming scheme and `urls.ts` for signed access. |
| `src/adapters/cache/redis/` | The Redis client, the cache adapter, `keys.ts` for the namespace scheme and `invalidate.ts` for the families a publication or a decision clears. |
| `src/testing/` | The doubles: `fixed-clock.ts`, `deterministic-ids.ts`, `fake-sms.ts`, `memory-object-store.ts`, `memory-cache.ts`, `config-fixture.ts`, and the shared contract suites each pair of adapter and double must pass. Exported through the `./testing` subpath, never from `src/index.ts`. |
| `src/index.ts` | The composition root: builds the configured adapters from the loaded configuration and returns the port bundle an application or worker passes to `@odp/domain`. Nothing else is exported from the package root. |
| `test/` | Integration tests against disposable Redis and an S3-compatible bucket from the local Compose stack, plus the adapter-versus-double parity runs. |

Placement rules:

- **A new external system** gets a provider seam file in `src/ports/`, one adapter directory under
  `src/adapters/<capability>/<vendor>/`, a double in `src/testing/`, and a line in the composition root.
  Nothing outside this package learns the vendor's name.
- **A new vendor for an existing capability** adds a sibling directory under the same capability, plus its
  own double. No port changes, no caller changes, and the composition root selects between them from
  configuration.
- **A new port method** is added in `src/ports/` first, then to every adapter and double that implements it,
  then to the contract suite. A method that only one adapter can honour belongs in that adapter, not in the
  shared seam.
- **A new identifier kind** adds one function in `src/ids/ids.ts` with the prefix the schema assigns, and
  the matching double entry. Never generate an identifier inline at a call site.
- **A new cache family** adds its builder to `keys.ts`, its invalidation trigger to `invalidate.ts`, and its
  TTL to the schema-owned configuration. A key builder that lives in the caller is a defect.
- **A new configuration variable** is added to the schema with its classification and range, consumed
  through the typed object, and named in the repository's example environment file. An area does not read
  `process.env` for it.

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

- **Configuration is parsed once, at the boundary, and never re-read.** One schema owns every variable, its
  classification and its permitted shape; the loader parses the environment exactly once, resolves secret
  references from the secret store, freezes the object and fails the process before it serves traffic when
  a required value is absent, an enum is unknown or a number is out of range. `process.env` appears only in
  `src/config/`, and nowhere after boot. A secret has no default and no fallback literal; a missing secret
  is a failed boot, never a silently degraded provider. The configuration object is never logged,
  serialised into an error, attached to telemetry or written to a cache key, and a test asserts that a
  malformed value fails startup rather than surfacing at first use.
- **A port is narrow and an adapter only translates.** The domain port states what a use case needs; the
  provider seam states the smaller set of operations a vendor can offer. An adapter converts arguments,
  performs the call, and maps the vendor's failure into the caller's stable cause with no raw provider
  payload in the message. It carries no business rule, no publication decision, no retry loop, no queue
  policy and no idempotency decision — the caller owns all five, because only the caller knows whether a
  second attempt is safe. A transport error is reported, never swallowed, and never converted into an empty
  success; a not-found is reported as not-found, never invented as an object.
- **Secrets and personal data never leave the boundary.** Credentials arrive from the validated
  configuration or the secret store and are held in memory only; they never enter source, a fixture, a
  committed test, a log line, a URL, an error message, a stack trace or a telemetry attribute. Logs carry
  operation, provider, latency, attempt count, outcome and a coarse message class — never a telephone
  number, name, member identifier, ward description, submission or comment text, message body, object key
  containing a person, or signed URL. A cache key, an object key and a metric label are built from opaque
  identifiers and fixed vocabulary only. Where a provider forces an address into a request, it comes from
  the caller's data at call time and is never retained afterwards.
- **Vendor SDKs are confined to this package.** Only `src/adapters/` imports a vendor client. No other
  area may depend on a vendor package, hold a provider credential, open a connection to a provider
  endpoint, or construct its own Redis or object-store client; everything reaches these systems through
  the port bundle from `src/index.ts`. The boundary is proven by an import scan that fails on a vendor
  import outside `src/adapters/`, and by a second scan that fails on a connection string literal anywhere
  else.
- **The read cache is never the record.** A cached page, session or counter is a copy with a stated expiry,
  never the only copy of a published fact: a miss, an eviction or an unreachable Redis falls back to the
  authoritative read instead of serving a stale figure as current. Every key family has one builder, one
  explicit TTL and one named invalidation trigger in `invalidate.ts`; no key is written with an infinite
  TTL, and no personal field appears in a key. Session material is an opaque random value, stored hashed,
  never derived from a member identifier, and removed on sign-out and expiry. Rate-limit counters are keyed
  by hashed subject and fixed window, never by telephone number.
- **Storage is write-once, private and time-limited.** The bucket is private, encrypted at rest and never
  publicly readable; a client reads an artefact only through a short-lived signed URL minted for one
  object, as `C-036` requires, and a signed URL is never logged, cached or embedded in a page. An artefact
  is written once under a key that states its kind, its scope and its generation time, and a correction is
  a new object that supersedes the old one — nothing overwrites a published export, report card or handover
  snapshot. The key scheme lives in `keys.ts`, carries opaque identifiers and no personal data, and every
  artefact has a lifecycle rule that was recorded as a decision.
- **SMS is a transport, and a hold is not a loss.** A send returns the provider's outcome and a message
  reference; the adapter maps an outage, rejection or timeout to a held or failed result with a stable
  cause, and returns it to the caller rather than throwing into a write that must still succeed. Retry,
  backoff, deduplication and the decision to hold belong to the notification boundary (`C-076`), not to the
  adapter. No adapter logs the message body or the destination number, and no test sends a real message.
- **Time and identity are injected, never ambient.** The clock here is the only production source of the
  current instant; it returns UTC, and a caller that needs a Lagos day or a quarter boundary calls a pure
  helper with that instant. Identifiers carry the prefix the schema assigns, are ULID-ordered, generated
  once, stable for the life of the record and never reused, recycled or derived from a person, a counter or
  a telephone number. `Date.now()`, `new Date()`, `Math.random()` and `randomUUID()` appear only in
  `src/clock/` and `src/ids/`; any other occurrence in this package is a defect.
- **A double replaces a system, and it passes the same contract.** Every external system has a double in
  `src/testing/` that implements the same port as its adapter, is time-aware and deterministic, and is
  driven by explicit fixtures rather than a real account. An adapter and its double run the same shared
  contract suite, so a signature or failure-mapping change that lands in one and not the other fails the
  suite. No unit test reaches a real gateway, Redis, bucket or network, and no double is exported from the
  production entry point.

## Checks

Run from the repository root. The local Compose stack provides disposable Redis and an S3-compatible
bucket; no check touches a shared environment.

- `pnpm --filter @odp/platform typecheck` — strict TypeScript across `src`, `test` and the doubles, with no
  `any` in an exported signature.
- `pnpm --filter @odp/platform test` — unit and contract tests, offline, with every external system doubled.
- `pnpm --filter @odp/platform test:integration` — the adapters against the disposable Redis and bucket,
  including signed-URL expiry, a cache miss on an unreachable Redis, and a simulated SMS outage.
- `pnpm --filter @odp/platform lint` — includes the import boundary that keeps vendor SDKs and connection
  strings inside `src/adapters/`.
- Ambient scan: `rg -n "process\.env" packages/platform/src` matches only `src/config/`;
  `rg -n "Date\.now|new Date\(\)|Math\.random|randomUUID" packages/platform/src` matches only
  `src/clock/` and `src/ids/`.
- Personal-data scan: `rg -n "telephoneNumber|fullName|declaredAge|wardDescription" packages/platform/src`
  matches nothing, and the same names are absent from every log call and every key builder.
- Boot failure test: start the process with one required variable absent, one enum unknown and one number
  out of range; each must fail before the port opens, with a message naming the variable and never its
  value.
- Manual before a new provider is enabled: confirm the variable names and placeholders in the example
  environment file, confirm no credential exists in the working tree, and confirm the provider and its
  processing region were recorded as a decision.

## Definition of Done

- The adapter or port the issue names is implemented behind its seam, reachable only through the
  composition root, with no second client, connection or credential introduced anywhere in the repository.
- Configuration for the change lives in the schema, is validated at boot, has no secret default, and is
  proven to fail startup on a missing or malformed value.
- A failed provider call returns the caller's typed failure with its stable cause, and a test asserts that
  no success, empty result or partial artefact is fabricated in its place.
- No credential, telephone number, name, member identifier, ward description, message body, object key or
  signed URL appears in a log line, a metric, a cache key, an error message or a committed fixture.
- Cache keys are built in `keys.ts` with an explicit TTL and a named invalidation trigger, and a test shows
  the read path recovering from an eviction or an unreachable Redis by reading the authority.
- Object storage is private, encrypted and time-limited on read; a test proves an unsigned access fails,
  a signed URL expires, and a correction writes a new key rather than overwriting the old one.
- Every new external system has a deterministic double, and the adapter and the double pass the same
  contract suite.
- `typecheck`, `test`, `test:integration`, `lint` and the scans above pass, spec anchors are cited in
  docstrings, and any contract gap was reported rather than worked around.
