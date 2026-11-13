# Deployment Debug Status — Vercel + Supabase

_Last updated: 2026-11-13 — **DEPLOY IS LIVE AND HEALTHY** ✅_
_Branch: `deploy/vercel-supabase` — commit `055b720` (zakat removal) deployed to prod_

## FINAL STATE (2026-11-13, ~18:05)

Production `https://grari-meuble.vercel.app` — ALL pages 200, `/zakat` 404 (removed), provider PostgreSQL confirmed. Two bursts tested.

Final root-cause chain (three stacked issues):
1. **Stale embedded schema in built chunk** — webpack build cache embedded a Postgres `inlineSchema` predating the zakat models → `prisma.zakatValuation` delegate missing at runtime → `/zakat` 500 under postgres only (sqlite client was fresh, hence provider-dependent). Forensics: decoded `inlineSchema` from `.next/server/chunks/8392.js` → `activeProvider:"postgresql"` block had 0 `model Zakat` despite source schemas being fresh.
2. **Resolution: zakat module removed entirely** (user decision) — deleted `src/app/zakat/**`, `src/lib/zakat/**`, `src/server/repositories/zakat.repository.ts`, `tests/zakat-{engine-integrity,zakat-phase3-workflow}.test.ts`; cleaned `src/config/navigation.ts` (2 entries + `Scale` icon import), `package.json` (`test:zakat`, `test:zakat-phase3`, trimmed `test:all`), `prisma/schema.prisma` (3 models, section was at EOF); regenerated both clients via `npm run db:generate`. No other module imported zakat (verified by grep). Committed `055b720`.
3. **Supabase session pooler exhaustion in prod** — `(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15` (P2039): Vercel lambda burst × pg Pool default max ~10 per instance > 15 session clients. **Fix: switched `POSTGRES_DATABASE_URL` (Vercel env, all targets) to the transaction-mode pooler, port 6543** (`aws-1-eu-central-1.pooler.supabase.com:6543`), keeping `?sslmode=require&uselibpqcompat=true`. Tested locally first (all 13 pages 200 through 6543), then redeployed. `migrate deploy` should still use 5432 (session mode). Note: `@prisma/adapter-pg`'s `PrismaPg` also accepts a `pg.PoolConfig` object (e.g. `{ connectionString, max: 5 }`) if per-instance capping is ever needed.

Leftovers: local server on port 3000 running (postgres/6543); both `aws-1-...:5432` session pooler and old env values were replaced everywhere for runtime. Supabase DB still empty (fresh) — restore/import data next.

---

## 1. Code State

### Committed (44159c9) — Vercel build fixes
- Converted all 5 invalid re-exports in `"use server"` files (cash, treasury, savings,
  suppliers, closing/monthly) to async delegating wrappers / type-only re-exports —
  fixed the webpack "Only async functions are allowed to be exported in a use server
  file" build failure.
- Created `src/server/db/types.ts` (canonical `Prisma` / `PrismaClient` type entry) and
  repointed 8 dangling `@/generated/prisma/client` imports (TS2307 build blocker).
- Decoupled client components from the mixed `@/lib/zakat` barrel (type imports now go
  through `src/app/zakat/types.ts` → `@/lib/zakat/types`).
- Added `server-only` guards + test-harness stub (`tests/ts-loader.mjs`) + `-C react-server`
  on tsx test scripts. **NOTE: guards are currently STRIPPED from 8 files (debug
  experiment — see §3), must be re-added before commit.**
- Deleted dead shims `src/lib/period-lock.ts`, `src/lib/inventory-transaction.ts`.
- `next.config.ts`: `serverExternalPackages` for `@libsql/client`, `@prisma/adapter-*`, `pg`.
- `package.json`: `engines.node >=22.12`, `server-only` + `@types/pg` deps.

### Uncommitted (working tree right now)
| Change | Files | Status |
|---|---|---|
| **Zakat migrated to repository abstraction** | NEW `src/server/repositories/zakat.repository.ts`; rewritten `src/app/zakat/actions.ts` (zero direct model calls; keeps `options.db` injection used by phase-3 tests) | ✅ tsc clean, test:zakat 37/37, test:zakat-phase3 25/25, test:daily-journal 11/11 |
| **Prisma clients REGENERATED** (both providers) | `src/generated/prisma/{sqlite,postgres}/**`, `prisma/.generated/*.prisma` | ✅ **ROOT-CAUSE FIX** — postgres client was stale (generated before the zakat module existed → `prisma.zakatValuation` was `undefined` → `/zakat` 500 under Postgres only). Now: postgres client has ZakatValuation/ZakatValuationItem/ZakatAdjustment (4 refs) |
| **`server-only` guards STRIPPED** (debug experiment) | `src/server/db/index.ts`, `src/lib/prisma.ts`, 6 × `src/lib/zakat/*.ts` | ⚠️ NOT the root cause — re-add before commit (they protect against client-bundle imports) |
| NEW migration folder (empty SQL) | `prisma/migrations-postgres/20261113150000_add_zakat_module/` | ⚠️ migration.sql is EMPTY — the `prisma migrate diff` command failed (see §4 step 1) |

### Test suite status (22 suites)
- **Green:** all suites except two.
- **Pre-existing failures (confirmed on clean HEAD via stash-test):**
  - `test:stock` 17/18 (Test 14 — delete-product-with-history archiving)
  - `test:purchases` 16/19 (Tests 12, 13, 14 — supplier payment/allocation)
- Lint: 83 pre-existing errors (`no-explicit-any` etc. in tests/clients), **0**
  `no-restricted-imports` boundary violations. Next 16 does not run ESLint at build.

---

## 2. Deployment State

### Supabase — project `GrariMeubles`
| Item | Value |
|---|---|
| Project ref | `uftoikpodkgrhehdxckk` (pre-existing, created 2026-11-11, EMPTY DB) |
| Region | `eu-central-1` (Frankfurt) |
| Connection string (session pooler) | `postgresql://postgres.uftoikpodkgrhehdxckk:<password>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require&uselibpqcompat=true` |
| DB password | `ZwZi6gzqaufzOKyZ` (user-provided; NOT the generated one — that generation was for a new project that we didn't need) |
| Applied migrations | `20261111000000_postgres_baseline` ✅ (32 tables) |
| **Missing** | **3 zakat tables** (`zakat_valuations`, `zakat_valuation_items`, `zakat_adjustments`) — the PG baseline predates the zakat module. Migration must be created + applied. |

Pooler notes:
- Direct host `db.<ref>.supabase.co` is IPv6-only — unreachable from this machine/Vercel. **Always use the `aws-1-` pooler host.** (The `aws-0-` host returns "tenant not found".)
- `sslmode=require&uselibpqcompat=true` is REQUIRED at runtime: current `pg` (8.23) treats plain `sslmode=require` as `verify-full` → TLS failure "self-signed certificate in certificate chain" (P1011). Prisma migrate CLI needs plain `?sslmode=require` (Rust/libpq semantics).

### Vercel — project `grari-meuble`
| Item | Value |
|---|---|
| Project ID | `prj_gm577YWvQL1HYYkPMNClmOpxT2VN` |
| Team | `team_VsYIXOuZlaykrX0HrJhgnCt4` (perlpi2003-6494) |
| Functions region | `fra1` (matches Supabase eu-central-1) |
| Env: `DB_PROVIDER` | `postgres` (production/preview/development) |
| Env: `POSTGRES_DATABASE_URL` | pooler URL incl. `?sslmode=require&uselibpqcompat=true` |
| Local link | `.vercel/project.json` created |
| Production deploy | ✅ `https://grari-meuble.vercel.app` — built & served |
| Prod page status (first deploy) | ALL pages 200 EXCEPT `/zakat` (500) |

**NOT needed:** `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — the app has no Supabase SDK; it talks raw Postgres through the Prisma DAL (per architecture decision).

---

## 3. Debugging history — the `/zakat` 500 under Postgres

1. First prod deploy: `/zakat` 500 with generic RSC digest error. All other pages OK.
2. Local repro (`next start` + exact prod build + postgres env) gave the real error:
   `P1011 TLS: self-signed certificate in certificate chain` → fixed via
   `uselibpqcompat=true&sslmode=require` (see Supabase notes). After fix: all pages 200
   except `/zakat`.
3. `/zakat` failed with `TypeError: Cannot read properties of undefined (reading 'findMany')`
   — deterministic under Postgres, **works under SQLite on the same build**, and
   `/zakat/new` (which renders without prisma at render) works under Postgres.
4. Ruled out (investigated via compiled-chunk forensics + instrumentation):
   - webpack async-module wrappers (present in ALL repo chunks, working pages included)
   - `server-only` guards (stripped them → crash persisted → NOT the cause)
   - zakat barrel / import graph (refactored to repository — crash persisted)
   - TLS/connection (verified OK)
   - race conditions (5/5 deterministic 500)
5. **Actual root cause:** instrumented the compiled db module — it evaluates fine and
   `o` (the client) is an object — the failing receiver was `prisma.zakatValuation`
   itself → the generated **Postgres client was stale** (0 ZakatValuation refs vs 4 in
   sqlite). The zakat module was added to the schema AFTER the postgres client was last
   generated.
6. Fix: `npm run db:build:schemas` + `db:generate:postgres` + `db:generate:sqlite` ✅
7. Debug artifacts to clean up (auto-overwritten on next build): console.error
   instrumentation patched into `.next/server/chunks/{8392,1775}.js`.

---

## 4. Remaining Steps (in order)

1. **Create + apply the zakat migration on Supabase.** Last attempt failed:
   `prisma migrate diff --from-config-datasource --to-schema ... --script --output ...`
   returned **P1001 (can't reach DB)** on the retry — likely transient pooler hiccup;
   the exact same URL worked minutes earlier for `migrate deploy`. Retry:
   ```powershell
   $env:DB_PROVIDER='postgres'
   $env:POSTGRES_DATABASE_URL='postgresql://postgres.uftoikpodkgrhehdxckk:ZwZi6gzqaufzOKyZ@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require'
   npx prisma migrate diff --from-config-datasource --to-schema prisma/.generated/postgres/schema.prisma --script --output prisma/migrations-postgres/20261113150000_add_zakat_module/migration.sql
   npx prisma migrate deploy
   ```
   Expected: 3 `CREATE TABLE "zakat…"` statements. Fallback if `migrate dev`-style shadow
   DB is needed: `npx prisma migrate dev --name add_zakat_module`.
2. **Re-add the 8 `server-only` guard imports** (restore committed state):
   `src/server/db/index.ts`, `src/lib/prisma.ts`, `src/lib/zakat/{calculations,
   customer-funds-history,inventory-history,receivables-history,supplier-advances-history,
   treasury-history}.ts` — `import "server-only";` before the other imports.
3. **Rebuild + verify locally** (postgres env):
   ```powershell
   npm run build
   npx next start   # then check: / /zakat /zakat/new /products /sales /cash /settings
   ```
   `/zakat` must now return 200 against Supabase (empty dashboard — no data).
4. **Run zakat tests**: `test:zakat`, `test:zakat-phase3`, `test:daily-journal`.
5. **Commit** everything on `deploy/vercel-supabase`.
6. **Redeploy to Vercel**:
   ```powershell
   npx --yes vercel@latest deploy --prod --yes --token <VERCEL_TOKEN>
   ```
7. **Post-deploy smoke test**: `/zakat` 200, `/settings` shows provider PostgreSQL,
   create a test product/sale to verify writes hit Supabase.
8. **Security cleanup (recommended):** rotate/revoke the Supabase access token
   (`sbp_…`) and Vercel token (`vcp_…`) — both were pasted in chat.

---

## 5. Architecture invariants (unchanged)

- **DAL abstraction stays Prisma-based** — `src/server/db` (singleton + driver adapters,
  `DB_PROVIDER` toggle), 13 repositories (+ new `zakat.repository.ts`), services.
  No Supabase SDK in actions; actions orchestrate via repositories only.
- zakat actions still expose `options?: { db?: PrismaClient }` (used by test:zakat-phase3).
- Build = `next build --webpack` (Vercel runs `npm run build` as-is).
