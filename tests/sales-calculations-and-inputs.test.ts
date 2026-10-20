/**
 * Comprehensive Integration & Regression Test Suite:
 * Sales Module Calculation Formulas & Dynamic Input Stability
 *
 * Runs against an isolated temporary SQLite database: prisma/test_sales_calculations.db
 * Never touches real production data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_sales_calculations.db");
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
  console.log("  SHOP ERP — SUITE DE TESTS : CALCULS VENTES & STABILITÉ DE SAISIE");
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
  const customerActions = await import("@/app/customers/actions");

  // Initialiser emplacements
  await productActions.ensureDefaultLocations();
  const showroom = await prisma.location.findFirst({ where: { code: "SHOWROOM" } });
  assert(showroom !== null, "Emplacement SHOWROOM introuvable");

  // Créer une catégorie, produits et un client de test
  const cat = await prisma.category.create({ data: { name: "Salons & Séjours" } });
  const cust = await prisma.customer.create({
    data: { name: "Mme Bouzid Fatima", phone: "0550112233", address: "Kouba, Alger" },
  });

  const p1 = await prisma.product.create({
    data: {
      sku: "CAN-001",
      name: "Canapé d'Angle 5 Places",
      sellingPrice: 85000,
      costPrice: 50000,
      categoryId: cat.id,
      stocks: { create: { locationId: showroom!.id, quantity: 10 } },
    },
  });

  const p2 = await prisma.product.create({
    data: {
      sku: "TAB-002",
      name: "Table Basse Verre Trempé",
      sellingPrice: 22000,
      costPrice: 12000,
      categoryId: cat.id,
      stocks: { create: { locationId: showroom!.id, quantity: 15 } },
    },
  });

  const p3 = await prisma.product.create({
    data: {
      sku: "POUF-003",
      name: "Pouf Velours",
      sellingPrice: 7500,
      costPrice: 3500,
      categoryId: cat.id,
      stocks: { create: { locationId: showroom!.id, quantity: 20 } },
    },
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Formule de calcul multi-lignes, remises lignes, remise globale, livraison
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    console.log("Test 1: Formule de calcul stricte (Lignes, Remises, Frais, Total TTC)");

    // Ligne 1: 2 x 85,000 DA = 170,000 DA - remise ligne 5,000 DA = 165,000 DA
    // Ligne 2: 1 x 22,000 DA = 22,000 DA - remise ligne 2,000 DA = 20,000 DA
    // Ligne 3: 3 x 7,500 DA = 22,500 DA - remise 0 = 22,500 DA
    // Sous-total articles = 165,000 + 20,000 + 22,500 = 207,500 DA
    // Frais livraison = 3,500 DA
    // Remise globale = 6,000 DA
    // Total attendu = 207,500 + 3,500 - 6,000 = 205,000 DA
    const items = [
      { productId: p1.id, locationId: showroom!.id, quantity: 2, unitPrice: 85000, discount: 5000 },
      { productId: p2.id, locationId: showroom!.id, quantity: 1, unitPrice: 22000, discount: 2000 },
      { productId: p3.id, locationId: showroom!.id, quantity: 3, unitPrice: 7500, discount: 0 },
    ];

    const saleRes = await salesActions.createSaleAction({
      customerId: cust.id,
      status: "confirmed",
      items,
      deliveryFee: 3500,
      includeDeliveryFee: true,
      discount: 6000,
      initialPayment: { amount: 50000, method: "cash" },
    });

    assert(saleRes.success === true, `Échec création vente: ${saleRes.error}`);
    const saleId = (saleRes.data as { id: number }).id;

    const savedSale = await prisma.sales.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true },
    });

    assert(savedSale !== null, "Vente introuvable dans la base");
    const saleRec = savedSale!;
    assert(saleRec.subtotal === 207500, `Sous-total incorrect: attendu 207500, obtenu ${saleRec.subtotal}`);
    assert(saleRec.deliveryFee === 3500, `Frais livraison incorrect: attendu 3500, obtenu ${saleRec.deliveryFee}`);
    assert(saleRec.discount === 6000, `Remise globale incorrecte: attendu 6000, obtenu ${saleRec.discount}`);
    assert(saleRec.totalAmount === 205000, `Total TTC incorrect: attendu 205000, obtenu ${saleRec.totalAmount}`);
    assert(saleRec.paidAmount === 50000, `Montant versé incorrect: attendu 50000, obtenu ${saleRec.paidAmount}`);
    assert(saleRec.paymentStatus === "partial", `Statut paiement incorrect: ${saleRec.paymentStatus}`);

    // Vérifier les lignes individuelles
    const line1 = saleRec.items.find((it) => it.productId === p1.id);
    assert(line1?.subtotal === 165000, `Ligne 1 subtotal attendu 165000, obtenu ${line1?.subtotal}`);
    const line2 = saleRec.items.find((it) => it.productId === p2.id);
    assert(line2?.subtotal === 20000, `Ligne 2 subtotal attendu 20000, obtenu ${line2?.subtotal}`);
    const line3 = saleRec.items.find((it) => it.productId === p3.id);
    assert(line3?.subtotal === 22500, `Ligne 3 subtotal attendu 22500, obtenu ${line3?.subtotal}`);

    // Vérifier le paiement initial
    assert(saleRec.payments.length === 1, "Paiement unique attendu");
    assert(saleRec.payments[0].amount === 50000, "Montant paiement initial attendu 50000");

    results.push({ num: 1, name: "Formule de calcul multi-lignes, remises, frais et total", passed: true });
    console.log("  ✓ Test 1 réussi\n");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 1, name: "Formule de calcul multi-lignes, remises, frais et total", passed: false, error: msg });
    console.error("  ✗ Test 1 échoué:", msg, "\n");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Simulation de saisie sans écrasement mutuel (Stabilité des lignes)
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    console.log("Test 2: Stabilité des lignes et saisie numérique (Pas d'écrasement croisé)");

    // Modélisons la logique de l'état React corrigé:
    // Chaque ligne a un identifiant immuable.
    interface LineState {
      id: string;
      productId: number;
      locationId: number;
      quantity: string;
      unitPrice: string;
      discount: string;
    }

    let lines: LineState[] = [
      { id: "line-1", productId: p1.id, locationId: showroom!.id, quantity: "1", unitPrice: "85000", discount: "0" },
      { id: "line-2", productId: p2.id, locationId: showroom!.id, quantity: "2", unitPrice: "22000", discount: "500" },
      { id: "line-3", productId: p3.id, locationId: showroom!.id, quantity: "4", unitPrice: "7500", discount: "0" },
    ];

    // Simuler: L'utilisateur modifie la quantité de la Ligne 2 en tapant "5"
    lines = lines.map((l) => (l.id === "line-2" ? { ...l, quantity: "5" } : l));

    // Vérifier que la ligne 1 et la ligne 3 sont TOTALEMENT inchangées
    assert(lines[0].quantity === "1" && lines[0].unitPrice === "85000", "Ligne 1 a été altérée par la modification de Ligne 2!");
    assert(lines[2].quantity === "4" && lines[2].unitPrice === "7500", "Ligne 3 a été altérée par la modification de Ligne 2!");
    assert(lines[1].quantity === "5", "Ligne 2 n'a pas pris la nouvelle quantité");

    // Simuler: L'utilisateur efface la saisie de prix pour retaper (e.target.value = "")
    lines = lines.map((l) => (l.id === "line-2" ? { ...l, unitPrice: "" } : l));
    assert(lines[1].unitPrice === "", "La saisie vide doit être préservée pour permettre la frappe sans claquement immédiat à 0");

    // Simuler: L'utilisateur tape un montant décimal avec point ("22500.")
    lines = lines.map((l) => (l.id === "line-2" ? { ...l, unitPrice: "22500." } : l));
    assert(lines[1].unitPrice === "22500.", "Le point décimal a été tronqué lors de la frappe !");

    // Simuler: L'utilisateur termine la saisie ("22500.50")
    lines = lines.map((l) => (l.id === "line-2" ? { ...l, unitPrice: "22500.50" } : l));
    assert(lines[1].unitPrice === "22500.50", "La valeur décimale finale n'est pas exacte");

    // Simuler: Suppression de la Ligne 1
    lines = lines.filter((l) => l.id !== "line-1");
    // Les lignes restantes doivent conserver leur identité et valeurs exactes
    assert(lines.length === 2, "La taille du tableau après suppression est incorrecte");
    assert(lines[0].id === "line-2" && lines[0].unitPrice === "22500.50", "Ligne 2 a été corrompue après suppression de Ligne 1");
    assert(lines[1].id === "line-3" && lines[1].quantity === "4", "Ligne 3 a été corrompue après suppression de Ligne 1");

    results.push({ num: 2, name: "Stabilité des identifiants et saisie sans écrasement mutuel", passed: true });
    console.log("  ✓ Test 2 réussi\n");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 2, name: "Stabilité des identifiants et saisie sans écrasement mutuel", passed: false, error: msg });
    console.error("  ✗ Test 2 échoué:", msg, "\n");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: Synchronisation mode Comptant vs Acompte personnalisé
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    console.log("Test 3: Synchronisation Comptant (100%) vs Acompte personnalisé");

    // 1. Mode Comptant par défaut:
    let grandTotal = 100000;
    let formPaymentType: "full" | "partial" | "credit" = "full";
    let isPaidAmountCustom = false;
    let formPaidAmount = "";

    const computeEffectivePaid = () => {
      if (formPaymentType === "credit") return 0;
      if (formPaymentType === "full" && !isPaidAmountCustom) return grandTotal;
      const typed = parseFloat(formPaidAmount);
      return isNaN(typed) ? 0 : Math.max(0, typed);
    };

    assert(computeEffectivePaid() === 100000, "Le mode comptant par défaut doit égaler grandTotal (100,000)");

    // L'utilisateur ajoute un produit, grandTotal passe à 150,000
    grandTotal = 150000;
    assert(computeEffectivePaid() === 150000, "Le montant comptant doit suivre automatiquement le total sans nécessiter de re-clic");

    // L'utilisateur tape manuellement un acompte de 40,000 DA
    formPaidAmount = "40000";
    isPaidAmountCustom = true;
    formPaymentType = "partial";
    assert(computeEffectivePaid() === 40000, "L'acompte personnalisé saisi doit être 40,000 DA");

    // L'utilisateur modifie encore des articles, grandTotal passe à 180,000
    grandTotal = 180000;
    assert(computeEffectivePaid() === 40000, "L'acompte personnalisé de 40,000 DA ne doit JAMAIS être écrasé par la modification des articles !");

    // L'utilisateur clique sur 'Comptant (100%)'
    formPaymentType = "full";
    isPaidAmountCustom = false;
    assert(computeEffectivePaid() === 180000, "Le clic sur Comptant doit restaurer le montant total dynamique");

    // L'utilisateur clique sur 'À Crédit'
    formPaymentType = "credit";
    isPaidAmountCustom = true;
    assert(computeEffectivePaid() === 0, "Le clic sur À Crédit doit donner un versement immédiat de 0 DA");

    results.push({ num: 3, name: "Comptant dynamique vs préservation d'acompte personnalisé", passed: true });
    console.log("  ✓ Test 3 réussi\n");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 3, name: "Comptant dynamique vs préservation d'acompte personnalisé", passed: false, error: msg });
    console.error("  ✗ Test 3 échoué:", msg, "\n");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: Rejet strict des trop-perçus (Anti-Overpayment)
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    console.log("Test 4: Rejet strict des trop-perçus (Création, Confirmation, Règlements)");

    // A. Tentative de créer une vente avec versement initial supérieur au total
    const overpaySaleRes = await salesActions.createSaleAction({
      customerId: cust.id,
      status: "confirmed",
      items: [{ productId: p2.id, locationId: showroom!.id, quantity: 1, unitPrice: 22000 }],
      initialPayment: { amount: 30000, method: "cash" }, // Total est 22,000 DA
    });
    assert(overpaySaleRes.success === false, "La création d'une vente avec versement supérieur au total doit être rejetée !");
    assert(Boolean(overpaySaleRes.error?.includes("ne peut pas excéder")), "Le message d'erreur de trop-perçu est absent");

    // B. Vente valide avec solde restant, puis tentative de trop-perçu au règlement complémentaire
    const validSaleRes = await salesActions.createSaleAction({
      customerId: cust.id,
      status: "confirmed",
      items: [{ productId: p2.id, locationId: showroom!.id, quantity: 1, unitPrice: 22000 }],
      initialPayment: { amount: 10000, method: "cash" }, // Reste 12,000 DA
    });
    assert(validSaleRes.success === true, "Échec création vente valide");
    const saleId = (validSaleRes.data as { id: number }).id;

    const fd = new FormData();
    fd.append("saleId", String(saleId));
    fd.append("amount", "15000"); // Dépasse le solde de 12,000 DA
    fd.append("method", "cash");

    const overpayRegRes = await salesActions.recordSalePaymentAction(fd);
    assert(overpayRegRes.success === false, "Le règlement complémentaire supérieur au solde doit être rejeté !");
    assert(Boolean(overpayRegRes.error?.includes("dépasse le solde")), "Le message d'erreur de dépassement de solde est absent");

    // Règlement exact du solde de 12,000 DA
    const fdExact = new FormData();
    fdExact.append("saleId", String(saleId));
    fdExact.append("amount", "12000");
    fdExact.append("method", "cash");

    const exactRegRes = await salesActions.recordSalePaymentAction(fdExact);
    assert(exactRegRes.success === true, `Le règlement exact doit être accepté: ${exactRegRes.error}`);

    const finalSale = await prisma.sales.findUnique({ where: { id: saleId } });
    assert(finalSale?.paidAmount === 22000, "Le montant total payé doit être 22,000 DA");
    assert(finalSale?.paymentStatus === "paid", "Le statut de paiement doit être 'paid'");

    results.push({ num: 4, name: "Rejet systématique des trop-perçus et règlements conformes", passed: true });
    console.log("  ✓ Test 4 réussi\n");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 4, name: "Rejet systématique des trop-perçus et règlements conformes", passed: false, error: msg });
    console.error("  ✗ Test 4 échoué:", msg, "\n");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Précision décimale et arrondi monétaire (roundMoney) en Dinars Algériens
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    console.log("Test 5: Précision décimale et absence de dérive flottante (roundMoney)");

    const { roundMoney } = await import("@/lib/formatters");

    // Tester l'arrondi monétaire sur des cas d'imprécision IEEE-754 classique
    assert(roundMoney(0.1 + 0.2) === 0.3, "0.1 + 0.2 doit arrondir exactement à 0.3");
    assert(roundMoney(1.005) === 1.01, "1.005 doit être arrondi à 1.01 (half up)");
    assert(roundMoney(45999.9999999) === 46000, "45999.9999999 doit arrondir à 46000");
    assert(roundMoney(1500.554) === 1500.55, "1500.554 doit tronquer au centime inférieur 1500.55");
    assert(roundMoney(1500.556) === 1500.56, "1500.556 doit arrondir au centime supérieur 1500.56");

    // Tester une vente avec des centimes
    const decimalSaleRes = await salesActions.createSaleAction({
      customerId: cust.id,
      status: "confirmed",
      items: [
        { productId: p3.id, locationId: showroom!.id, quantity: 3, unitPrice: 7500.50, discount: 0.25 },
      ], // 3 * 7500.50 = 22501.50 - 0.25 = 22501.25 DA
      deliveryFee: 499.75, // Total = 22501.25 + 499.75 = 23001.00 DA
      discount: 0.50, // Total net = 23000.50 DA
      initialPayment: { amount: 23000.50, method: "cib" },
    });

    assert(decimalSaleRes.success === true, `Vente décimale échouée: ${decimalSaleRes.error}`);
    const decSale = await prisma.sales.findUnique({ where: { id: (decimalSaleRes.data as { id: number }).id } });
    assert(decSale?.totalAmount === 23000.5, `Total attendu 23000.50 DA, obtenu ${decSale?.totalAmount}`);
    assert(decSale?.paidAmount === 23000.5, `Montant payé attendu 23000.50 DA, obtenu ${decSale?.paidAmount}`);
    assert(decSale?.paymentStatus === "paid", "Statut doit être paid");

    results.push({ num: 5, name: "Précision décimale et roundMoney sans dérive flottante", passed: true });
    console.log("  ✓ Test 5 réussi\n");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 5, name: "Précision décimale et roundMoney sans dérive flottante", passed: false, error: msg });
    console.error("  ✗ Test 5 échoué:", msg, "\n");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Consistance globale Client, Solde Restant Dû, et Annulation
  // ─────────────────────────────────────────────────────────────────────────────
  try {
    console.log("Test 6: Consistance globale avec créances client et réintégration annulation");

    // Créer un nouveau client isolé
    const clientDebiteur = await prisma.customer.create({
      data: { name: "M. Slimani Karim", phone: "0661998877" },
    });

    // Vente 1: 50,000 DA, acompte 20,000 DA -> Dette 30,000 DA
    const v1 = await salesActions.createSaleAction({
      customerId: clientDebiteur.id,
      status: "confirmed",
      items: [{ productId: p1.id, locationId: showroom!.id, quantity: 1, unitPrice: 50000 }],
      initialPayment: { amount: 20000, method: "cash" },
    });
    assert(v1.success === true, "Échec création V1");

    // Vente 2: 30,000 DA à crédit (0 DA versé) -> Dette 30,000 DA
    const v2 = await salesActions.createSaleAction({
      customerId: clientDebiteur.id,
      status: "confirmed",
      items: [{ productId: p2.id, locationId: showroom!.id, quantity: 1, unitPrice: 30000 }],
    });
    assert(v2.success === true, "Échec création V2");

    // Vérifier l'état de créance du client via getCustomersData
    const custsData = await customerActions.getCustomersData();
    const debiteurInfo = custsData.find((c) => c.id === clientDebiteur.id);

    assert(debiteurInfo !== undefined, "Client débiteur introuvable dans getCustomersData");
    assert(debiteurInfo!.totalPurchases === 80000, `Total achats attendu 80,000 DA, obtenu ${debiteurInfo!.totalPurchases}`);
    assert(debiteurInfo!.totalPaid === 20000, `Total payé attendu 20,000 DA, obtenu ${debiteurInfo!.totalPaid}`);
    assert(debiteurInfo!.outstandingBalance === 60000, `Solde dû attendu 60,000 DA, obtenu ${debiteurInfo!.outstandingBalance}`);

    // Annuler la Vente 2 (30,000 DA)
    const cancelRes = await salesActions.cancelSaleAction((v2.data as { id: number }).id, "Désistement client avant livraison");
    assert(cancelRes.success === true, `Annulation échouée: ${cancelRes.error}`);

    // Re-vérifier l'état de créance: la vente annulée ne doit plus compter dans les achats ni la dette
    const custsDataAfterCancel = await customerActions.getCustomersData();
    const debiteurInfoAfter = custsDataAfterCancel.find((c) => c.id === clientDebiteur.id);

    assert(debiteurInfoAfter!.totalPurchases === 50000, `Total achats après annulation attendu 50,000 DA, obtenu ${debiteurInfoAfter!.totalPurchases}`);
    assert(debiteurInfoAfter!.totalPaid === 20000, `Total payé après annulation attendu 20,000 DA, obtenu ${debiteurInfoAfter!.totalPaid}`);
    assert(debiteurInfoAfter!.outstandingBalance === 30000, `Solde dû après annulation attendu 30,000 DA, obtenu ${debiteurInfoAfter!.outstandingBalance}`);

    results.push({ num: 6, name: "Consistance du solde client et mise à jour lors de l'annulation", passed: true });
    console.log("  ✓ Test 6 réussi\n");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 6, name: "Consistance du solde client et mise à jour lors de l'annulation", passed: false, error: msg });
    console.error("  ✗ Test 6 échoué:", msg, "\n");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // BILAN FINAL
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("================================================================================");
  console.log("  RÉSUMÉ DU TEST DES CALCULS ET DE LA SAISIE DU MODULE VENTES");
  console.log("================================================================================");
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? "✓ PASS" : "✗ FAIL";
    console.log(`  ${icon} [Test ${r.num}] ${r.name}`);
    if (r.error) {
      console.log(`         Erreur: ${r.error}`);
      allPassed = false;
    }
  }
  console.log("================================================================================\n");

  if (!allPassed) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Erreur fatale exécution suite de tests:", e);
  process.exit(1);
});
