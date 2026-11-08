# SQLite → PostgreSQL Migration Plan

Status: approved for implementation (planning only, no code changes yet)
Created: 2026-11-08

## Decisions

| Decision | Choice |
|---|---|
| Feature flag | Runtime server-side env flag: `DB_PROVIDER=sqlite` or `postgres` |
| Data migration | Schema/adapter first; existing SQLite → PostgreSQL data copy deferred |
| Repository extraction | Incremental, module-by-module, tests after each module |
| PostgreSQL backups | Implement `pg_dump` / `pg_restore` provider |

## Current State

- 18 server-action files with ~350 direct `prisma.*` calls.
- Transactions are orchestrated inside server actions (11 files).
- Single Prisma client in `src/lib/prisma.ts`, hard-wired to `@prisma/adapter-libsql`.
- Some DB logic is already isolated: `src/lib/inventory-transaction.ts`, `src/lib/period-lock.ts`.
- SQLite-only code paths:
  - `src/app/settings/actions.ts`: `VACUUM INTO`, `PRAGMA integrity_check`, `PRAGMA wal_checkpoint`, `sqlite_master`, LibSQL client.
  - `src/app/closing/monthly/actions.ts`: SQLite backup checklist item.
  - `scripts/*.mjs` and `tests/*.ts`: direct `@libsql/client` and SQLite DDL.
- Schema is close to provider-neutral: no `enum`, `Json`, `Decimal`, `BigInt`, `Bytes`, or `@db.*` annotations.
- The only schema blocker is `provider = "sqlite"`; Prisma does not allow `provider` from an env variable.
- Unique references already exist (`Sales.reference`, `Payment.reference`, etc.), which helps PostgreSQL concurrency handling.
- Existing integration tests create isolated SQLite databases and call server actions directly; they are the regression safety net for the extraction.

## Architecture

Prisma already provides a provider-agnostic query API. Do **not** create duplicate SQLite/PostgreSQL repositories.

Build:

1. A provider-agnostic repository layer using the same Prisma API.
2. A thin DB adapter that selects the Prisma client per provider.
3. A capabilities layer for the few real provider differences (search case sensitivity, backups).
4. Two generated Prisma clients from two schema variants, because `provider` is static.

All provider-specific code stays under `src/server/db` and `src/server/services/backup`.

### Target Structure

```
src/server/
  db/
    config.ts              # DB_PROVIDER flag, URLs, validation
    index.ts               # db singleton, AppPrismaClient, DbClient, TxClient, withTransaction
    client.sqlite.ts       # PrismaLibSql + SQLite URL resolution
    client.postgres.ts     # PrismaPg + connection string
    capabilities.ts        # supportsFileBackup, caseInsensitiveSearch, providerLabel
    search.ts              # buildContainsFilter() for provider-aware search
  repositories/
    catalog.repository.ts
    inventory.repository.ts
    customers.repository.ts
    sales.repository.ts
    purchases.repository.ts
    suppliers.repository.ts
    cash.repository.ts
    treasury.repository.ts
    savings.repository.ts
    closing.repository.ts
    documents.repository.ts
    reports.repository.ts
    dashboard.repository.ts
    settings.repository.ts
  services/
    period-lock.ts
    backup/
      index.ts
      sqlite.backup.ts
      postgres.backup.ts
```

`src/lib/prisma.ts`, `src/lib/inventory-transaction.ts`, and `src/lib/period-lock.ts` become re-export shims during the transition, then are removed.

## Repository Conventions

- Repositories contain only data access: Prisma queries/mutations, reference generators, search-filter construction.
- No `"use server"`, no `revalidatePath`, no FormData parsing, no UI formatting.
- Every function accepts an optional transaction client so actions can compose atomically:

```ts
export type DbClient = AppPrismaClient | TxClient;

export async function findCustomerById(id: number, db: DbClient = prisma) {
  return db.customer.findUnique({ where: { id } });
}
```

- Actions keep: validation, business calculations, transaction orchestration, error formatting, revalidation.
- Cross-action imports are removed. For example:
  - `generateNextExpenseReference` moves to `cash.repository.ts`.
  - `reverseSavingsDeductionsForSale` moves to `savings.repository.ts`.
  - `sales/actions.ts` stops importing `cash/actions.ts` and `savings/actions.ts`.

## Phase 0 — Baseline Safety Net

- Run `npm run test:all` and record the current green baseline.
- Do not modify `src/generated/prisma` until Phase 4.

## Phase 1 — Database Seam + Repository Skeleton

Create:

```
src/server/db/index.ts
src/server/db/config.ts
src/server/repositories/
src/server/services/period-lock.ts
src/server/services/inventory.ts
```

Tasks:

- Move `inventory-transaction.ts` → `src/server/services/inventory.ts`.
- Move `period-lock.ts` → `src/server/services/period-lock.ts`.
- Leave re-export shims in `src/lib` so existing imports keep compiling.
- Make `src/lib/prisma.ts` re-export from `src/server/db`.
- Define shared types:

```ts
export type AppPrismaClient = /* canonical generated client */;
export type TxClient = Parameters<Parameters<AppPrismaClient["$transaction"]>[0]>[0];
export type DbClient = AppPrismaClient | TxClient;

export function withTransaction<T>(fn: (tx: TxClient) => Promise<T>): Promise<T>;
```

Acceptance: no behavior change; tests still pass.

## Phase 2 — Incremental Repository Extraction

Order follows existing test coverage. After each module:

1. Extract queries/mutations into the repository.
2. Refactor the action to call the repository.
3. Run the module's test script.

| Step | Repository | Actions migrated | Verification |
|---|---|---|---|
| 1 | `customers.repository.ts` | `customers/actions.ts` | `test:new-customer` + manual |
| 2 | `catalog.repository.ts`, `inventory.repository.ts` | `products/actions.ts` | `test:stock`, `test:stock-kpi` |
| 3 | `dashboard.repository.ts` | `dashboard-actions.ts` | `test:reports` |
| 4 | `reports.repository.ts` | `reports/actions.ts` | `test:reports` |
| 5 | `documents.repository.ts` | `documents/actions.ts` | `test:documents` |
| 6 | `sales.repository.ts` | `sales/actions.ts`, `sales/advances-actions.ts` | `test:sales`, `test:sales-deposit`, `test:sales-calculations` |
| 7 | `purchases.repository.ts`, `suppliers.repository.ts` | `purchases/actions.ts`, `suppliers/*-actions.ts` | `test:purchases`, `test:supplier-ledger`, `test:treasury` |
| 8 | `cash.repository.ts`, `treasury.repository.ts` | `cash/actions.ts`, `cash/treasury-actions.ts` | `test:cash`, `test:cash-out-of-session`, `test:closing-audit` |
| 9 | `savings.repository.ts` | `savings/actions.ts` | `test:savings` |
| 10 | `closing.repository.ts` | `closing/monthly/actions.ts` | `test:documents` + manual |
| 11 | `settings.repository.ts` | `settings/actions.ts` | `test:settings` |

Rules:

- Preserve every exported server-action signature so tests and UI stay unchanged.
- Keep business logic in actions; only DB access moves.
- Multi-step atomic operations keep their `prisma.$transaction` wrapper in the action and pass `tx` into repository functions.

## Phase 3 — Enforce the Boundary

- Add an ESLint `no-restricted-imports` override for `src/app/**`:
  - forbid `@/lib/prisma`
  - forbid `@/generated/prisma/*`
  - allow `@/server/repositories/*`, `@/server/services/*`, `@/server/db/*`
- Optionally add `scripts/check-architecture.mjs` for CI.
- Remove the `src/lib` shims once all imports are updated.

Acceptance: no direct Prisma import under `src/app`.

## Phase 4 — Runtime Provider Flag + Dual Client

Dependencies:

```
npm install @prisma/adapter-pg pg
```

Schema generation:

- Keep `prisma/schema.prisma` as the canonical schema (SQLite provider).
- Add `scripts/db/build-provider-schemas.mjs`:
  - read the canonical schema
  - swap `provider` and generator output
  - write `prisma/.generated/{sqlite,postgres}/schema.prisma`
- Generate clients to `src/generated/prisma/{sqlite,postgres}`.
- Gitignore generated output; generate via `postinstall` and `prebuild`.

`package.json` scripts:

```
db:generate:sqlite
db:generate:postgres
db:generate            # both
db:migrate:sqlite
db:migrate:postgres
```

`prisma.config.ts`:

- Select schema, migrations path, and datasource URL from `DB_PROVIDER`.
- Keep SQLite default when `DB_PROVIDER` is unset.

`src/server/db`:

- `config.ts`:
  - `DB_PROVIDER = process.env.DB_PROVIDER ?? "sqlite"`
  - validate value; PostgreSQL requires `POSTGRES_DATABASE_URL`.
- `client.sqlite.ts`: existing URL resolution + `PrismaLibSql`.
- `client.postgres.ts`: `PrismaPg({ connectionString })`.
- `index.ts`:
  - synchronous singleton
  - canonical generated type + cast for the PostgreSQL client
  - preserve `isDatabaseRestoring`, `setDatabaseRestoring`, `resetPrismaClient`, `disconnectPrismaClient`.
- `capabilities.ts`: `supportsFileBackup`, `caseInsensitiveSearch`, `providerLabel`.
- `search.ts`: `buildContainsFilter()` adds `mode: "insensitive"` only on PostgreSQL; adopt it in search repositories.

`.env.example`:

```
DB_PROVIDER=sqlite
DATABASE_URL=file:./prisma/shop.db
POSTGRES_DATABASE_URL=postgresql://user:password@localhost:5432/shop
```

Acceptance:

- `DB_PROVIDER=sqlite npm run test:all` passes.
- `DB_PROVIDER=postgres` starts against a disposable database and runs a smoke query.

## Phase 5 — PostgreSQL Baseline + Concurrency Hardening

- Create `prisma/migrations-postgres/` with a fresh baseline migration.
  - SQLite migrations are not reusable across providers.
- Provider-agnostic fixes in repositories:
  - Stock deduction: atomic conditional update:
    ```ts
    updateMany({
      where: { productId, locationId, quantity: { gte: quantity } },
      data: { quantity: { decrement: quantity } },
    })
    ```
    Check affected rows before proceeding.
  - Paid amounts and balances: use atomic `increment`/`decrement`.
  - Reference generation: retry on Prisma `P2002` (unique reference) or introduce a sequence table.
- Replace SQLite-specific `"no such table"` detection in `period-lock.ts` with Prisma `P2021`.
- Add `test:pg:smoke` driven by `TEST_POSTGRES_URL`:
  - one read
  - one transaction
  - one stock deduction
- Validate:
  - timezone behavior (Africa/Algiers + UTC dates)
  - `Float` money storage remains acceptable (keep `Float`; no `Decimal` migration).

## Phase 6 — Backup Provider Abstraction

- Extract existing SQLite logic to `src/server/services/backup/sqlite.backup.ts`:
  - `VACUUM INTO`
  - `PRAGMA integrity_check`
  - `PRAGMA wal_checkpoint(TRUNCATE)`
  - `sqlite_master` verification
  - restore flow
- Add `src/server/services/backup/postgres.backup.ts`:
  - `pg_dump` custom format
  - timestamped files
  - verification via `pg_restore --list`
  - `pg_restore` restore flow
  - clear error if client binaries are unavailable
- `backup/index.ts` selects implementation by `DB_PROVIDER`.
- Settings actions call the backup service, not LibSQL directly.
- `settings.repository.ts` keeps only `ShopSettings` CRUD and location lookups.
- Make the closing checklist backup label provider-neutral.

Acceptance:

- `test:settings` passes on SQLite.
- Backup/restore works manually on PostgreSQL when `pg_dump`/`pg_restore` are installed.

## Phase 7 — Data Migration (Deferred)

Not in this scope. Documented for a follow-up:

- `scripts/migrate-sqlite-to-postgres.ts`
- Read via SQLite generated client, write via PostgreSQL client in FK-safe order.
- Reset identity sequences with `setval`.
- Verify row counts and financial totals.
- Require a final SQLite snapshot before cutover.

## Phase 8 — Verification and Documentation

- `npm run test:all` green after every module and after the adapter.
- PostgreSQL smoke run against a disposable database.
- Update `README.md` architecture and database sections.
- Update `.env.example`.
- Document backup/restore behavior per provider.
- Document the future data-migration cutover procedure.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Dual generated clients double generated code | Gitignore generated output; generate in `postinstall`/`prebuild` |
| Type drift between generated clients | Generate both from one schema; canonical type + cast |
| Search/ordering semantics differ (PG case-sensitive `contains`) | Centralize in `search.ts`; add parity tests |
| PG concurrency exposes races hidden by SQLite | Atomic conditional updates, `increment`/`decrement`, `P2002` retry |
| Provider-specific backups | Capability layer + provider-specific backup services |
| Big-bang refactor regressions | Incremental extraction, existing test suite after each module |

## Definition of Done

- No `src/app/**` file imports Prisma directly; all DB access goes through `src/server/repositories`.
- `DB_PROVIDER=sqlite` preserves behavior and all tests pass.
- `DB_PROVIDER=postgres` runs the same repositories against PostgreSQL with a fresh baseline migration.
- Settings backup works per provider.
- Provider differences are isolated to `src/server/db` and `src/server/services/backup`.
