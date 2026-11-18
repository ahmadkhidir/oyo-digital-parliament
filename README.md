# Oyo Digital Parliament

**Your ward, on the record.**

A youth civic platform for Oyo State. Residents aged 18 to 35 table ward-level proposals, the campaign
answers each one with a costed and dated commitment or a published reason for declining, and every
commitment is tracked in the open until it is delivered, dropped, or handed over.

This repository is the application. It is scaffolded and ready for Phase 0 (Foundation); no product code
has been written yet.

## Start here

| If you are… | Read |
|---|---|
| A coding agent or engineer | [`AGENTS.md`](AGENTS.md) — the coordinator manual, then the nearest area `AGENTS.md` |
| Looking for the product definition | [`docs/OyoDigitalParliament/overview.md`](docs/OyoDigitalParliament/overview.md) |
| Implementing an interface | [`CONTRACTS.md`](CONTRACTS.md) - frozen contracts `C-001` to `C-091` |
| Working on visuals | [`assets/ASSETS.md`](assets/ASSETS.md) — slots `A-001` to `A-043` |
| Reviewing a technical choice | [`.decisions/`](.decisions/) — append-only ADRs |
| Planning the build | [`docs/OyoDigitalParliament/roadmap.md`](docs/OyoDigitalParliament/roadmap.md) |

## Repository layout

```text
apps/web/               Next.js application: public record + role-scoped /admin console
packages/domain/        Business rules and use-case orchestration (framework-agnostic)
packages/db/            PostgreSQL schema, migrations, repositories, full-text search
packages/ui/            Design tokens, primitives, record components
packages/inference/     Inference gateway, de-identification, evaluation harness
services/worker/        Scheduled obligations: overdue check, report cards, handover
assets/                 Visual asset ledger and generated files
docs/                   Specification, mounted as a git submodule
```

## Specification submodule

The specification is its own repository and is mounted at `docs/` as a submodule. The application
repository is public; the specification repository is private and access-controlled, because it contains
campaign strategy, regulatory analysis, and unpublished positioning. Cloning with `--recurse-submodules`
therefore requires access to `oyo-digital-parliament-docs`. Without that access, clone the application
code only; no runtime path depends on the specification being present.

```bash
git clone --recurse-submodules https://github.com/ahmadkhidir/oyo-digital-parliament.git
cd oyo-digital-parliament
```

For an existing clone:

```bash
git submodule update --init --recursive
```

Specification changes are committed in `oyo-digital-parliament-docs` first; the pointer bump is a
separate PR here. Never edit `docs/` from an implementation task.

## Local development

Phase 0 creates the toolchain. Once it is complete, the canonical entry points are:

```bash
pnpm install
pnpm dev          # web application and worker against local PostgreSQL and Redis
pnpm test         # unit and integration tests
pnpm build        # production build
```

The full command table, per-area commands, and the verification rules live in [`AGENTS.md`](AGENTS.md).

## Launch gates

Public launch is gated on the Nigeria Data Protection Commission registration where the threshold is met,
a named external reviewer for moderation decisions, and a named legal reviewer for takedown and
defamation decisions. The model provider must be under a data-processing agreement at a named processing
region before any inference capability is enabled. A custodian or a read-only public archive must be
agreed for the record after polling day.

## Status and disclosure

Private repository. The platform is a campaign instrument, disclosed as one. It is not a government
body, not INEC, and not a legislature. It never records political support, party membership, voting
intention, or donation, and it is never used for campaign contact, canvassing, or persuasion.
