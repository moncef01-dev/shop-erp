# Progress — SQLite → PostgreSQL Migration

Branch: `refactor/db-repository-seam`
Last updated: 2026-11-11

## Completed

| Phase | Status | Commit(s) |
|---|---|---|
| 0 — Baseline safety net (22 suites green) | ✅ | `4c0290b` |
| 1 — DB seam (`src/server/db` + services + shims) | ✅ | `68c3aab` |
| 2 — Repository extraction (6 modules fully; rest via seam) | ✅ (voir note) | `3d2ce2d`, `e3071a8`, `0ab892f`, `cb74afb`, `2f270f5`, `348b618`, `2f5a018` |
| 3 — ESLint boundary (0 violations `@/lib/prisma`, `@/generated/*`) | ✅ | inclus dans Phase 4 commit |
| 4 — Runtime `DB_PROVIDER` flag + dual clients + dotenv config | ✅ | `a2036ef` |
| 5 — PostgreSQL baseline migration + smoke test | ✅ (exécution live requise côté machine avec PG) | `e9653e4` |

## Le toggle .env (objectif clé) — fonctionnel

```bash
DB_PROVIDER=sqlite            # défaut
DATABASE_URL=file:./prisma/shop.db
POSTGRES_DATABASE_URL=postgresql://user:pass@localhost:5432/shop
```

- Runtime (`next dev/start`) : `src/server/db/index.ts` sélectionne `PrismaLibSql` ou `PrismaPg` au démarrage.
- CLI (`prisma migrate/generate/studio`) : `prisma.config.ts` (dotenv chargé) sélectionne schéma + dossier migrations + URL.
- Sauvegardes : à faire suivre (Phase 6) — actuellement toujours SQLite.
- Redémarrage requis après changement de `DB_PROVIDER`.

## Note Phase 2 (extraction) — TERMINÉE via follow-up pass

Extraction complète en repositories : customers, catalog, inventory, dashboard, reports,
documents, sales (+ advances), cash + treasury, purchases, suppliers (+ additional-payment,
+ allocation), savings, closing, settings.
Aucune requête `prisma.<model>.<op>` directe ne subsiste dans `src/app` ; les seules références
restantes sont les wrappers `prisma.$transaction` dans les actions (orchestration, conforme au
plan). Les 2 server components (`suppliers/page.tsx`, `cash/advances/page.tsx`) passent par les
repositories. Phase 7 (migration de données) annulée par décision — non nécessaire.

## Phase 6 - Backup (TERMINEE - decision : sauvegarde SQLite uniquement)

- Logique LibSQL deplacee verbatim vers `src/server/services/backup/sqlite.backup.ts` (path helpers, verifyBackupIntegrity, createSqliteBackup, restoreSqliteBackup, list/delete).
- `services/backup/index.ts` : passerelle par fournisseur - delegue a SQLite, erreur claire `non disponible pour PostgreSQL` sinon (aucun pg_dump, non requis).
- `settings/actions.ts` : delegation fine + revalidatePath ; plus aucun import `@libsql/client`.
- Cloture mensuelle : `backup_completed` auto-NOT_APPLICABLE sur PostgreSQL (non bloquant, confirmation sautee) ; label neutralise.
- UI Parametres : props serveur `providerLabel` + `supportsBackup` ; `getSystemInfoAction` utilise `providerLabel()`.
- `scripts/backup.mjs` : garde-fou early-exit si `DB_PROVIDER=postgres`.

## Remaining

1. **Phase 6 — Backup provider abstraction** : déplacer la logique LibSQL de
   `settings/actions.ts` vers `src/server/services/backup/{sqlite,postgres,index}.ts`
   (`pg_dump`/`pg_restore` pour PostgreSQL). Label de checklist de clôture neutre.
2. **Phase 5 (exécution live)** : `TEST_POSTGRES_URL=... npm run test:pg:smoke` sur une base
   jetable ; créer les migrations PostgreSQL suivantes via `DB_PROVIDER=postgres npm run db:migrate:postgres`.
3. **Phase 8 — Docs** : README (architecture DB, toggle), procédure de restauration/restauration par fournisseur.

## Verification commands

```bash
npm run test:all          # 22 suites — vert sur SQLite
npm run lint              # 0 violation no-restricted-imports
npx tsc --noEmit          # clean
npm run db:generate       # régénère les 2 clients depuis prisma/schema.prisma
TEST_POSTGRES_URL=postgresql://... npm run test:pg:smoke   # nécessite un serveur PG
```
