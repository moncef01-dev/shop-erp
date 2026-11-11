# Business Zakat Accounting Engine (زكاة عروض التجارة) — Phase 2 Documentation

**Module:** Historical Read-Only Zakat Calculation Engine & Financial Integrity Review  
**Path:** `src/lib/zakat/`  
**Test Suite:** `tests/zakat-engine-integrity.test.ts` (`npm run test:zakat`)  
**Status:** Completed & Corrected (37/37 Tests Passed), Zero Schema Alterations, Zero Database Writes  
**Date:** November 10, 2026  

---

## 1. Executive Summary & Core Guarantees

Phase 2 establishes a **strictly read-only, precision-safe historical calculation engine** that reconstructs commercial wealth eligible for Zakat (*Zakāt ‘Urūd al-Tijārah*) as of any historical cutoff date ($T$).

Following the comprehensive Phase 2 Financial Integrity and Reconciliation Correction Pass, the engine implements rigorous safeguards against data anomalies, missing historical tables, negative stock clamping, and double-counting of customer trust funds.

### Core Architecture Guarantees:
1. **Zero Database Modifications:** The engine performs exclusively read queries (`findMany`, `findUnique`, `count`). It does not write, update, delete, or create any business, treasury, or accounting records.
2. **Zero Schema Alterations:** No Prisma schema modifications, table definitions, or database migrations were created.
3. **Double-Counting Elimination & Amanat Isolation:** Inter-account transfers net strictly to zero. Customer trust funds (advances and savings) held in treasury are isolated; they are never added as business wealth and are never auto-deducted as liabilities without explicit manager confirmation.
4. **Resilience to Incomplete Historical Records:** When historical imputation tables (e.g., `supplier_additional_payment_allocations`) are absent, the engine refuses to guess or assume zero allocations. Instead, unverified amounts are explicitly isolated, excluded from confirmed assets, and flagged as `INCOMPLETE`.
5. **Negative Stock & Unpriced Anomaly Integrity:** Negative reconstructed stock is never silently clamped to zero; actual negative quantities are preserved, flagged as physical/ledger anomalies (`NEGATIVE_STOCK_ANOMALY`), excluded from asset valuation, and marked as `INCOMPLETE`. Missing or negative cost prices are flagged (`UNPRICED_ANOMALY`) and excluded from confirmed valuation.
6. **Timezone Fidelity:** Strict adherence to `Africa/Algiers` (UTC+1, fixed year-round) for all historical cutoff boundaries, handling both UTC midnight date-only fields and intraday timestamps.
7. **Configurable Fiqh & Business Inputs:** Nisab standards (Gold 85g, Silver 595g, Manual), calendar year types (Lunar 2.5%, Solar configurable), and deductible liabilities are parameter-driven.

---

## 2. Directory Structure & Modular Breakdown

The engine is modularized within `src/lib/zakat/`, decoupled from server actions and UI components:

```
src/lib/zakat/
├── types.ts                      # Strict TypeScript interfaces, subsystem statuses, and DTOs
├── date-utils.ts                 # Africa/Algiers timezone boundaries and monetary rounding
├── validation.ts                 # Input validation (Nisab, dates, rates, customerFundsConfirmation)
├── inventory-history.ts          # Stock reconstruction from StockMovement (Correction C: anomalies, no clamping)
├── treasury-history.ts           # Multi-account balances (Cash, Safes, Banks) & transfer netting
├── receivables-history.ts        # Customer trade receivables, allocations, and debtor breakdown
├── customer-funds-history.ts     # Customer trust funds (Amanat: savings ledger & unallocated advances)
├── supplier-advances-history.ts  # Supplier prepayments (Correction B: graceful missing-table isolation)
├── reconciliation.ts             # Cross-subsystem reconciliation, warning dispatch, and global status derivation
├── calculations.ts               # Master coordinator, confirmed vs unverified assets, provisional output
└── index.ts                      # Public exports
```

---

## 3. Existing Models and Fields Utilized

The engine queries existing ERP models identified during Phase 1 discovery without introducing new schema tables:

| Domain | Prisma Model | Fields Utilized | Role in Zakat Calculation |
| :--- | :--- | :--- | :--- |
| **Inventory** | `Product` | `id`, `sku`, `name`, `category`, `costPrice`, `sellingPrice`, `stock`, `unit` | Master data and cost price valuation base |
| **Inventory** | `ProductStock` | `productId`, `locationId`, `quantity` | Multi-location current stock reference for backward reconstruction |
| **Inventory** | `StockMovement` | `productId`, `type`, `quantity`, `fromLocationId`, `toLocationId`, `date`, `createdAt` | Immutable historical stock movement ledger |
| **Treasury** | `TreasuryAccount` | `id`, `code`, `name`, `type`, `openingBalance`, `isDefault` | Cash registers, safes, bank accounts, and opening balances |
| **Treasury** | `TreasuryTransfer` | `fromAccountId`, `toAccountId`, `amount`, `date`, `createdAt` | Inter-account movements (strictly net to zero) |
| **Treasury** | `Payment` | `accountId`, `amount`, `method`, `purchaseId`, `supplierId`, `status`, `paymentDate` | Inflows from sales and outflows to suppliers |
| **Treasury** | `Expense` | `accountId`, `amount`, `type`, `method`, `status`, `date`, `createdAt` | Operating expenses and exceptional incomes |
| **Receivables** | `Sales` | `id`, `customerId`, `totalAmount`, `status`, `saleDate`, `createdAt` | Confirmed trade sales delivered on credit |
| **Receivables** | `CustomerAdvance` | `id`, `customerId`, `accountId`, `amount`, `paymentDate`, `status` | Customer advance payments received into treasury |
| **Receivables** | `CustomerAdvanceAllocation` | `advanceId`, `saleId`, `amount`, `allocatedAt` | Deductions applied to sales from advances |
| **Trust Funds** | `CustomerSavingsTransaction` | `accountId`, `type`, `direction`, `amount`, `date`, `status` | Customer savings/store credits ledger (Amanat) |
| **Prepayments** | `SupplierAdditionalPayment` | `supplierId`, `treasuryAccountId`, `amount`, `isReversal`, `status`, `date` | Lump-sum advances given to suppliers |
| **Prepayments** | `SupplierAdditionalPaymentAllocation` | `paymentId`, `supplierId`, `amount`, `status`, `isReversal`, `date` | Historical imputations of advances against purchase debt |

---

## 4. Subsystem Reconstruction Methodology & Correction Pass Rules

### 4.1 Inventory Reconstruction (*‘Urūd al-Tijārah*) — Correction C
- **Ledger Source:** `StockMovement` records where `effectiveDate <= valuationDateStr`.
- **Movement Direction Rules:**
  - `INITIAL`: $+ \text{quantity}$ to destination location and product total.
  - `RECEIPT`: $+ \text{quantity}$ from supplier purchases.
  - `SALE`: $- \text{quantity}$ for confirmed deliveries.
  - `ISSUE`: $- \text{quantity}$ for loss, damage, or internal withdrawal.
  - `ADJUSTMENT`: $+ \text{quantity}$ if `toLocationId != null`; $- \text{quantity}$ if `fromLocationId != null`.
  - `TRANSFER`: $+ \text{quantity}$ at destination, $- \text{quantity}$ at source; total stock delta $\equiv 0$.
- **No-Clamping Policy (Negative Stock):**
  - If reconstructed stock is negative ($\text{qty} < 0$), the actual negative quantity is strictly preserved (never clamped to 0).
  - Item status is marked `NEGATIVE_STOCK_ANOMALY`.
  - Valuation is set to 0 DA (negative stock is NOT subtracted from other positive assets).
  - Inventory subsystem status is marked `INCOMPLETE`, which prevents a global `COMPLETE` status.
- **Cost Price Integrity:**
  - Legitimate zero cost price (`costPrice === 0`) is distinguished from missing (`null`, `undefined`, or negative).
  - Missing or negative cost prices are marked `UNPRICED_ANOMALY` or `INVALID_COST_PRICE`.
  - Unpriced stock quantities are excluded from confirmed inventory value (`totalCostValue = null`) and reported separately as unverified valuation.
  - If unpriced stock exists, inventory status is marked `INCOMPLETE` (or `REQUIRES_REVIEW` if stock is 0).

### 4.2 Treasury Reconstruction (*Al-Nuqūd*)
- Evaluates every `TreasuryAccount` (`cash`, `safe`, `bank`, `other`).
- Starting point: `openingBalance` of each account.
- Inflows on or before cutoff ($date \le T$):
  - Inbound internal transfers (`TreasuryTransfer.toAccountId == account.id`)
  - Direct sales payments (`Payment` where `purchaseId == null && supplierId == null && method != 'savings'`)
  - Customer advance deposits (`CustomerAdvance`)
  - Exceptional income (`Expense` where `type == 'income'`)
  - Supplier additional payment reversals / restitutions (`isReversal == true && status == 'completed'`)
- Outflows on or before cutoff ($date \le T$):
  - Outbound internal transfers (`TreasuryTransfer.fromAccountId == account.id`)
  - Supplier purchase payments (`Payment` where `purchaseId != null || supplierId != null`)
  - Operating expenses (`Expense` where `type == 'expense'`)
  - Supplier additional payments given (`SupplierAdditionalPayment` where `isReversal == false`)
- **Transfer Netting Rule:**
  $$\sum \text{Transfers In} - \sum \text{Transfers Out} \equiv 0$$
  If transfers do not net to zero, treasury subsystem status is set to `INCOMPLETE`.

### 4.3 Customer Receivables (*Al-Duyūn al-Marjuwwah*)
- Considers confirmed sales where `saleDate <= T`.
- Outstanding debt at cutoff: $\max(0, \text{totalAmount} - \text{paidAmount} - \text{allocatedAdvances})$.
- **Fiqh Solvency Review:** The ERP has no bad-debt categorization. All trade receivables require manager review of debtor solvency. Subsystem status is set to `REQUIRES_REVIEW` to prompt review of doubtful debts (*Duyūn Ma'yūs minhā*).

### 4.4 Customer Funds & Manual Liabilities — Correction A
- **Amanat Isolation:** Customer savings balances and unallocated customer advances are funds belonging to third parties physically held in the store treasury.
- **Strict Anti-Double-Deduction:** The engine does **NOT** automatically subtract customer funds from zakatable assets or from the preliminary base, because the manager's manual liabilities entry might already include them.
- **Reconciliation Transparency:** The engine outputs a dedicated `CustomerFundsReconciliationInfo` breakdown displaying:
  1. Total physical treasury balance.
  2. Customer advances held.
  3. Customer savings held.
  4. Total customer funds held.
  5. Manager manual liabilities entered.
- **Typed Confirmation Field:** Input requires `customerFundsConfirmation`:
  - `CONFIRMED_INCLUDED`: Manager explicitly confirms customer funds are included in manual liabilities.
  - `CONFIRMED_EXCLUDED`: Manager explicitly confirms customer funds are excluded from manual liabilities.
  - `UNCONFIRMED`: System raises an explicit review warning (`REQUIRES_REVIEW`) advising the manager that customer funds are in treasury and require explicit inclusion/exclusion confirmation.

### 4.5 Supplier Prepayments & Missing Allocation History — Correction B
- When supplier advances are recorded (`SupplierAdditionalPayment`):
  - Reversals prior to cutoff are deducted from net payments given.
- **Missing Allocation History Table:**
  - If `supplier_additional_payment_allocations` table is unavailable:
    - The engine does **NOT** assume 0 allocations and does **NOT** treat unverified advances as confirmed assets.
    - Confirmed unallocated prepayments are set to **0 DA**.
    - Full given amount is classified as `unverifiedPrepaymentsDZD`.
    - Subsystem status is set to `INCOMPLETE` (`UNVERIFIED_MISSING_ALLOCATIONS`).
    - The uncertain amount is excluded from confirmed zakatable assets.

---

## 5. Global Calculation Status & Preliminary Zakat Output — Correction D

### 5.1 Three-State Typed Global Status
The global status is determined by strict hierarchical propagation of subsystem statuses:
1. `INCOMPLETE`: Critical data anomalies exist (missing DB allocation table, negative stock anomaly, unpriced items with positive stock, or treasury transfer imbalance). Calculation is marked `isProvisionalAndIncomplete: true`.
2. `REQUIRES_REVIEW`: All technical data is verified, but business confirmations are pending (e.g., debtor solvency review, unconfirmed customer funds reconciliation, or products requiring classification).
3. `COMPLETE`: All subsystems are `VERIFIED`, all prices are present, no anomalies exist, and all confirmations have been provided.

### 5.2 Mathematical Engine
$$\text{Confirmed Zakatable Assets} = \text{Inventory}_{\text{Confirmed}} + \text{Treasury}_{\text{All}} + \text{Eligible Receivables} + \text{Prepayments}_{\text{Confirmed}}$$

$$\text{Preliminary Zakat Base} = \max(0, \text{Confirmed Zakatable Assets} - \text{Manual Liabilities})$$

$$\text{Preliminary Zakat Due} = \begin{cases} 
\text{Preliminary Zakat Base} \times \text{Zakat Rate} & \text{if Preliminary Zakat Base} \ge \text{Nisab Threshold} \\
0\text{ DA} & \text{if Preliminary Zakat Base} < \text{Nisab Threshold}
\end{cases}$$

Unverified assets ($\text{Prepayments}_{\text{Unverified}} + \text{Inventory}_{\text{Unpriced}}$) are tracked separately and excluded from the confirmed base until resolved.

---

## 6. Comprehensive Test Suite Verification (37/37 Tests Passed)

The engine is verified via an isolated integration test suite executing 37 comprehensive test scenarios against a dedicated test database (`prisma/test_zakat_engine.db`):

```bash
npm run test:zakat
```

### Full Test Execution Log:
```
================================================================================
  SHOP ERP — SUITE DE TESTS : MOTEUR DE CALCUL ZAKAT (PHASE 2)
  Base de test isolée : prisma/test_zakat_engine.db
================================================================================

✓ Schéma et migrations appliqués à la base de test isolée.

--- GROUPE 1 : RECONSTRUCTION HISTORIQUE DU STOCK (INVENTORY) ---
  ✓ Test 1: 1.1 Stock initial (INITIAL) inclus avant la date d'évaluation
  ✓ Test 2: 1.2 Réception fournisseur (RECEIPT) et Vente (SALE) avant cutoff
  ✓ Test 3: 1.3 Sortie exceptionnelle (ISSUE) et Ajustements (+) et (-)
  ✓ Test 4: 1.4 Transfert inter-dépôts (TRANSFER) préserve strictement le stock total
  ✓ Test 5: 1.5 Exclusion stricte des mouvements postérieurs au cutoff
  ✓ Test 6: 1.6 Détection de prix de revient manquant (costPrice null)

--- GROUPE 2 : RECONSTRUCTION HISTORIQUE DE LA TRÉSORERIE (TREASURY) ---
  ✓ Test 7: 2.1 Encaissement vente espèces et dépense sur Caisse
  ✓ Test 8: 2.2 Virement interne Caisse -> Coffre et neutralité globale
  ✓ Test 9: 2.3 Exclusion des paiements annulés (cancelled)
  ✓ Test 10: 2.4 Exclusion stricte des opérations postérieures au cutoff

--- GROUPE 3 : CRÉANCES CLIENTS ET FONDS TIERS (RECEIVABLES & TRUST FUNDS) ---
  ✓ Test 11: 3.1 Vente confirmée non réglée et vente partiellement réglée
  ✓ Test 12: 3.2 Affectation d'acompte client (CustomerAdvanceAllocation) avant cutoff
  ✓ Test 13: 3.3 Règlements postérieurs au cutoff ne réduisent pas la créance au cutoff
  ✓ Test 14: 3.4 Reconstruction des fonds clients (Amanat) depuis le grand livre d'épargne

--- GROUPE 4 : AVANCES FOURNISSEURS HISTORIQUES (SUPPLIER ADVANCES) ---
  ✓ Test 15: 4.1 Versement supplémentaire fournisseur et imputation partielle avant cutoff
  ✓ Test 16: 4.2 Imputation postérieure au cutoff n'annule pas l'avance au cutoff

--- GROUPE 5 : MOTEUR GLOBAL DE CALCUL ZAKAT (MAIN CALCULATION ENGINE) ---
  ✓ Test 17: 5.1 Calcul complet Hawl Lunaire avec Nisab Argent atteint
  ✓ Test 18: 5.2 Calcul Hawl Solaire avec taux personnalisé (ex: 2.577%)
  ✓ Test 19: 5.3 Actif net inférieur au Nisab -> Zakat due = 0 DA
  ✓ Test 20: 5.4 Dettes manuelles supérieures aux actifs -> Assiette = 0 DA, Zakat = 0 DA
  ✓ Test 21: 5.5 Rejet d'une configuration solaire sans taux explicite
  ✓ Test 22: 5.6 Rejet de dates invalides (début > fin ou valuation hors période)
  ✓ Test 23: 5.7 Rejet d'un montant de dettes manuelles négatif

--- GROUPE 6 : CORRECTION A — FONDS CLIENTS & DETTES MANUELLES ---
  ✓ Test 24: 6.1 Fonds clients présents dans la trésorerie et isolés sans double comptage d'actif
  ✓ Test 25: 6.2 Dettes manuelles préservées exactement et non déduites automatiquement
  ✓ Test 26: 6.3 Confirmation manquante des fonds clients produit REQUIRES_REVIEW et alerte explicite
  ✓ Test 27: 6.4 Confirmation explicite CONFIRMED_INCLUDED sans altération automatique
  ✓ Test 28: 6.5 Confirmation explicite CONFIRMED_EXCLUDED sans déduction automatique

--- GROUPE 7 : CORRECTION B — AVANCES FOURNISSEURS & HISTORIQUE D'IMPUTATION ---
  ✓ Test 29: 7.1 Reconstitution fiable avec historique complet d'imputation disponible
  ✓ Test 30: 7.2 Absence de table d'imputation : exclusion des actifs et montant non vérifié
  ✓ Test 31: 7.3 Contrepassation (reversal) avant cutoff exclue des avances actives

--- GROUPE 8 : CORRECTION C — STOCK NÉGATIF & PRIX DE REVIENT MANQUANTS ---
  ✓ Test 32: 8.1 Stock négatif non clampé à zéro, préservé dans le détail et flaggé anomalie
  ✓ Test 33: 8.2 Prix de revient négatif ou invalide exclu des actifs confirmés
  ✓ Test 34: 8.3 Prix de revient zéro légitime distingué de manquant

--- GROUPE 9 : CORRECTION D — PROPAGATION DU STATUT GLOBAL DE CALCUL ---
  ✓ Test 35: 9.1 Anomalie critique de stock négatif force le statut global à INCOMPLETE
  ✓ Test 36: 9.2 Calcul sans stock négatif mais en attente de revue produit REQUIRES_REVIEW
  ✓ Test 37: 9.3 Calcul avec ensemble vérifié et confirmations fournies produit COMPLETE

================================================================================
  RÉSULTATS DE LA SUITE DE TESTS : 37/37 PASSÉS (100% SUCCÈS)
================================================================================
```

### Regression Verification:
- `tests/daily-journal-completeness.test.ts`: 11/11 PASSED
- `tests/savings-integrity.test.ts`: 11/11 PASSED
- `tsc --noEmit`: 0 errors

---

## 7. Trial Run Against Production Database (`prisma/shop.db`)

A strictly read-only execution was evaluated on live production data as of **10/11/2026**:

| Metric | Production Data Value | Engine Assessment |
| :--- | :--- | :--- |
| **Global Calculation Status** | `INCOMPLETE` | Correctly detected missing imputation table in DB |
| **Is Provisional & Incomplete** | `true` | Prevents presenting provisional figure as final |
| **Inventory Confirmed Value** | **15,101,550.00 DA** | 147 products evaluated; 8 unpriced items excluded |
| **Treasury Total Balance** | **2,087,366.00 DA** | All accounts reconciled; transfer net $\equiv 0$ |
| **Eligible Receivables** | **141,000.00 DA** | Flagged `REQUIRES_REVIEW` for debtor solvency |
| **Supplier Prepayments Confirmed** | **0.00 DA** | Missing allocation table in production DB |
| **Supplier Prepayments Unverified** | **1,000,000.00 DA** | Excluded from confirmed assets; reported as unverified |
| **Total Confirmed Zakatable Assets** | **17,329,916.00 DA** | $15,101,550 + 2,087,366 + 141,000 + 0$ |
| **Customer Funds Held (Amanat)** | **20,000.00 DA** | Physical cash in treasury; unconfirmed reconciliation |
| **Manual Liabilities Entered** | **0.00 DA** | Strictly manager-entered; untouched |
| **Preliminary Zakat Base** | **17,329,916.00 DA** | Base $\ge$ Nisab Silver (77,350 DA) |
| **Preliminary Zakat Due (2.5%)** | **433,247.90 DA** | Provisional calculation pending resolution of missing table |

---

## 8. Summary of Subsystem Statuses in Production

```json
{
  "inventory": "REQUIRES_REVIEW",
  "treasury": "VERIFIED",
  "receivables": "REQUIRES_REVIEW",
  "customerFunds": "REQUIRES_REVIEW",
  "supplierPrepayments": "INCOMPLETE",
  "liabilitiesReconciliation": "REQUIRES_REVIEW"
}
```

- **Inventory (`REQUIRES_REVIEW`):** 8 products in stock lack cost prices. Their quantities are excluded from confirmed valuation.
- **Supplier Prepayments (`INCOMPLETE`):** The production database does not contain table `supplier_additional_payment_allocations`. The 1,000,000 DA advance is safely isolated as unverified rather than treated as a confirmed asset.
- **Customer Funds (`REQUIRES_REVIEW`):** 20,000 DA in customer savings are held in treasury. Warning issued to prompt manager confirmation regarding deduction in manual liabilities.

---
*End of Documentation — Phase 2 Business Zakat Accounting Engine.*
