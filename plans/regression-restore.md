# Regression Restore — 3 Business Rules Changed by `9c45f6b`

> **Status: PENDING** — decision taken: **restore the documented (pre-`9c45f6b`) contracts**.
> This file cites exactly what changed and what must be reset. Do not re-implement policy; revert to baseline behavior.

## 1. Context — forensic conclusion

- The DB-layer refactor (`4c0290b` Phase 0 → `4580b50` Phase 8) introduced **zero business-logic regression**:
  - `prisma/schema.prisma` is byte-identical to the pre-refactor baseline (only a trailing blank line).
  - Per-phase gate = `npm run test:all` → 22 suites green on SQLite (`plans/db-migration/progress.md:61`).
- The regressions come from **one post-refactor commit**: `9c45f6b` — *"feat: implement server actions for products, purchases, and suppliers modules"* (2026-11-11), merged into this branch via `4ae5bd7`.
- It changed **3 business policies code-only**, without updating the aligned tests or the docs.
- The aligned tests (updated at Phase 0 to match the then-current contracts) are now the alarm:
  - `test:stock` 17/18 — Test 14 fails
  - `test:purchases` 16/19 — Tests 12, 13, 14 fail
- Business-flow reference doc (per owner): **`docs/USER_GUIDE.md`** (secondary: `docs/MODULES_REFERENCE.md`).

## 2. The 3 changed rules (citations)

### Rule 1 — Deleting a product that has history: archive (soft-delete) → hard block

- **File:** `src/app/products/actions.ts` — `deleteProductAction` (current: lines ~307–344).
- **Before (`9c45f6b^`, the contract to restore):** when the product has historical transactions
  (`movements`, `saleItems`, `purchaseItems`, `purchaseReceiptItems` counts > 0),
  the product is **archived** (`isActive: false`), stock rows are preserved for inventory audit, and the action returns
  `success: true` with `data: { action: "archived", totalStock }` and a message containing "archivé…".
- **After (`9c45f6b`, current code):** condition widened to include `totalStock > 0`, and the action **refuses** deletion
  (`success: false`, error *"Impossible de supprimer définitivement le meuble … veuillez plutôt le désactiver."*).
- **Victim test:** `tests/stock-integrity.test.ts` TEST 14 — asserts `resDel.data.action === "archived"`.
- **Restore note:** the original trigger did **not** include `totalStock` — a product with stock but no transactions
  was still archived, not blocked. Re-port the exact pre-`9c45f6b` branch (keep the current refactor-era
  `deleteProductWithStockTx` repository call for the no-history path).

### Rule 2 — Overpayment on a specific supplier invoice: excess becomes crédit fournisseur → hard reject

- **File:** `src/app/purchases/actions.ts` — `recordSupplierPaymentAction`, reject block at **lines 1070–1075**:
  ```ts
  if (amount > remainingBalance) {
    return { success: false, error: "… Les trop-perçus ne sont pas autorisés." };
  }
  ```
  (added by `9c45f6b` inside `if (purchaseId)`).
- **Before:** any excess over the invoice balance was accepted and annotated as supplier credit —
  the credit-note logic still exists at lines **1097–1119** (`Crédit fournisseur : … le fournisseur nous doit ce montant`).
- **Current state is half-dead:** the reject fires first, so the credit path is unreachable for invoice-targeted
  payments; it only survives for advance payments (no `purchaseId`). Restoring = delete the reject block →
  the credit path reactivates and behavior becomes consistent again (credit everywhere, as at baseline).
- **Victim tests:** `tests/purchases-integrity.test.ts`
  - TEST 12 — overpayment accepted as crédit fournisseur
  - TEST 13 — payment on an already-settled invoice → integral supplier credit
  - TEST 14 — supplier reconciliation (cascades from 12/13: expected payments never landed)

### Rule 3 — Multi-account supplier payment: overage credited → hard reject (credit logic removed)

- **File:** `src/app/suppliers/actions.ts` — `recordSupplierPaymentMultiAccountAction` (current: ~lines 653–714).
- **Before:** computed `excessOverDebt` / `excessOverInvoice` and appended an explicit credit note to the payment notes
  (`[Crédit fournisseur : …]` / `[Excédent facture : …]`).
- **After (`9c45f6b`):** throws on any overage (debt or invoice), `creditNote` construction removed,
  `finalNotes = baseNote`.
- **Contract:** same as Rule 2 — restore the excess/creditNote block from the `9c45f6b` diff (removed lines).

## 3. What to KEEP from `9c45f6b`

- `tests/supplier-accounts-ledger.test.ts` additions (+102 lines): pure test infrastructure
  (test-DB init via official migrations). **Zero policy assertions** — keep as-is. The suite passes.

## 4. Restore checklist

1. `src/app/products/actions.ts` — re-add the archive branch in `deleteProductAction`
   (source of truth: `git show 9c45f6b^:src/app/products/actions.ts`, keep current repo-call structure).
2. `src/app/purchases/actions.ts` — delete the reject block (lines 1070–1075).
3. `src/app/suppliers/actions.ts` — restore the excess/creditNote logic in `recordSupplierPaymentMultiAccountAction`
   (source of truth: `git show 9c45f6b -- src/app/suppliers/actions.ts` — the removed lines).
4. Re-run: `npm run test:stock` → expect **18/18**; `npm run test:purchases` → expect **19/19**.
5. Full `npm run test:all` → reconcile against the Phase 0 baseline table (`plans/db-migration/baseline.md`):
   baseline 22 suites; suite-count deltas to explain: `supplier-ledger` added post-baseline,
   `zakat` suites added then removed (net absent). All suites must be green.
6. Cross-check restored behavior against `docs/USER_GUIDE.md` flows (daily operations, supplier payments).
7. Smoke both providers: SQLite local + Postgres (transaction pooler 6543).
8. Write findings to `debug/regression-check.md`; commit on `deploy/vercel-supabase`.
9. **Redeploy to Vercel** — production (`grari-meuble.vercel.app`) is currently running the regressed behavior.

## 5. Evidence commands

```powershell
git show 9c45f6b -- src/app/products/actions.ts          # Rule 1 diff (removed archive branch)
git show 9c45f6b -- src/app/purchases/actions.ts         # Rule 2 diff (+6 lines reject)
git show 9c45f6b -- src/app/suppliers/actions.ts         # Rule 3 diff (credit logic removed)
git show 9c45f6b^:src/app/products/actions.ts            # pre-change deleteProductAction
git diff 4c0290b HEAD -- prisma/schema.prisma            # ≈ empty → schema unchanged
```
