/**
 * Integration Test Suite: Draft Invoice Confirmation — No Stock Deduction
 *
 * Verifies business rule:
 * Every draft invoice (Brouillon) represents goods ordered directly for a customer
 * and not taken from shop inventory. Therefore, confirming a draft invoice must NEVER deduct stock.
 *
 * Runs against an isolated temporary SQLite database: prisma/test_draft_no_stock.db
 * Never touches real shop data (prisma/shop.db).
 *
 * Tests all 10 requirements:
 * 1. UI Confirmation button label is "Confirmer la vente" (not "Confirmer la vente et déduire le stock").
 * 2. Draft invoice status changes from "draft" to "confirmed" (and DEV- reference converts to FAC-).
 * 3. Product stock quantities remain exactly unchanged upon draft confirmation.
 * 4. No stock-out movement is created for the draft confirmation.
 * 5. Confirmation succeeds even when product has zero available stock (no stock sufficiency rejection).
 * 6. Customer debt and payment calculations remain accurate and consistent.
 * 7. Treasury balances remain unchanged by the confirmation itself (when no new payment is added).
 * 8. Invoice totals and sales reports remain correct and properly reflect confirmed sales.
 * 9. Repeated confirmation is rejected and does not duplicate financial or sales records.
 * 10. Ordinary sales workflows (createSaleAction with status "confirmed") retain original stock deduction behavior.
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_draft_no_stock.db");
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch {
  // Ignore lock
}

process.env.DATABASE_URL = `file:${testDbPath}`;

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("  TEST SUITE: DRAFT INVOICE CONFIRMATION — NO STOCK DEDUCTION");
  console.log("  Isolated test DB:", testDbPath);
  console.log("================================================================================\n");

  // 1. Appliquer les migrations
  const { createClient } = await import("@libsql/client");
  const ddlClient = createClient({ url: `file:${testDbPath}` });

  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const migrationFolders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  for (const folder of migrationFolders) {
    const migrationFile = path.join(migrationsDir, folder, "migration.sql");
    if (fs.existsSync(migrationFile)) {
      const sql = fs.readFileSync(migrationFile, "utf-8");
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const stmt of statements) {
        await ddlClient.execute(stmt);
      }
    }
  }
  console.log("✓ Schéma et migrations appliqués à la base de test isolée.\n");

  const { prisma } = await import("../src/lib/prisma");
  const salesActions = await import("../src/app/sales/actions");
  const customerActions = await import("../src/app/customers/actions");
  const reportActions = await import("../src/app/reports/actions");

  // Setup de base : Emplacement, Compte de trésorerie par défaut, Client
  const warehouse = await prisma.location.create({
    data: { name: "Dépôt Principal", code: "DEP-01", isDefault: true, isActive: true },
  });

  const defaultCash = await prisma.treasuryAccount.create({
    data: {
      name: "Caisse Magasin",
      code: "CS-MAG",
      type: "cash",
      openingBalance: 100000,
      isDefault: true,
      isActive: true,
    },
  });

  const customer = await prisma.customer.create({
    data: {
      name: "Sofiane Direct",
      phone: "0555001122",
      address: "Alger Centre",
      isActive: true,
    },
  });

  // Produit A avec stock = 10
  const prodA = await prisma.product.create({
    data: {
      name: "Table Salle à Manger Luxe",
      sku: "TAB-LUXE-01",
      costPrice: 40000,
      sellingPrice: 70000,
      stock: 10,
      minStock: 2,
      isActive: true,
    },
  });

  await prisma.productStock.create({
    data: {
      productId: prodA.id,
      locationId: warehouse.id,
      quantity: 10,
    },
  });

  // Produit Zero avec stock = 0
  const prodZero = await prisma.product.create({
    data: {
      name: "Buffet Spécial Sur Commande",
      sku: "BUF-SPEC-00",
      costPrice: 50000,
      sellingPrice: 90000,
      stock: 0,
      minStock: 1,
      isActive: true,
    },
  });

  await prisma.productStock.create({
    data: {
      productId: prodZero.id,
      locationId: warehouse.id,
      quantity: 0,
    },
  });

  // --------------------------------------------------------------------------
  // TEST 1: Vérification du libellé du bouton dans SalesClient.tsx
  // --------------------------------------------------------------------------
  try {
    const clientFileContent = fs.readFileSync(
      path.resolve(process.cwd(), "src", "app", "sales", "SalesClient.tsx"),
      "utf-8"
    );
    assert(
      !clientFileContent.includes("Confirmer la vente et déduire le stock"),
      "L'ancien libellé 'Confirmer la vente et déduire le stock' est encore présent dans SalesClient.tsx !"
    );
    assert(
      clientFileContent.includes('title="Confirmer la vente"'),
      "Le nouveau libellé title='Confirmer la vente' est introuvable dans SalesClient.tsx !"
    );

    results.push({ num: 1, name: "Libellé du bouton mis à jour à 'Confirmer la vente'", passed: true });
    console.log("✓ Test 1: Libellé du bouton mis à jour à 'Confirmer la vente' réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 1, name: "Libellé du bouton mis à jour à 'Confirmer la vente'", passed: false, error: msg });
    console.error("✗ Test 1 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 2 & 3 & 4: Confirmation d'un brouillon, changement de statut, DEV->FAC,
  // et préservation exacte du stock sans mouvement de sortie
  // --------------------------------------------------------------------------
  let draftSale1Id = 0;
  try {
    // Créer une vente brouillon de 3 unités de ProdA (Stock initial = 10)
    const draftRes = await salesActions.createSaleAction({
      customerId: customer.id,
      status: "draft",
      items: [{ productId: prodA.id, locationId: warehouse.id, quantity: 3, unitPrice: 70000 }],
      notes: "Commande client directe spéciale",
    });
    assert(draftRes.success, `Échec création brouillon: ${draftRes.error}`);
    const draftData = draftRes.data as { id: number; reference: string; status: string };
    draftSale1Id = draftData.id;
    assert(draftData.status === "draft", `Statut initial attendu 'draft', reçu: ${draftData.status}`);
    assert(draftData.reference.startsWith("DEV-"), `Préfixe attendu 'DEV-', reçu: ${draftData.reference}`);

    // Stock avant confirmation
    const stockBefore = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodA.id, locationId: warehouse.id } },
    });
    const prodBefore = await prisma.product.findUnique({ where: { id: prodA.id } });
    assert(stockBefore?.quantity === 10, "Stock d'origine altéré avant confirmation !");
    assert(prodBefore?.stock === 10, "Stock global altéré avant confirmation !");

    // Confirmer la vente brouillon
    const confirmRes = await salesActions.confirmDraftSaleAction(draftSale1Id);
    assert(confirmRes.success, `Échec confirmation brouillon: ${confirmRes.error}`);

    // Test 2: Statut passe à confirmed et référence devient FAC-
    const confirmedSale = await prisma.sales.findUnique({ where: { id: draftSale1Id } });
    assert(confirmedSale?.status === "confirmed", `Statut attendu 'confirmed', reçu: ${confirmedSale?.status}`);
    assert(Boolean(confirmedSale?.reference.startsWith("FAC-")), `Référence attendue 'FAC-...', reçu: ${confirmedSale?.reference}`);

    // Test 3: Stock de ProdA reste STRICTEMENT inchangé (10)
    const stockAfter = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodA.id, locationId: warehouse.id } },
    });
    const prodAfter = await prisma.product.findUnique({ where: { id: prodA.id } });
    assert(stockAfter?.quantity === 10, `Stock après confirmation doit rester 10, trouvé: ${stockAfter?.quantity}`);
    assert(prodAfter?.stock === 10, `Stock global après confirmation doit rester 10, trouvé: ${prodAfter?.stock}`);

    // Test 4: Aucun mouvement de stock créé
    const movements = await prisma.stockMovement.findMany({ where: { saleId: draftSale1Id } });
    assert(movements.length === 0, `0 mouvement de stock attendu pour confirmation brouillon, trouvé: ${movements.length}`);

    results.push({ num: 2, name: "Statut 'confirmed' et numérotation FAC- générée", passed: true });
    results.push({ num: 3, name: "Quantités de stock exactement inchangées", passed: true });
    results.push({ num: 4, name: "Aucun mouvement de sortie de stock créé", passed: true });
    console.log("✓ Tests 2, 3, 4: Statut confirmé, référence FAC-, stock préservé à 10, 0 mouvement de stock.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 2, name: "Statut et numérotation", passed: false, error: msg });
    results.push({ num: 3, name: "Préservation stock", passed: false, error: msg });
    results.push({ num: 4, name: "Absence de mouvement de stock", passed: false, error: msg });
    console.error("✗ Tests 2, 3, 4 échoués:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Confirmation réussit même quand le produit a un stock de 0
  // --------------------------------------------------------------------------
  try {
    const stockZeroCheck = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodZero.id, locationId: warehouse.id } },
    });
    assert(stockZeroCheck?.quantity === 0, "Pré-requis: stock doit être à 0");

    // Créer un devis de 5 unités du produit avec stock = 0
    const draftZeroRes = await salesActions.createSaleAction({
      customerId: customer.id,
      status: "draft",
      items: [{ productId: prodZero.id, locationId: warehouse.id, quantity: 5, unitPrice: 90000 }],
      notes: "Commande directe d'article en rupture de stock showroom",
    });
    assert(draftZeroRes.success, `Échec création devis stock zéro: ${draftZeroRes.error}`);
    const draftZeroId = (draftZeroRes.data as { id: number }).id;

    // Confirmer la vente brouillon
    const confirmZeroRes = await salesActions.confirmDraftSaleAction(draftZeroId);
    assert(
      confirmZeroRes.success,
      `La confirmation d'un brouillon avec stock = 0 aurait dû réussir mais a échoué: ${confirmZeroRes.error}`
    );

    const saleZeroConfirmed = await prisma.sales.findUnique({ where: { id: draftZeroId } });
    assert(saleZeroConfirmed?.status === "confirmed", "Statut attendu confirmed");

    // Vérifier que le stock reste à 0 et ne devient pas négatif (-5)
    const stockStillZero = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodZero.id, locationId: warehouse.id } },
    });
    const prodStillZero = await prisma.product.findUnique({ where: { id: prodZero.id } });
    assert(stockStillZero?.quantity === 0, `Stock doit rester à 0, trouvé: ${stockStillZero?.quantity}`);
    assert(prodStillZero?.stock === 0, `Stock global doit rester à 0, trouvé: ${prodStillZero?.stock}`);

    // Aucun mouvement de stock
    const movZero = await prisma.stockMovement.findMany({ where: { saleId: draftZeroId } });
    assert(movZero.length === 0, `Aucun mouvement de stock pour vente avec stock à 0, trouvé: ${movZero.length}`);

    results.push({ num: 5, name: "Confirmation réussie même avec stock égal à 0 (sans stock négatif)", passed: true });
    console.log("✓ Test 5: Confirmation réussie même avec stock = 0 sans solde négatif.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 5, name: "Confirmation réussie avec stock 0", passed: false, error: msg });
    console.error("✗ Test 5 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Calculs de dette client et de paiements exacts
  // --------------------------------------------------------------------------
  try {
    // Créer une vente brouillon de 100 000 DA avec acompte de 20 000 DA
    const draftPartRes = await salesActions.createSaleAction({
      customerId: customer.id,
      status: "draft",
      items: [{ productId: prodA.id, locationId: warehouse.id, quantity: 1, unitPrice: 100000 }],
      initialPayment: { amount: 20000, method: "cash", notes: "Acompte commande" },
    });
    assert(draftPartRes.success, `Échec création vente avec acompte: ${draftPartRes.error}`);
    const draftPartId = (draftPartRes.data as { id: number }).id;

    // Confirmer avec un versement complémentaire de 30 000 DA
    const confirmPartRes = await salesActions.confirmDraftSaleAction(draftPartId, {
      amount: 30000,
      method: "cash",
      notes: "Versement complémentaire à la confirmation",
    });
    assert(confirmPartRes.success, `Échec confirmation avec versement: ${confirmPartRes.error}`);

    const confirmedPartSale = await prisma.sales.findUnique({
      where: { id: draftPartId },
      include: { payments: true },
    });

    assert(confirmedPartSale?.totalAmount === 100000, "Total facture attendu 100 000 DA");
    assert(confirmedPartSale?.paidAmount === 50000, `Versé cumulé attendu 50 000 DA (20k + 30k), trouvé: ${confirmedPartSale?.paidAmount}`);
    assert(confirmedPartSale?.paymentStatus === "partial", `Statut paiement attendu 'partial', trouvé: ${confirmedPartSale?.paymentStatus}`);
    assert(confirmedPartSale?.payments.length === 2, `2 règlements attendus, trouvé: ${confirmedPartSale?.payments.length}`);

    // Vérifier la dette globale du client
    const customerInfo = await customerActions.getCustomerDetailsAction(customer.id);
    assert(customerInfo !== null, "Client introuvable");
    // Le client a 3 ventes :
    // 1. 210 000 DA (3 * 70k), 0 payé -> dette 210 000
    // 2. 450 000 DA (5 * 90k), 0 payé -> dette 450 000
    // 3. 100 000 DA, 50 000 payé -> dette 50 000
    // Total achats = 760 000 DA, Total payé = 50 000 DA, Dette = 710 000 DA
    assert(customerInfo!.totalPurchases === 760000, `Total achats attendu 760 000 DA, trouvé: ${customerInfo!.totalPurchases}`);
    assert(customerInfo!.totalPaid === 50000, `Total payé attendu 50 000 DA, trouvé: ${customerInfo!.totalPaid}`);
    assert(customerInfo!.outstandingBalance === 710000, `Dette attendue 710 000 DA, trouvée: ${customerInfo!.outstandingBalance}`);

    results.push({ num: 6, name: "Calculs de dette client et de règlements rigoureusement exacts", passed: true });
    console.log("✓ Test 6: Calculs de dette client et de paiements exacts.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 6, name: "Calculs de dette client et règlements", passed: false, error: msg });
    console.error("✗ Test 6 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 7: La confirmation sans paiement ne modifie pas les soldes de trésorerie
  // --------------------------------------------------------------------------
  try {
    const cashAccBefore = await prisma.treasuryAccount.findUnique({ where: { id: defaultCash.id } });
    const balanceBefore = cashAccBefore?.openingBalance || 0;
    const paymentsCountBefore = await prisma.payment.count();

    // Créer un devis sans acompte
    const draftNoPayRes = await salesActions.createSaleAction({
      customerId: customer.id,
      status: "draft",
      items: [{ productId: prodA.id, locationId: warehouse.id, quantity: 1, unitPrice: 50000 }],
    });
    assert(draftNoPayRes.success, "Création devis sans acompte");
    const draftNoPayId = (draftNoPayRes.data as { id: number }).id;

    // Confirmer sans versement
    const confirmNoPayRes = await salesActions.confirmDraftSaleAction(draftNoPayId);
    assert(confirmNoPayRes.success, "Confirmation devis sans acompte");

    const cashAccAfter = await prisma.treasuryAccount.findUnique({ where: { id: defaultCash.id } });
    const balanceAfter = cashAccAfter?.openingBalance || 0;
    const paymentsCountAfter = await prisma.payment.count();

    assert(
      balanceBefore === balanceAfter,
      `Le solde de trésorerie a été altéré par la confirmation elle-même ! Avant: ${balanceBefore}, Après: ${balanceAfter}`
    );
    assert(
      paymentsCountBefore === paymentsCountAfter,
      `Un nouveau paiement a été enregistré lors de la confirmation sans paiement !`
    );

    const paymentsCount = await prisma.payment.count({ where: { saleId: draftNoPayId } });
    assert(paymentsCount === 0, `0 paiement attendu pour confirmation sans règlement, trouvé: ${paymentsCount}`);

    results.push({ num: 7, name: "Soldes de trésorerie inchangés par la confirmation elle-même", passed: true });
    console.log("✓ Test 7: Solde trésorerie strictement inchangé.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 7, name: "Soldes de trésorerie inchangés", passed: false, error: msg });
    console.error("✗ Test 7 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Totaux de facturation et rapports de ventes corrects
  // --------------------------------------------------------------------------
  try {
    const reports = await reportActions.getReportsData();
    const summary = reports.salesSummary;

    // Toutes les ventes confirmées ci-dessus doivent être comptabilisées :
    // Vente 1 : 210 000 DA
    // Vente 2 : 450 000 DA
    // Vente 3 : 100 000 DA
    // Vente 4 : 50 000 DA
    // Total facturé confirmé = 810 000 DA
    // Total encaissé = 50 000 DA (20 000 acompte + 30 000 confirmation de vente 3)
    // Créances = 760 000 DA
    assert(
      summary.invoicedRevenue === 810000,
      `Chiffre d'affaires facturé attendu 810 000 DA, trouvé: ${summary.invoicedRevenue}`
    );
    assert(
      summary.collectedRevenue === 50000,
      `Chiffre d'affaires encaissé attendu 50 000 DA, trouvé: ${summary.collectedRevenue}`
    );
    assert(
      summary.customerDebts === 760000,
      `Créances clients attendues 760 000 DA, trouvé: ${summary.customerDebts}`
    );
    assert(
      summary.confirmedSalesCount === 4,
      `Nombre de factures confirmées attendu 4, trouvé: ${summary.confirmedSalesCount}`
    );

    results.push({ num: 8, name: "Totaux et rapports de vente consolidés rigoureusement exacts", passed: true });
    console.log("✓ Test 8: Rapports de ventes et totaux exacts.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 8, name: "Totaux et rapports de vente", passed: false, error: msg });
    console.error("✗ Test 8 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Double confirmation rejetée sans duplication
  // --------------------------------------------------------------------------
  try {
    const paymentsBefore = await prisma.payment.findMany({ where: { saleId: draftSale1Id } });
    const saleBefore = await prisma.sales.findUnique({ where: { id: draftSale1Id } });

    // Tentative de confirmation répétée
    const doubleRes = await salesActions.confirmDraftSaleAction(draftSale1Id, {
      amount: 10000,
      method: "cash",
    });
    assert(!doubleRes.success, "La confirmation répétée d'une vente déjà confirmée DOIT être rejetée !");
    assert(
      Boolean(doubleRes.error?.includes("déjà été confirmée")),
      `Message d'erreur attendu mentionnant la confirmation préalable, reçu: ${doubleRes.error}`
    );

    const paymentsAfter = await prisma.payment.findMany({ where: { saleId: draftSale1Id } });
    const saleAfter = await prisma.sales.findUnique({ where: { id: draftSale1Id } });

    assert(paymentsBefore.length === paymentsAfter.length, "Des paiements ont été créés lors de la double confirmation !");
    assert(saleBefore?.reference === saleAfter?.reference, "La référence a été réécrite lors de la double confirmation !");
    assert(saleBefore?.paidAmount === saleAfter?.paidAmount, "Le montant payé a changé lors de la double confirmation !");

    results.push({ num: 9, name: "Rejet de double confirmation sans duplication financière", passed: true });
    console.log("✓ Test 9: Protection double confirmation sans duplication réussie.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 9, name: "Rejet de double confirmation", passed: false, error: msg });
    console.error("✗ Test 9 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Les ventes ordinaires (status='confirmed') continuent de déduire le stock
  // --------------------------------------------------------------------------
  try {
    // ProdA a toujours stock = 10
    const stockBeforeOrdinary = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodA.id, locationId: warehouse.id } },
    });
    assert(stockBeforeOrdinary?.quantity === 10, "Stock initial de ProdA doit être 10");

    // Créer une vente directe confirmée de 2 unités de ProdA
    const ordinarySaleRes = await salesActions.createSaleAction({
      customerId: customer.id,
      status: "confirmed",
      items: [{ productId: prodA.id, locationId: warehouse.id, quantity: 2, unitPrice: 70000 }],
    });
    assert(ordinarySaleRes.success, `Échec vente ordinaire: ${ordinarySaleRes.error}`);
    const ordinarySaleId = (ordinarySaleRes.data as { id: number }).id;

    // Pour cette vente ordinaire, le stock DOIT être déduit de 2 (10 -> 8)
    const stockAfterOrdinary = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodA.id, locationId: warehouse.id } },
    });
    const prodAfterOrdinary = await prisma.product.findUnique({ where: { id: prodA.id } });
    assert(
      stockAfterOrdinary?.quantity === 8,
      `Vente ordinaire DOIT déduire le stock (10 -> 8), trouvé: ${stockAfterOrdinary?.quantity}`
    );
    assert(
      prodAfterOrdinary?.stock === 8,
      `Vente ordinaire DOIT déduire le stock global (10 -> 8), trouvé: ${prodAfterOrdinary?.stock}`
    );

    // Mouvement de stock de type SALE créé
    const ordinaryMovements = await prisma.stockMovement.findMany({ where: { saleId: ordinarySaleId } });
    assert(ordinaryMovements.length === 1, `1 mouvement de stock attendu pour vente ordinaire, trouvé: ${ordinaryMovements.length}`);
    assert(ordinaryMovements[0].type === "SALE", `Type de mouvement attendu 'SALE', obtenu: ${ordinaryMovements[0].type}`);
    assert(ordinaryMovements[0].quantity === 2, `Quantité mouvement attendue 2, obtenu: ${ordinaryMovements[0].quantity}`);

    // Tentative de survente ordinaire (stock disponible = 8, demander 15) -> doit être rejetée
    const overSaleRes = await salesActions.createSaleAction({
      customerId: customer.id,
      status: "confirmed",
      items: [{ productId: prodA.id, locationId: warehouse.id, quantity: 15, unitPrice: 70000 }],
    });
    assert(!overSaleRes.success, "Une vente ordinaire dépassant le stock disponible DOIT être rejetée !");

    results.push({ num: 10, name: "Conservation stricte de la déduction de stock pour les ventes directes ordinaires", passed: true });
    console.log("✓ Test 10: Ventes directes ordinaires conservent la déduction et le rejet de survente.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 10, name: "Conservation déduction ventes ordinaires", passed: false, error: msg });
    console.error("✗ Test 10 échoué:", msg);
  }

  // ==========================================================================
  // SYNTHÈSE GLOBALE DES TESTS
  // ==========================================================================
  console.log("\n================================================================================");
  console.log("  RÉSULTAT DES TESTS : CONFIRMATION BROUILLON SANS DÉDUCTION DE STOCK");
  console.log("================================================================================");
  for (const r of results) {
    const status = r.passed ? "[PASS]" : "[FAIL]";
    console.log(`  ${status} Test ${String(r.num).padStart(2, "0")} : ${r.name}`);
    if (r.error) {
      console.log(`         Cause: ${r.error}`);
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  console.log(`\nTOTAL: ${passedCount} / ${totalCount} tests réussis (${Math.round((passedCount / totalCount) * 100)}%).`);
  console.log("================================================================================\n");

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
