# Baseline — Phase 0 (Safety Net)

Date: 2026-11-11
Branch: `refactor/db-repository-seam`
Environment: Windows, Node v24.18.0, npm 11.1.0, Prisma 7.10.1, Next 16.2.2

## Result: GREEN — 22 suites, 205 checks

`npm run test:all` passes end-to-end. Suites and counts:

| Suite | Script | Result |
|---|---|---|
| Stock & Inventaire | test:stock | 18/18 |
| Clients & Ventes | test:sales | 14/14 |
| Achats & Fournisseurs | test:purchases | 19/19 |
| Caisse & Trésorerie | test:cash | 14/14 |
| Paramètres, Sauvegarde & Sécurité | test:settings | 13/13 |
| Documents & Archives | test:documents | 7/7 |
| Rapports & Analyses | test:reports | 7/7 |
| Frais de livraison | test:sales-delivery-fees | 10/10 |
| Création client depuis vente | test:new-customer | 6/6 |
| Family-first stock | test:family-stock | 6/6 |
| Stock KPIs & filtering | test:stock-kpi | PASS |
| Acomptes ventes | test:sales-deposit | 7/7 |
| Paiements hors session | test:cash-out-of-session | 8/8 |
| Calculs ventes | test:sales-calculations | 6/6 |
| Trésorerie multi-comptes | test:treasury | 9/9 |
| Clôture éditable & audit | test:closing-audit | 6/6 |
| Épargne & Avoirs | test:savings | 11/11 |
| Versement supplémentaire fournisseur | test:supplier-additional-payment | 7/7 |
| Imputation sur dette fournisseur | test:supplier-additional-payment-allocation | 15/15 |
| Master features A–H | test:master-features | 6/6 |
| Journal journalier de caisse | test:daily-journal | 11/11 |
| Unification trésorerie | test:treasury-unification | 14/14 |

## Baseline corrections applied (stale tests aligned to current business behavior)

1. **`tests/stock-integrity.test.ts` test 14** — expected `deleteProductAction` to *block* deletion of a
   product with history; the code (since commit `f7416d6`) intentionally *archives* (soft-delete,
   `success: true`, `data.action === "archived"`). Test updated to assert the archive contract.
   Test 16 gained a guard: only toggle the product inactive if it is still active (it is already
   inactive after test 14's archive).
2. **`tests/purchases-integrity.test.ts` tests 12–14** — expected `recordSupplierPaymentAction` to
   *reject* overpayments ("dépasse le solde restant"); commit `232ea15` intentionally redesigned
   overpayment as supplier credit ("Crédit fournisseur"). Tests updated: excess payment accepted
   with credit note in `notes`, `paidAmount` accumulates (350,000 then 582,500), supplier
   reconciliation asserts `totalPaid = 582500`, `outstandingBalance = 0`.

## test:all membership changes

- Added scripts: `test:supplier-additional-payment`, `test:supplier-additional-payment-allocation`,
  `test:master-features` (were unwired), and appended existing `test:daily-journal`,
  `test:treasury-unification` to the chain.
- **Removed `test:supplier-ledger` from the chain** (script kept). Reason: it is a live-data audit —
  PARTIE 1 hardcodes production values from `prisma/shop.db` (Tayeb Gidoum debt 1 204 500 DA) and
  PARTIE 2 writes test suppliers into the production database. It cannot pass on a machine without
  the real DB (here `prisma/shop.db` is 0 bytes / gitignored) and must never run in CI.

## Environment notes

- Dependencies were installed fresh (`npm install`); lockfile gained `@emnapi/runtime@1.11.3`
  (registry sync fix, no version drift of prisma/next/etc).
- Node prints a `MODULE_TYPELESS_PACKAGE_JSON` warning for the 3 strip-types suites; harmless,
  pre-existing (adding `"type": "module"` to package.json would silence it but is out of scope).
- `Erreur ...` lines inside suites are expected negative-path logs, not failures.
