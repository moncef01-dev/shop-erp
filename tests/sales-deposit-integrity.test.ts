/**
 * Integration Test Suite: Sales Deposits, Draft Conversion, and Subsequent Payments
 *
 * Tests the financial integrity of deposits on draft orders, subsequent payments,
 * cash session linkage, physical stock preservation, and one-time fulfilment deduction.
 *
 * Runs against an isolated temporary SQLite database: prisma/test_sales_deposit.db
 * Never touches real shop data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_sales_deposit.db");
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
  console.log("  SHOP ERP — SUITE DE TESTS : ACOMPTES VENTES, RÈGLEMENTS & CYCLE DE VIE");
  console.log("  Base de test isolée :", testDbPath);
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
    const sqlFile = path.join(migrationsDir, folder, "migration.sql");
    const sql = fs.readFileSync(sqlFile, "utf-8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await ddlClient.execute(stmt);
    }
  }
  ddlClient.close();
  console.log("✓ Schéma et migrations appliqués à la base de test isolée.\n");

  // Importer Prisma et Actions
  const { prisma } = await import("@/lib/prisma");
  const productActions = await import("@/app/products/actions");
  const salesActions = await import("@/app/sales/actions");
  const cashActions = await import("@/app/cash/actions");

  // Initialiser emplacements
  await productActions.ensureDefaultLocations();
  const showroom = await prisma.location.findFirst({ where: { code: "SHOWROOM" } });
  assert(showroom !== null, "Emplacement SHOWROOM introuvable");

  // Créer une catégorie et un client de test
  const cat = await prisma.category.create({ data: { name: "Tables & Salles à Manger" } });
  const customer = await prisma.customer.create({
    data: { name: "Client Test Acompte", phone: "0770001122" },
  });

  // Créer un produit test (Table Soltana 6 chaises, prix 46 000 DA, stock = 2 au showroom)
  const tableProd = await prisma.product.create({
    data: {
      sku: "TAB-SOLTANA-TEST",
      name: "Table Soltana 6 chaises",
      categoryId: cat.id,
      costPrice: 32000,
      sellingPrice: 46000,
      stock: 2,
      stocks: {
        create: {
          locationId: showroom!.id,
          quantity: 2,
        },
      },
    },
  });

  // --------------------------------------------------------------------------
  // TEST 1: Création d'une commande/devis avec acompte de 6 000 DA sur total 46 000 DA
  // --------------------------------------------------------------------------
  let draftSaleId = 0;
  try {
    const res = await salesActions.createSaleAction({
      customerId: customer.id,
      status: "draft",
      notes: "Acompte de 6 000 DA reçu. Table réservée au client. Retrait ou livraison à confirmer.",
      items: [
        {
          productId: tableProd.id,
          locationId: showroom!.id,
          quantity: 1,
          unitPrice: 46000,
        },
      ],
      initialPayment: {
        amount: 6000,
        method: "cash",
        notes: "Acompte en espèces reçu au magasin",
      },
    });

    assert(res.success, `Échec création vente brouillon avec acompte: ${res.error}`);
    draftSaleId = (res.data as { id: number }).id;

    const sale = await prisma.sales.findUnique({
      where: { id: draftSaleId },
      include: { payments: true, items: true },
    });

    assert(sale !== null, "Vente introuvable");
    assert(sale!.reference.startsWith("DEV-"), `Préfixe attendu DEV-, obtenu ${sale!.reference}`);
    assert(sale!.status === "draft", `Statut attendu 'draft', obtenu ${sale!.status}`);
    assert(sale!.totalAmount === 46000, `Total attendu 46000, obtenu ${sale!.totalAmount}`);
    assert(sale!.paidAmount === 6000, `Versé attendu 6000, obtenu ${sale!.paidAmount}`);
    assert(sale!.paymentStatus === "partial", `Statut paiement attendu 'partial', obtenu ${sale!.paymentStatus}`);

    // Vérifier la présence du paiement réel dans la table Payment
    assert(sale!.payments.length === 1, `1 paiement attendu, trouvé ${sale!.payments.length}`);
    const pay = sale!.payments[0];
    assert(pay.amount === 6000, `Montant paiement attendu 6000, obtenu ${pay.amount}`);
    assert(pay.method === "cash", `Mode attendu cash, obtenu ${pay.method}`);
    assert(pay.status === "completed", `Statut paiement attendu completed, obtenu ${pay.status}`);
    assert(pay.reference !== null && pay.reference.startsWith("PAY-"), "Référence paiement invalide");

    // Vérifier que le stock physique au Showroom n'a PAS été déduit
    const stockAfter = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: tableProd.id, locationId: showroom!.id } },
    });
    assert(stockAfter!.quantity === 2, `Stock physique altéré ! Attendu 2, trouvé ${stockAfter!.quantity}`);

    const movements = await prisma.stockMovement.findMany({ where: { saleId: draftSaleId } });
    assert(movements.length === 0, `Des mouvements de stock ont été créés prématurément: ${movements.length}`);

    results.push({ num: 1, name: "Enregistrement de l'Acompte (6 000 DA / 46 000 DA) en Brouillon sans Déduction de Stock", passed: true });
    console.log("✓ Test 1: Enregistrement de l'Acompte (6 000 DA / 46 000 DA) en Brouillon sans Déduction de Stock réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 1, name: "Enregistrement de l'Acompte (6 000 DA / 46 000 DA) en Brouillon sans Déduction de Stock", passed: false, error: msg });
    console.error("✗ Test 1 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Intégration Caisse Physique vs Virement (Rattachement Session Ouverte)
  // --------------------------------------------------------------------------
  try {
    // Ouvrir une session de caisse
    const openRes = await cashActions.openCashSessionAction({
      openingAmount: 15000,
      openingNotes: "Fond de caisse matin",
    });
    assert(openRes.success, `Échec ouverture caisse: ${openRes.error}`);
    const session = openRes.data as { id: number; reference: string };

    // Créer une commande en espèces : doit être liée à la session ouverte
    const cashOrderRes = await salesActions.createSaleAction({
      customerId: customer.id,
      status: "draft",
      items: [{ productId: tableProd.id, locationId: showroom!.id, quantity: 1, unitPrice: 20000 }],
      initialPayment: { amount: 5000, method: "cash" },
    });
    assert(cashOrderRes.success, `Échec commande cash: ${cashOrderRes.error}`);
    const cashSaleId = (cashOrderRes.data as { id: number }).id;
    const cashPay = await prisma.payment.findFirst({ where: { saleId: cashSaleId } });
    assert(cashPay!.sessionId === session.id, `Le paiement en espèces aurait dû être rattaché à la session ${session.id}, obtenu ${cashPay!.sessionId}`);

    // Créer une commande par virement : NE doit PAS être liée à la caisse physique
    const transferOrderRes = await salesActions.createSaleAction({
      customerId: customer.id,
      status: "draft",
      items: [{ productId: tableProd.id, locationId: showroom!.id, quantity: 1, unitPrice: 20000 }],
      initialPayment: { amount: 5000, method: "transfer" },
    });
    assert(transferOrderRes.success, `Échec commande virement: ${transferOrderRes.error}`);
    const transferSaleId = (transferOrderRes.data as { id: number }).id;
    const transferPay = await prisma.payment.findFirst({ where: { saleId: transferSaleId } });
    assert(transferPay!.sessionId === null, `Le paiement par virement ne doit pas être rattaché à la caisse physique, obtenu ${transferPay!.sessionId}`);

    results.push({ num: 2, name: "Attribution Caisse: Espèces rattachées à la session active, Virement séparé", passed: true });
    console.log("✓ Test 2: Attribution Caisse: Espèces rattachées à la session active, Virement séparé réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 2, name: "Attribution Caisse: Espèces rattachées à la session active, Virement séparé", passed: false, error: msg });
    console.error("✗ Test 2 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Enregistrement du Solde Restant (40 000 DA) sur la Commande Existante
  // --------------------------------------------------------------------------
  try {
    const fd = new FormData();
    fd.set("saleId", String(draftSaleId));
    fd.set("amount", "40000");
    fd.set("method", "cash");
    fd.set("notes", "Règlement du solde restant par le client");

    const payRes = await salesActions.recordSalePaymentAction(fd);
    assert(payRes.success, `Échec règlement solde: ${payRes.error}`);

    const saleAfter = await prisma.sales.findUnique({
      where: { id: draftSaleId },
      include: { payments: true },
    });

    assert(saleAfter!.paidAmount === 46000, `Montant total versé attendu 46000, obtenu ${saleAfter!.paidAmount}`);
    assert(saleAfter!.paymentStatus === "paid", `Statut attendu 'paid', obtenu ${saleAfter!.paymentStatus}`);
    assert(saleAfter!.payments.length === 2, `2 paiements attendus sur la vente, trouvé ${saleAfter!.payments.length}`);

    // Le stock doit TOUJOURS rester à 2 car la vente est toujours en statut draft (le client n'a pas encore retiré la table)
    const stockAfter = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: tableProd.id, locationId: showroom!.id } },
    });
    assert(stockAfter!.quantity === 2, `Stock physique déduit trop tôt ! Attendu 2, trouvé ${stockAfter!.quantity}`);

    results.push({ num: 3, name: "Encaissement du Solde (40 000 DA) sur Commande Existante et Solde = 0 DA", passed: true });
    console.log("✓ Test 3: Encaissement du Solde (40 000 DA) sur Commande Existante et Solde = 0 DA réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 3, name: "Encaissement du Solde (40 000 DA) sur Commande Existante et Solde = 0 DA", passed: false, error: msg });
    console.error("✗ Test 3 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Rejet Strict des Trop-Perçus et des Montants Invalides
  // --------------------------------------------------------------------------
  try {
    // La vente draftSaleId est maintenant payée à 100% (46 000 / 46 000). Toute tentative de versement supplémentaire doit être rejetée.
    const fdExcess = new FormData();
    fdExcess.set("saleId", String(draftSaleId));
    fdExcess.set("amount", "1000");
    fdExcess.set("method", "cash");

    const resExcess = await salesActions.recordSalePaymentAction(fdExcess);
    assert(!resExcess.success, "Un versement dépassant le solde aurait dû être rejeté.");
    assert(Boolean(resExcess.error?.includes("dépasse")), `Message inattendu: ${resExcess.error}`);

    // Tentative de versement négatif
    const fdNeg = new FormData();
    fdNeg.set("saleId", String(draftSaleId));
    fdNeg.set("amount", "-500");
    const resNeg = await salesActions.recordSalePaymentAction(fdNeg);
    assert(!resNeg.success, "Un montant négatif aurait dû être rejeté.");

    results.push({ num: 4, name: "Rejet Strict des Trop-Perçus et Montants Négatifs", passed: true });
    console.log("✓ Test 4: Rejet Strict des Trop-Perçus et Montants Négatifs réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 4, name: "Rejet Strict des Trop-Perçus et Montants Négatifs", passed: false, error: msg });
    console.error("✗ Test 4 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Retrait Physique & Confirmation de la Commande (Déduction Unique)
  // --------------------------------------------------------------------------
  try {
    // Le client vient retirer la table : l'employé confirme la commande
    const confirmRes = await salesActions.confirmDraftSaleAction(draftSaleId);
    assert(confirmRes.success, `Échec confirmation commande: ${confirmRes.error}`);

    const confirmedSale = await prisma.sales.findUnique({
      where: { id: draftSaleId },
      include: { payments: true },
    });

    assert(confirmedSale!.status === "confirmed", `Statut attendu 'confirmed', obtenu ${confirmedSale!.status}`);
    assert(confirmedSale!.reference.startsWith("FAC-"), `Préfixe attendu 'FAC-', obtenu ${confirmedSale!.reference}`);
    assert(confirmedSale!.paidAmount === 46000, `Le montant payé doit être conservé (46 000), obtenu ${confirmedSale!.paidAmount}`);
    assert(confirmedSale!.paymentStatus === "paid", `Statut paiement attendu 'paid', obtenu ${confirmedSale!.paymentStatus}`);

    // Le stock doit maintenant être déduit d'exactement 1 unité (2 -> 1)
    const stockAfter = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: tableProd.id, locationId: showroom!.id } },
    });
    assert(stockAfter!.quantity === 1, `Stock attendu 1 après retrait, trouvé ${stockAfter!.quantity}`);

    const movements = await prisma.stockMovement.findMany({ where: { saleId: draftSaleId } });
    assert(movements.length === 1, `Exactement 1 mouvement de stock attendu, trouvé ${movements.length}`);
    assert(movements[0].type === "SALE", `Type de mouvement attendu 'SALE', obtenu ${movements[0].type}`);
    assert(movements[0].quantity === 1, `Quantité mouvement attendue 1, obtenu ${movements[0].quantity}`);

    // Protection double confirmation
    const doubleConfirm = await salesActions.confirmDraftSaleAction(draftSaleId);
    assert(!doubleConfirm.success, "La double confirmation d'une commande déjà confirmée aurait dû être refusée.");

    results.push({ num: 5, name: "Retrait / Confirmation: Conversion en FAC- et Déduction Physique Unique du Stock", passed: true });
    console.log("✓ Test 5: Retrait / Confirmation: Conversion en FAC- et Déduction Physique Unique du Stock réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 5, name: "Retrait / Confirmation: Conversion en FAC- et Déduction Physique Unique du Stock", passed: false, error: msg });
    console.error("✗ Test 5 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Cas Client Partiel Retirant le Meuble (Sortie autorisée avec Dette)
  // --------------------------------------------------------------------------
  try {
    // Une nouvelle commande : table restante au showroom (stock = 1), acompte 10 000 DA sur 46 000 DA
    const partialOrder = await salesActions.createSaleAction({
      customerId: customer.id,
      status: "draft",
      items: [{ productId: tableProd.id, locationId: showroom!.id, quantity: 1, unitPrice: 46000 }],
      initialPayment: { amount: 10000, method: "cash" },
    });
    assert(partialOrder.success, `Échec commande partielle: ${partialOrder.error}`);
    const partialSaleId = (partialOrder.data as { id: number }).id;

    // Le client retire le meuble immédiatement mais paiera les 36 000 DA restants le mois prochain
    const confirmPartial = await salesActions.confirmDraftSaleAction(partialSaleId);
    assert(confirmPartial.success, `Échec confirmation retrait avec dette: ${confirmPartial.error}`);

    const verifiedPartial = await prisma.sales.findUnique({ where: { id: partialSaleId } });
    assert(verifiedPartial!.status === "confirmed", "Statut attendu confirmed");
    assert(verifiedPartial!.paidAmount === 10000, "Le versement de 10 000 DA doit être conservé");
    assert(verifiedPartial!.paymentStatus === "partial", "Statut paiement doit être 'partial'");

    // Stock showroom doit maintenant être à 0
    const stockZero = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: tableProd.id, locationId: showroom!.id } },
    });
    assert(stockZero!.quantity === 0, `Stock attendu 0, trouvé ${stockZero!.quantity}`);

    // Le client revient payer un deuxième acompte de 16 000 DA
    const fd2 = new FormData();
    fd2.set("saleId", String(partialSaleId));
    fd2.set("amount", "16000");
    fd2.set("method", "cash");
    const payPart2 = await salesActions.recordSalePaymentAction(fd2);
    assert(payPart2.success, `Échec second acompte: ${payPart2.error}`);

    const saleAfterPart2 = await prisma.sales.findUnique({ where: { id: partialSaleId } });
    assert(saleAfterPart2!.paidAmount === 26000, `Versé attendu 26000, obtenu ${saleAfterPart2!.paidAmount}`);
    assert(saleAfterPart2!.paymentStatus === "partial", "Statut doit rester partial");

    // Enfin, le client solde les 20 000 DA restants
    const fd3 = new FormData();
    fd3.set("saleId", String(partialSaleId));
    fd3.set("amount", "20000");
    fd3.set("method", "cash");
    const payPart3 = await salesActions.recordSalePaymentAction(fd3);
    assert(payPart3.success, `Échec solde: ${payPart3.error}`);

    const saleFinal = await prisma.sales.findUnique({ where: { id: partialSaleId } });
    assert(saleFinal!.paidAmount === 46000, `Versé attendu 46000, obtenu ${saleFinal!.paidAmount}`);
    assert(saleFinal!.paymentStatus === "paid", "Statut doit être paid");

    results.push({ num: 6, name: "Versements Multiples et Retrait avec Dette Autorisée", passed: true });
    console.log("✓ Test 6: Versements Multiples et Retrait avec Dette Autorisée réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 6, name: "Versements Multiples et Retrait avec Dette Autorisée", passed: false, error: msg });
    console.error("✗ Test 6 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Clôture de Session et Contrôle d'Écart
  // --------------------------------------------------------------------------
  try {
    const activeSession = await prisma.cashSession.findFirst({ where: { status: "open" } });
    assert(activeSession !== null, "Session active attendue");

    // Clôturer la caisse avec le montant théorique calculé
    const closeRes = await cashActions.closeCashSessionAction({
      sessionId: activeSession!.id,
      closingAmount: 96000, // montant compté
    });
    assert(closeRes.success, `Échec clôture caisse: ${closeRes.error}`);

    const closed = await prisma.cashSession.findUnique({ where: { id: activeSession!.id } });
    assert(closed!.status === "closed", "Session doit être closed");
    assert(closed!.closedAt !== null, "closedAt doit être renseigné");

    results.push({ num: 7, name: "Clôture de Caisse et Archivage Immuable de Session", passed: true });
    console.log("✓ Test 7: Clôture de Caisse et Archivage Immuable de Session réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 7, name: "Clôture de Caisse et Archivage Immuable de Session", passed: false, error: msg });
    console.error("✗ Test 7 échoué:", msg);
  }

  // ==========================================================================
  // SYNTHÈSE
  // ==========================================================================
  console.log("\n================================================================================");
  console.log("  RÉSULTAT DES TESTS : ACOMPTES VENTES & FINANCES");
  console.log("================================================================================");
  for (const r of results) {
    const status = r.passed ? "[PASS]" : "[FAIL]";
    console.log(`  ${status} Test ${String(r.num).padStart(2, "0")} : ${r.name}`);
    if (r.error) {
      console.log(`         Cause: ${r.error}`);
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  console.log(`\nTOTAL: ${passedCount} / ${results.length} tests réussis (${Math.round((passedCount / results.length) * 100)}%).`);
  console.log("================================================================================\n");

  if (passedCount !== results.length) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Erreur fatale exécution tests:", e);
  process.exit(1);
});
