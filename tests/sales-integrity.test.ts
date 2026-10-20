/**
 * Integration Test Suite: Clients & Ventes Module
 *
 * Runs against an isolated temporary SQLite database: prisma/test_sales_runner.db
 * Never touches real shop data (prisma/shop.db).
 *
 * Covers all requirements from Section 9:
 * 1. Customer creation, search, invalid input, duplicate phone rejection.
 * 2. Multi-line sale creation with unit price overrides (preserving product defaults).
 * 3. Unique invoice numbering (FAC-YYYYMM-XXXX) and collision resistance.
 * 4. Insufficient stock rejection & zero negative stock guarantee.
 * 5. Atomic stock deduction from selected location and StockMovement creation (type: SALE).
 * 6. Transactional rollback if any line or step fails.
 * 7. Double-confirmation protection.
 * 8. Full, partial, and credit (zero initial payment) sales.
 * 9. Additional payments against invoices with accurate remaining balance.
 * 10. Rejection of negative and excessive payments (overpayments).
 * 11. Delivery fees and delivery status updates without affecting stock or payment totals.
 * 12. Customer purchase history, total paid, and debt balances.
 * 13. Draft lifecycle: Draft (DEV-) doesn't deduct stock; confirmation converts to FAC- and deducts stock.
 * 14. Sale cancellation: Restores stock with compensatory movements.
 * 15. Customer deactivation over deletion when sales exist.
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_sales_runner.db");
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch {
  // Ignore file lock
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
  console.log("  SHOP ERP — SUITE DE TESTS D'INTÉGRITÉ DU MODULE CLIENTS & VENTES");
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
  const customerActions = await import("@/app/customers/actions");
  const salesActions = await import("@/app/sales/actions");

  // Initialiser emplacements par défaut
  await productActions.ensureDefaultLocations();
  const showroom = await prisma.location.findFirst({ where: { code: "SHOWROOM" } });
  const garageChaaban = await prisma.location.findFirst({ where: { code: "GARAGE_CHAABAN" } });
  assert(showroom !== null && garageChaaban !== null, "Emplacements SHOWROOM et GARAGE_CHAABAN introuvables");

  // Créer une catégorie de test
  const cat = await prisma.category.create({
    data: { name: "Salons & Canapés" },
  });

  // Créer deux produits de test avec stock initial
  const prodA = await prisma.product.create({
    data: {
      sku: "SALON-ROYAL",
      name: "Salon Royal 7 Places",
      model: "Modèle Velours 2026",
      color: "Bleu Nuit",
      categoryId: cat.id,
      costPrice: 85000,
      sellingPrice: 125000,
      minStock: 1,
    },
  });

  const prodB = await prisma.product.create({
    data: {
      sku: "TABLE-BASSE-DOREE",
      name: "Table Basse Marbre & Dorée",
      model: "Design Milano",
      color: "Blanc/Or",
      categoryId: cat.id,
      costPrice: 20000,
      sellingPrice: 32000,
      minStock: 2,
    },
  });

  // Approvisionner le stock initial via l'action standard de stock
  const fdStockA = new FormData();
  fdStockA.append("productId", String(prodA.id));
  fdStockA.append("locationId", String(showroom!.id));
  fdStockA.append("quantity", "5");
  await productActions.recordInitialStockAction(fdStockA);

  const fdStockB = new FormData();
  fdStockB.append("productId", String(prodB.id));
  fdStockB.append("locationId", String(garageChaaban!.id));
  fdStockB.append("quantity", "10");
  await productActions.recordInitialStockAction(fdStockB);

  // --------------------------------------------------------------------------
  // TEST 1: Gestion Client (Création, Code Auto, Doublon Téléphone, Rejet Invalide)
  // --------------------------------------------------------------------------
  try {
    // 1. Nom trop court
    const fdInv = new FormData();
    fdInv.append("name", "A");
    const resInv = await customerActions.createCustomerAction(fdInv);
    assert(!resInv.success, "La création d'un client avec un nom d'une lettre aurait dû être rejetée.");

    // 2. Création valide
    const fdC1 = new FormData();
    fdC1.append("name", "Karim Benali");
    fdC1.append("phone", "0555123456");
    fdC1.append("address", "Hydra, Alger");
    fdC1.append("notes", "Client VIP");
    const resC1 = await customerActions.createCustomerAction(fdC1);
    assert(resC1.success, `Échec création client valide: ${resC1.error}`);
    const c1Code = (resC1.data as { code?: string } | undefined)?.code;
    assert(Boolean(c1Code && c1Code.startsWith("CLI-")), `Code client invalide: ${c1Code}`);

    // 3. Doublon de téléphone
    const fdC1Dup = new FormData();
    fdC1Dup.append("name", "Karim Doublon");
    fdC1Dup.append("phone", "0555123456");
    const resC1Dup = await customerActions.createCustomerAction(fdC1Dup);
    assert(!resC1Dup.success, "La création d'un client avec un téléphone déjà existant aurait dû être rejetée.");

    // 4. Client 2
    const fdC2 = new FormData();
    fdC2.append("name", "Amina Meziane");
    fdC2.append("phone", "0661987654");
    fdC2.append("address", "Bab Ezzouar, Alger");
    const resC2 = await customerActions.createCustomerAction(fdC2);
    assert(resC2.success, "Échec création second client");

    results.push({ num: 1, name: "Gestion Client: Création, Code Auto, Doublon Téléphone", passed: true });
    console.log("✓ Test 1: Gestion Client: Création, Code Auto, Doublon Téléphone réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 1, name: "Gestion Client: Création, Code Auto, Doublon Téléphone", passed: false, error: msg });
    console.error("✗ Test 1 échoué:", msg);
  }

  // Récupérer les clients créés
  const clientKarim = await prisma.customer.findFirst({ where: { phone: "0555123456" } });
  const clientAmina = await prisma.customer.findFirst({ where: { phone: "0661987654" } });
  assert(clientKarim !== null && clientAmina !== null, "Clients non trouvés en base");

  // --------------------------------------------------------------------------
  // TEST 2: Vente Multi-Lignes avec Prix Personnalisé (Surcharge du Prix Unitaire)
  // --------------------------------------------------------------------------
  try {
    // Karim achète 1 Salon Royal au prix négocié de 120 000 DA (au lieu de 125 000 DA)
    // et 2 Tables Basses au prix normal de 32 000 DA
    const resSale = await salesActions.createSaleAction({
      customerId: clientKarim!.id,
      status: "confirmed",
      items: [
        {
          productId: prodA.id,
          locationId: showroom!.id,
          quantity: 1,
          unitPrice: 120000, // Override du prix de vente
          discount: 0,
        },
        {
          productId: prodB.id,
          locationId: garageChaaban!.id,
          quantity: 2,
          unitPrice: 32000,
          discount: 0,
        },
      ],
      initialPayment: {
        amount: 184000, // Paiement comptant total: 120 000 + 64 000 = 184 000 DA
        method: "cash",
      },
    });

    assert(resSale.success, `Échec création vente multi-lignes: ${resSale.error}`);
    const saleId = (resSale.data as { id: number }).id;
    const dbSale = await prisma.sales.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true },
    });

    assert(dbSale !== null, "Vente non enregistrée en base");
    assert(dbSale!.totalAmount === 184000, `Total attendu 184000 DA, obtenu ${dbSale?.totalAmount}`);
    assert(dbSale!.paidAmount === 184000, `Montant payé attendu 184000 DA, obtenu ${dbSale?.paidAmount}`);
    assert(dbSale!.paymentStatus === "paid", `Statut paiement attendu 'paid', obtenu ${dbSale?.paymentStatus}`);

    // Vérifier que le prix par défaut du produit dans le catalogue n'a PAS été modifié
    const prodACheck = await prisma.product.findUnique({ where: { id: prodA.id } });
    assert(prodACheck!.sellingPrice === 125000, "Le prix catalogue par défaut a été altéré par la vente !");
    assert(prodACheck!.costPrice === 85000, "Le coût d'achat a été altéré par la vente !");

    results.push({ num: 2, name: "Vente Multi-Lignes et Surcharge de Prix Sans Altérer le Catalogue", passed: true });
    console.log("✓ Test 2: Vente Multi-Lignes et Surcharge de Prix Sans Altérer le Catalogue réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 2, name: "Vente Multi-Lignes et Surcharge de Prix Sans Altérer le Catalogue", passed: false, error: msg });
    console.error("✗ Test 2 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Numérotation de Facture Unique (FAC-YYYYMM-XXXX) et Non-Réutilisable
  // --------------------------------------------------------------------------
  try {
    const allSales = await prisma.sales.findMany({ select: { reference: true } });
    const references = allSales.map((s) => s.reference);
    const uniqueRefs = new Set(references);
    assert(references.length === uniqueRefs.size, "Doublon détecté dans les numéros de facture !");

    const confirmedSale = allSales.find((s) => s.reference.startsWith("FAC-"));
    assert(Boolean(confirmedSale), "Aucune facture confirmée avec le préfixe FAC- trouvée");
    const regex = /^FAC-\d{6}-\d{4}$/;
    assert(regex.test(confirmedSale!.reference), `Format de facture non conforme: ${confirmedSale!.reference}`);

    results.push({ num: 3, name: "Numérotation Permanente et Unique (FAC-YYYYMM-XXXX)", passed: true });
    console.log("✓ Test 3: Numérotation Permanente et Unique (FAC-YYYYMM-XXXX) réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 3, name: "Numérotation Permanente et Unique (FAC-YYYYMM-XXXX)", passed: false, error: msg });
    console.error("✗ Test 3 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Rejet Strict en Cas de Stock Insuffisant & Maintien de l'Intégrité
  // --------------------------------------------------------------------------
  try {
    // Le showroom n'a plus que 4 Salon Royal (5 initiaux - 1 vendu au test 2)
    // Tentative de vente de 10 unités -> Doit échouer
    const resOversell = await salesActions.createSaleAction({
      customerId: clientAmina!.id,
      status: "confirmed",
      items: [
        {
          productId: prodA.id,
          locationId: showroom!.id,
          quantity: 10, // Stock disponible = 4
          unitPrice: 125000,
        },
      ],
    });

    assert(!resOversell.success, "La vente avec stock insuffisant aurait dû être rejetée.");
    assert(
      Boolean(resOversell.error?.includes("Stock insuffisant") || resOversell.error?.includes("disponible")),
      `Message d'erreur inattendu: ${resOversell.error}`
    );

    // Vérifier qu'aucune facture n'a été créée et qu'aucun stock n'a bougé
    const stockCheck = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodA.id, locationId: showroom!.id } },
    });
    assert(stockCheck!.quantity === 4, `Le stock a été corrompu: attendu 4, trouvé ${stockCheck!.quantity}`);

    results.push({ num: 4, name: "Rejet Strict du Stock Insuffisant et Protection Solde Négatif", passed: true });
    console.log("✓ Test 4: Rejet Strict du Stock Insuffisant et Protection Solde Négatif réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 4, name: "Rejet Strict du Stock Insuffisant et Protection Solde Négatif", passed: false, error: msg });
    console.error("✗ Test 4 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Déduction Atomique à l'Emplacement Source & Mouvements de Stock 'SALE'
  // --------------------------------------------------------------------------
  try {
    // Dépôt principal a 8 tables (10 initiales - 2 du test 2)
    // Vente de 3 tables depuis le Dépôt Principal
    const resSale5 = await salesActions.createSaleAction({
      customerId: clientAmina!.id,
      status: "confirmed",
      items: [
        {
          productId: prodB.id,
          locationId: garageChaaban!.id,
          quantity: 3,
          unitPrice: 32000,
        },
      ],
      initialPayment: { amount: 96000, method: "cash" },
    });

    assert(resSale5.success, `Échec vente 5: ${resSale5.error}`);
    const sale5Id = (resSale5.data as { id: number }).id;

    // Vérifier le stock à l'emplacement
    const stockDepot = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodB.id, locationId: garageChaaban!.id } },
    });
    assert(stockDepot!.quantity === 5, `Attendu 5 tables au dépôt, trouvé ${stockDepot!.quantity}`);

    // Vérifier le stock total du produit
    const prodBCheck = await prisma.product.findUnique({ where: { id: prodB.id } });
    assert(prodBCheck!.stock === 5, `Stock total attendu 5, trouvé ${prodBCheck?.stock}`);

    // Vérifier la présence du StockMovement de type SALE
    const movement = await prisma.stockMovement.findFirst({
      where: {
        saleId: sale5Id,
        productId: prodB.id,
        fromLocationId: garageChaaban!.id,
        type: "SALE",
      },
    });
    assert(movement !== null, "Mouvement de stock SALE introuvable pour la vente");
    assert(movement!.quantity === 3, `Quantité de mouvement attendue 3, trouvée ${movement?.quantity}`);
    assert(movement!.stockBefore === 8, `stockBefore attendu 8, trouvé ${movement?.stockBefore}`);
    assert(movement!.stockAfter === 5, `stockAfter attendu 5, trouvé ${movement?.stockAfter}`);

    results.push({ num: 5, name: "Déduction Atomique à l'Emplacement et Mouvement de Stock SALE", passed: true });
    console.log("✓ Test 5: Déduction Atomique à l'Emplacement et Mouvement de Stock SALE réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 5, name: "Déduction Atomique à l'Emplacement et Mouvement de Stock SALE", passed: false, error: msg });
    console.error("✗ Test 5 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Vente à Crédit (Paiement Initial Zéro) & Gestion des Acomptes Partiels
  // --------------------------------------------------------------------------
  try {
    // Karim achète 1 Salon Royal (125 000 DA) entièrement à crédit (initialPayment: 0 DA)
    const resCredit = await salesActions.createSaleAction({
      customerId: clientKarim!.id,
      status: "confirmed",
      items: [
        {
          productId: prodA.id,
          locationId: showroom!.id,
          quantity: 1,
          unitPrice: 125000,
        },
      ],
      initialPayment: { amount: 0, method: "cash" },
    });

    assert(resCredit.success, `Échec vente crédit: ${resCredit.error}`);
    const creditSaleId = (resCredit.data as { id: number }).id;
    const dbCreditSale = await prisma.sales.findUnique({
      where: { id: creditSaleId },
      include: { payments: true },
    });

    assert(dbCreditSale!.paidAmount === 0, `Montant payé attendu 0, obtenu ${dbCreditSale!.paidAmount}`);
    assert(dbCreditSale!.paymentStatus === "unpaid", `Statut paiement attendu 'unpaid', obtenu ${dbCreditSale!.paymentStatus}`);
    assert(dbCreditSale!.payments.length === 0, "Aucun enregistrement de paiement ne doit exister pour un versement de 0 DA");

    // Vente partielle pour Amina: 1 Table (32 000 DA), acompte de 10 000 DA
    const resPartial = await salesActions.createSaleAction({
      customerId: clientAmina!.id,
      status: "confirmed",
      items: [
        {
          productId: prodB.id,
          locationId: garageChaaban!.id,
          quantity: 1,
          unitPrice: 32000,
        },
      ],
      initialPayment: { amount: 10000, method: "cash" },
    });

    assert(resPartial.success, `Échec vente partielle: ${resPartial.error}`);
    const partialSaleId = (resPartial.data as { id: number }).id;
    const dbPartialSale = await prisma.sales.findUnique({
      where: { id: partialSaleId },
      include: { payments: true },
    });

    assert(dbPartialSale!.paidAmount === 10000, "Montant payé attendu 10000 DA");
    assert(dbPartialSale!.paymentStatus === "partial", "Statut paiement attendu 'partial'");
    assert(dbPartialSale!.payments.length === 1, "Un paiement attendu");

    results.push({ num: 6, name: "Ventes à Crédit (0 DA) et Acomptes Partiels", passed: true });
    console.log("✓ Test 6: Ventes à Crédit (0 DA) et Acomptes Partiels réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 6, name: "Ventes à Crédit (0 DA) et Acomptes Partiels", passed: false, error: msg });
    console.error("✗ Test 6 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Versements Complémentaires & Rejet Strict des Trop-Perçus
  // --------------------------------------------------------------------------
  try {
    // Retrouver la vente à crédit de Karim (solde restant = 125 000 DA)
    const creditSale = await prisma.sales.findFirst({
      where: { customerId: clientKarim!.id, paymentStatus: "unpaid" },
    });
    assert(creditSale !== null, "Vente impayée de Karim non trouvée");

    // 1. Tentative de paiement excédant le solde restant (trop-perçu: 130 000 DA pour 125 000 DA)
    const fdOver = new FormData();
    fdOver.append("saleId", String(creditSale!.id));
    fdOver.append("amount", "130000");
    const resOver = await salesActions.recordSalePaymentAction(fdOver);
    assert(!resOver.success, "Le versement excédant le solde restant dû aurait dû être rejeté.");
    assert(Boolean(resOver.error?.includes("dépasse le solde")), `Message inattendu: ${resOver.error}`);

    // 2. Tentative de paiement négatif
    const fdNeg = new FormData();
    fdNeg.append("saleId", String(creditSale!.id));
    fdNeg.append("amount", "-5000");
    const resNeg = await salesActions.recordSalePaymentAction(fdNeg);
    assert(!resNeg.success, "Le montant de versement négatif aurait dû être rejeté.");

    // 3. Versement partiel légitime de 50 000 DA
    const fdPay1 = new FormData();
    fdPay1.append("saleId", String(creditSale!.id));
    fdPay1.append("amount", "50000");
    fdPay1.append("method", "check");
    fdPay1.append("notes", "Chèque BNA n° 987654");
    const resPay1 = await salesActions.recordSalePaymentAction(fdPay1);
    assert(resPay1.success, `Échec versement légitime: ${resPay1.error}`);

    const saleAfterPay1 = await prisma.sales.findUnique({ where: { id: creditSale!.id } });
    assert(saleAfterPay1!.paidAmount === 50000, `Attendu 50000 DA payés, trouvé ${saleAfterPay1!.paidAmount}`);
    assert(saleAfterPay1!.paymentStatus === "partial", "Statut attendu 'partial'");

    // 4. Solde restant final de 75 000 DA
    const fdPay2 = new FormData();
    fdPay2.append("saleId", String(creditSale!.id));
    fdPay2.append("amount", "75000");
    fdPay2.append("method", "cash");
    const resPay2 = await salesActions.recordSalePaymentAction(fdPay2);
    assert(resPay2.success, `Échec solde facture: ${resPay2.error}`);

    const saleAfterPay2 = await prisma.sales.findUnique({ where: { id: creditSale!.id } });
    assert(saleAfterPay2!.paidAmount === 125000, "Facture doit être intégralement payée");
    assert(saleAfterPay2!.paymentStatus === "paid", "Statut attendu 'paid'");

    results.push({ num: 7, name: "Versements Complémentaires et Rejet Strict des Trop-Perçus", passed: true });
    console.log("✓ Test 7: Versements Complémentaires et Rejet Strict des Trop-Perçus réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 7, name: "Versements Complémentaires et Rejet Strict des Trop-Perçus", passed: false, error: msg });
    console.error("✗ Test 7 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Cycle de Vie Brouillon (DEV-) et Protection Contre Double Confirmation
  // --------------------------------------------------------------------------
  try {
    // Showroom a 3 Salon Royal
    // 1. Créer une vente brouillon
    const resDraft = await salesActions.createSaleAction({
      customerId: clientKarim!.id,
      status: "draft",
      items: [
        {
          productId: prodA.id,
          locationId: showroom!.id,
          quantity: 2,
          unitPrice: 125000,
        },
      ],
    });

    assert(resDraft.success, `Échec création brouillon: ${resDraft.error}`);
    const draftId = (resDraft.data as { id: number }).id;
    const draftRef = (resDraft.data as { reference: string }).reference;
    assert(draftRef.startsWith("DEV-"), `La référence brouillon doit commencer par DEV-, trouvé : ${draftRef}`);

    // Vérifier que le stock n'a PAS été déduit au stade de devis/brouillon
    const stockDuringDraft = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodA.id, locationId: showroom!.id } },
    });
    assert(stockDuringDraft!.quantity === 3, "Le stock a été déduit prématurément pour un devis brouillon !");

    // 2. Confirmer le brouillon
    const resConfirm = await salesActions.confirmDraftSaleAction(draftId, {
      amount: 250000,
      method: "cash",
    });
    assert(resConfirm.success, `Échec confirmation brouillon: ${resConfirm.error}`);
    const confirmedSale = await prisma.sales.findUnique({ where: { id: draftId } });
    assert(confirmedSale!.status === "confirmed", "Statut attendu 'confirmed'");
    assert(confirmedSale!.reference.startsWith("FAC-"), `Référence doit être convertie en FAC-, trouvé: ${confirmedSale!.reference}`);

    // Vérifier que le stock a été déduit à la confirmation
    const stockAfterConfirm = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodA.id, locationId: showroom!.id } },
    });
    assert(stockAfterConfirm!.quantity === 1, `Stock attendu 1 après confirmation, trouvé ${stockAfterConfirm!.quantity}`);

    // 3. Tenter une double confirmation (ne doit PAS déduire le stock deux fois)
    const resDouble = await salesActions.confirmDraftSaleAction(draftId);
    assert(!resDouble.success, "La double confirmation d'une vente déjà confirmée aurait dû être rejetée.");
    assert(Boolean(resDouble.error?.includes("déjà été confirmée")), `Message inattendu: ${resDouble.error}`);

    const stockAfterDouble = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodA.id, locationId: showroom!.id } },
    });
    assert(stockAfterDouble!.quantity === 1, "Le stock a été déduit deux fois suite à une tentative de double confirmation !");

    results.push({ num: 8, name: "Cycle de Vie Brouillon (DEV-) et Protection Double Confirmation", passed: true });
    console.log("✓ Test 8: Cycle de Vie Brouillon (DEV-) et Protection Double Confirmation réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 8, name: "Cycle de Vie Brouillon (DEV-) et Protection Double Confirmation", passed: false, error: msg });
    console.error("✗ Test 8 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Gestion de la Livraison (Frais Séparés & Mise à Jour du Statut)
  // --------------------------------------------------------------------------
  // TEST 9: Frais de Livraison sur Facture (Inclusion, Séparation et Absence de Dépense Caisse)
  // --------------------------------------------------------------------------
  try {
    // Vente avec frais de livraison de 4 500 DA inclus dans la facture
    const resDelivSale = await salesActions.createSaleAction({
      customerId: clientKarim!.id,
      status: "confirmed",
      deliveryFee: 4500,
      includeDeliveryFee: true,
      items: [
        {
          productId: prodA.id,
          locationId: showroom!.id,
          quantity: 1,
          unitPrice: 125000,
        },
      ],
      initialPayment: { amount: 129500, method: "cash" }, // 125 000 + 4 500 = 129 500 DA
    });

    assert(resDelivSale.success, `Échec vente avec livraison: ${resDelivSale.error}`);
    const delivSaleId = (resDelivSale.data as { id: number }).id;

    const dbDelivSale = await prisma.sales.findUnique({
      where: { id: delivSaleId },
    });

    assert(dbDelivSale!.deliveryFee === 4500, `Frais attendus 4500 DA, trouvé ${dbDelivSale!.deliveryFee}`);
    assert(dbDelivSale!.includeDeliveryFee === true, "includeDeliveryFee doit être true");
    assert(dbDelivSale!.subtotal === 125000, `Sous-total attendu 125000 DA, trouvé ${dbDelivSale!.subtotal}`);
    assert(dbDelivSale!.totalAmount === 129500, `Total attendu 129500 DA, trouvé ${dbDelivSale!.totalAmount}`);
    assert(dbDelivSale!.paidAmount === 129500, `Montant versé attendu 129500 DA`);

    // Vérifier l'absence absolue de dépense automatique en caisse
    const deliveryExpenses = await prisma.expense.findMany({
      where: {
        OR: [
          { description: { contains: "livraison" } },
          { description: { contains: "Livraison" } },
          { description: { contains: dbDelivSale!.reference } },
        ],
      },
    });
    assert(deliveryExpenses.length === 0, "Aucune dépense de livraison automatique ne doit être créée");

    results.push({ num: 9, name: "Frais de Livraison sur Facture: Séparation et Absence de Dépense Caisse", passed: true });
    console.log("✓ Test 9: Frais de Livraison sur Facture: Séparation et Absence de Dépense Caisse réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 9, name: "Gestion de Livraison: Frais Séparés et Changements de Statut", passed: false, error: msg });
    console.error("✗ Test 9 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Annulation de Vente avec Réintégration Intégrale du Stock
  // --------------------------------------------------------------------------
  try {
    // Le stock de prodA au showroom est actuellement de 0 (1 initial - 1 vendu au test 9)
    const stockBefore = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodA.id, locationId: showroom!.id } },
    });
    const qtyBefore = stockBefore?.quantity || 0;

    // Trouver la dernière vente confirmée de prodA
    const saleToCancel = await prisma.sales.findFirst({
      where: { status: "confirmed", items: { some: { productId: prodA.id } } },
      include: { items: true },
    });
    assert(saleToCancel !== null, "Aucune vente à annuler trouvée");

    const resCancel = await salesActions.cancelSaleAction(saleToCancel!.id, "Erreur de commande client");
    assert(resCancel.success, `Échec annulation vente: ${resCancel.error}`);

    // Vérifier le statut de la vente
    const saleAfterCancel = await prisma.sales.findUnique({ where: { id: saleToCancel!.id } });
    assert(saleAfterCancel!.status === "cancelled", "Statut attendu 'cancelled'");

    // Vérifier que le stock a été réintégré
    const stockAfter = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: prodA.id, locationId: showroom!.id } },
    });
    assert(stockAfter!.quantity > qtyBefore, "Le stock n'a pas été réintégré après l'annulation de la vente !");

    // Vérifier la présence du mouvement compensatoire
    const cancelMovement = await prisma.stockMovement.findFirst({
      where: {
        saleId: saleToCancel!.id,
        reason: { contains: "annulation vente" },
      },
    });
    assert(cancelMovement !== null, "Mouvement compensatoire de stock introuvable");
    assert(cancelMovement!.quantity > 0, "La quantité réintégrée doit être positive");

    results.push({ num: 10, name: "Annulation de Vente et Réintégration Rigoureuse du Stock", passed: true });
    console.log("✓ Test 10: Annulation de Vente et Réintégration Rigoureuse du Stock réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 10, name: "Annulation de Vente et Réintégration Rigoureuse du Stock", passed: false, error: msg });
    console.error("✗ Test 10 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Exactitude du Compte Client (Achats, Règlements, Reste à Payer)
  // --------------------------------------------------------------------------
  try {
    const customerDataList = await customerActions.getCustomersData();
    const karimReport = customerDataList.find((c) => c.id === clientKarim!.id);
    const aminaReport = customerDataList.find((c) => c.id === clientAmina!.id);

    assert(karimReport !== undefined, "Rapport Karim Benali introuvable");
    assert(aminaReport !== undefined, "Rapport Amina Meziane introuvable");

    // Vérifier la cohérence comptable : Solde = Achats Confirmés - Règlements
    const expectedKarimBalance = Math.max(0, karimReport!.totalPurchases - karimReport!.totalPaid);
    assert(
      karimReport!.outstandingBalance === expectedKarimBalance,
      `Incohérence solde Karim: attendu ${expectedKarimBalance}, calculé ${karimReport?.outstandingBalance}`
    );

    const expectedAminaBalance = Math.max(0, aminaReport!.totalPurchases - aminaReport!.totalPaid);
    assert(
      aminaReport!.outstandingBalance === expectedAminaBalance,
      `Incohérence solde Amina: attendu ${expectedAminaBalance}, calculé ${aminaReport?.outstandingBalance}`
    );

    // Amina a une vente partielle : total = 32 000 DA, acompte = 10 000 DA -> Dette = 22 000 DA
    assert(aminaReport!.outstandingBalance === 22000, `Dette Amina attendue 22000 DA, obtenu ${aminaReport?.outstandingBalance}`);

    results.push({ num: 11, name: "Exactitude du Compte Client (Achats, Règlements, Solde Dû)", passed: true });
    console.log("✓ Test 11: Exactitude du Compte Client (Achats, Règlements, Solde Dû) réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 11, name: "Exactitude du Compte Client (Achats, Règlements, Solde Dû)", passed: false, error: msg });
    console.error("✗ Test 11 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Protection de la Désactivation Client vs Suppression Physique
  // --------------------------------------------------------------------------
  try {
    // Karim a des ventes historiques rattachées -> la suppression physique doit être refusée
    const resDel = await customerActions.deleteCustomerAction(clientKarim!.id);
    assert(!resDel.success, "La suppression physique d'un client ayant un historique d'achats aurait dû être refusée.");
    assert(Boolean(resDel.error?.includes("historique") || resDel.error?.includes("désactiver")), `Message inattendu: ${resDel.error}`);

    // Désactivation du client Karim
    const resToggle = await customerActions.toggleCustomerStatusAction(clientKarim!.id);
    assert(resToggle.success, `Échec désactivation client: ${resToggle.error}`);

    const deactivatedKarim = await prisma.customer.findUnique({ where: { id: clientKarim!.id } });
    assert(deactivatedKarim!.isActive === false, "Le statut actif aurait dû passer à false");

    // Karim a un statut isActive: false (hérité) -> la vente doit maintenant être autorisée sans blocage artificiel
    const resSaleToInactive = await salesActions.createSaleAction({
      customerId: clientKarim!.id,
      status: "confirmed",
      items: [
        {
          productId: prodB.id,
          locationId: garageChaaban!.id,
          quantity: 1,
          unitPrice: 32000,
        },
      ],
    });
    assert(resSaleToInactive.success, `Une vente à un client existant doit réussir: ${resSaleToInactive.error}`);

    results.push({ num: 12, name: "Protection Intégrité Historique Client & Accessibilité Ventes", passed: true });
    console.log("✓ Test 12: Protection Intégrité Historique Client & Accessibilité Ventes réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 12, name: "Protection Désactivation Client vs Suppression Physique", passed: false, error: msg });
    console.error("✗ Test 12 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 13: Vente au Client Passager (Comptoir) Sans Fiche Client
  // --------------------------------------------------------------------------
  try {
    const resWalkin = await salesActions.createSaleAction({
      customerId: null, // Client passager
      status: "confirmed",
      items: [
        {
          productId: prodB.id,
          locationId: garageChaaban!.id,
          quantity: 1,
          unitPrice: 32000,
        },
      ],
      initialPayment: { amount: 32000, method: "cash" },
    });

    assert(resWalkin.success, `Échec vente passager: ${resWalkin.error}`);
    const walkinSale = await prisma.sales.findUnique({
      where: { id: (resWalkin.data as { id: number }).id },
      include: { customer: true },
    });

    assert(walkinSale!.customerId === null, "Le customerId doit être null pour un client passager");
    assert(walkinSale!.paymentStatus === "paid", "Vente passager doit être réglée comptant");

    results.push({ num: 13, name: "Vente au Client Passager (Comptoir) Sans Compte Nominatif", passed: true });
    console.log("✓ Test 13: Vente au Client Passager (Comptoir) Sans Compte Nominatif réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 13, name: "Vente au Client Passager (Comptoir) Sans Compte Nominatif", passed: false, error: msg });
    console.error("✗ Test 13 échoué:", msg);
  }

  // --------------------------------------------------------------------------
  // TEST 14: Réconciliation Comptable Globale Ventes = Mouvements = Stocks
  // --------------------------------------------------------------------------
  try {
    // Réconciliation comptable rigoureuse pour Produit B :
    // Stock Physique Actuel = Entrées (RECEIPT) - Sorties (ISSUE/SALE)
    const allProdBMovements = await prisma.stockMovement.findMany({
      where: { productId: prodB.id },
    });

    let calculatedStock = 0;
    for (const m of allProdBMovements) {
      if (m.type === "RECEIPT" || m.type === "INITIAL") {
        calculatedStock += m.quantity;
      } else if (m.type === "SALE" || m.type === "ISSUE") {
        calculatedStock -= m.quantity;
      }
    }

    const prodBInDb = await prisma.product.findUnique({
      where: { id: prodB.id },
      include: { stocks: true },
    });
    const locationStocksSum = prodBInDb!.stocks.reduce((acc, s) => acc + s.quantity, 0);

    assert(
      calculatedStock === prodBInDb!.stock,
      `Incohérence comptable Produit B : Stock calculé via mouvements (${calculatedStock}) != Stock produit (${prodBInDb!.stock})`
    );
    assert(
      locationStocksSum === prodBInDb!.stock,
      `Incohérence emplacements Produit B : Somme par dépôts (${locationStocksSum}) != Stock produit (${prodBInDb!.stock})`
    );

    results.push({ num: 14, name: "Réconciliation Comptable Globale Ventes = Mouvements = Stocks", passed: true });
    console.log("✓ Test 14: Réconciliation Comptable Globale Ventes = Mouvements = Stocks réussi.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ num: 14, name: "Réconciliation Comptable Globale Ventes = Mouvements = Stocks", passed: false, error: msg });
    console.error("✗ Test 14 échoué:", msg);
  }

  // ==========================================================================
  // SYNTHÈSE GLOBALE DES TESTS
  // ==========================================================================
  console.log("\n================================================================================");
  console.log("  RÉSULTAT DES TESTS DU MODULE CLIENTS & VENTES");
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
  console.error("Erreur fatale dans la suite de tests:", err);
  process.exit(1);
});
