# AGENTS.md

Guidance for AI agents working in this repository (shop-ERP — furniture shop management: stock, sales, purchases, suppliers, cash/treasury, documents).

Stack: Next.js App Router + TypeScript, Prisma 7 with **driver adapters**, dual-provider **SQLite / PostgreSQL** selected at process start.

---

## 1. DB adapter abstraction — NON-NEGOTIABLE

The app is provider-agnostic (SQLite by default, PostgreSQL on Vercel). All DB access follows a strict layer map:

```
src/app/**            (server actions, pages, components)
   ↓ calls functions from
src/server/repositories/*.ts   (ALL prisma queries live here)
src/server/services/*.ts       (inventory, period-lock, backup — built on repositories)
   ↓ imports the singleton from
src/server/db/index.ts         (the ONLY layer that touches provider clients)
   ↓ picks at runtime via DB_PROVIDER
@/generated/prisma/sqlite | @/generated/prisma/postgres
```

Rules (the first two are ESLint-enforced in `eslint.config.mjs` for `src/app/**`):

1. **Never import `@/lib/prisma` or `@/generated/prisma/**` from `src/app/**`.** Run `npm run lint` — it must stay at 0 violations. Use `@/server/db`, `@/server/repositories/*` or `@/server/services/*` instead.
2. **Server actions never query/write the DB directly — repository first.** Every read and every write goes through a function in `src/server/repositories/*.ts`. Business logic (validation, calculations, orchestration) lives in the action; the Prisma statements live in the repository.
3. Repository function contract: first parameter `db: DbClient = prisma` (types from `@/server/db`); transaction-scoped helpers take `tx: TxClient`. When you need a new query, add a function there — never inline `db.model.findMany(...)` in an action.
4. Transactions: actions may open the transaction — `prisma.$transaction(async (tx) => ...)` or `withTransaction(...)` from `@/server/db` — but the statements inside must be repository calls that accept `tx`. Do not write `tx.model.create(...)` inline in actions.
5. Only `src/server/db/*` may import the generated clients or adapters. `src/server/db/index.ts` and `src/lib/prisma.ts` carry `import "server-only"` — keep those guards.
6. Schema workflow: `prisma/schema.prisma` is the single source. After any change run `npm run db:generate` (builds both provider schemas in `prisma/.generated/` and regenerates both clients in `src/generated/prisma/`). Never hand-edit anything under `prisma/.generated/` or `src/generated/`.

## 2. Provider & migrations gotchas

- `DB_PROVIDER` env: `"sqlite"` (default, `prisma/shop.db`) | `"postgres"` (`POSTGRES_DATABASE_URL`).
- PostgreSQL runtime uses the **transaction pooler (port 6543)** — session pooler (5432) exhausts its 15-client cap under serverless load. `prisma migrate deploy` must use **5432**.
- SQLite migrations live in `prisma/migrations/`, PostgreSQL in `migrations-postgres/`. Keep both in sync with the schema.

## 3. Server-action conventions

- Return shape: `ActionResponse { success: boolean; error?: string; message?: string; data?: T }`.
- User-facing strings are **French**; money is formatted `${n.toLocaleString("fr-DZ")} DA`.
- Revalidate with `safeRevalidate("/path")` (never raw `revalidatePath` in a way that can throw).
- Backdated operations must call `await assertPeriodNotLocked(date, "Label opération")` (`@/server/services/period-lock`).
- Stock mutations flow through `@/server/services/inventory` — stock movements are **append-only**; never update/delete a movement.

## 4. Protected business contracts

`docs/USER_GUIDE.md` is the business-flow reference (also see `docs/MODULES_REFERENCE.md`). The aligned test suites in `tests/` are the arbiter of these contracts — do not change behavior without updating them deliberately.

Per `plans/regression-restore.md`, these three rules were accidentally changed by commit `9c45f6b` and **must stay at their baseline (restored) contract**:

1. **Delete a product with history → archive (soft-delete)**: action returns `success: true`, `data.action === "archived"`, stock rows preserved for audit. Hard-blocking deletion is the regression.
2. **Overpayment on a supplier invoice → crédit fournisseur**: the excess is accepted and annotated (`[Crédit fournisseur : …]`), not rejected. Rejecting overpayments is the regression.
3. **Multi-account supplier payment overage → credit note on the payment**, not a hard reject.

## 5. Verification commands

```powershell
npm run lint            # ESLint incl. the DB-boundary rule — must be 0 violations
npx tsc --noEmit        # typecheck
npm run test:all        # 23 suites (green SQLite baseline: plans/db-migration/baseline.md)
npm run test:stock      # individual suite (tsx -C react-server)
npm run build           # production build (Turbopack); build:webpack is the fallback
```

- Tests run against throwaway SQLite DBs — safe to run anytime.
- Keep `test:all` green before shipping; the recorded baseline is `plans/db-migration/baseline.md`.

## 6. Environment notes (Windows / PowerShell)

- Invoke npm via `npm.cmd` in PowerShell.
- Long-lived background servers: launch via `Invoke-CimMethod Win32_Process Create` (a plain `Start-Process` child gets killed by the tool harness); kill strays by querying `node.exe` processes with `next start` in their command line.
- Generated trees and test DBs are excluded from search/counters via `.vscode/settings.json` — do not delete those excludes.
