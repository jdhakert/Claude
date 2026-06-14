# ADR 0002 — Data-access layer & migration tooling

- **Status:** Accepted
- **Date:** 2026-06-14
- **Deciders:** BarReady core team
- **Context docs:** [ADR 0001 — Stack](./0001-stack.md), [Architecture](../ARCHITECTURE.md),
  [Data Model](../DATA_MODEL.md)

## Context
ADR 0001 chose PostgreSQL and a "typed query/migration layer" but deferred the
specific tool to a follow-up ADR. We now need to implement the schema (the domain
model), generate forward-only migrations, and ship **portable, runnable tests**
that validate schema relationships — ideally without requiring Docker or an
external Postgres server in every environment (including ephemeral CI/web
sessions).

## Decision
- **ORM / query builder:** **Drizzle ORM** (`drizzle-orm`) — a thin, typed,
  SQL-first layer that keeps us close to Postgres semantics (enums, `jsonb`,
  arrays, FK actions) with end-to-end TypeScript types (Charter §2).
- **Migrations:** **drizzle-kit** generates **forward-only SQL** migrations from
  the schema (`drizzle-kit generate`) — and does so **offline, without a live
  database**, which fits the ephemeral environment.
- **Test database:** **PGlite** (`@electric-sql/pglite`) — an in-process WASM
  build of Postgres. Tests apply the **real generated migrations** and run with
  true Postgres semantics, with **zero external services**. Integration tests
  against a containerized Postgres (Charter §4) remain available for CI depth.
- **Production driver:** `postgres` (postgres-js) via `drizzle-orm/postgres-js`.
- **Identifier casing:** TypeScript camelCase, database `snake_case` (Drizzle
  `casing: "snake_case"`).

## Alternatives considered
- **Prisma** — excellent DX, but its migrate engine expects a live database, its
  enum support doesn't extend to a no-server test target, and PGlite isn't a
  first-class driver. Heavier runtime for our needs.
- **Kysely (+ a separate migration tool)** — great types, but we'd assemble
  schema + migration generation ourselves; Drizzle gives both in one tool.
- **Raw SQL + node-pg-migrate** — maximal control, minimal type safety; rejected
  for losing the end-to-end TS contract.
- **Containerized Postgres for all tests** — good fidelity but requires Docker
  everywhere; PGlite gives Postgres semantics with no dependency, so we default
  to it and keep containers for heavier integration suites.

## Consequences
- **Positive:** one tool for schema + migrations; offline migration generation;
  fast, dependency-free relationship tests with real Postgres behavior;
  forward-only SQL migrations are reviewable artifacts in the repo.
- **Negative / risks:** PGlite is not byte-identical to a given server Postgres
  version — deep, server-specific behavior should still be covered by a
  containerized Postgres suite in CI. Drizzle's modular-monolith discipline (no
  cross-module raw joins) must be upheld in review (Architecture §4.1).
- **Follow-ups:** add a containerized-Postgres integration job in CI for
  migration/restore fidelity; future ADR for the job-queue/worker choice.
