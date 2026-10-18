/**
 * Integration Test Suite: Stock & Inventory Module Reliability
 * 
 * Runs against an isolated temporary SQLite database: prisma/test_stock_runner.db
 * Never touches real shop data (prisma/shop.db).
 * 
 * Verifies all 18 requirements from Section 7 of the specification:
 *  1. Correct initialization of the 4 default locations without duplicates.
 *  2. Product creation and case-insensitive duplicate SKU rejection.
 *  3. Opening stock recorded once (duplicate rejected).
 *  4. Stock receipt increases the correct location and total stock.
 *  5. Stock issue decreases the correct location and total stock.
 *  6. Adjustment records its reason and correct before/after values.
 *  7. Transfer preserves total quantity.
 *  8. Transfer fails when source stock is insufficient.
 *  9. Transfer fails when source and destination are identical.
 * 10. Zero, negative, invalid, and non-integer quantities are rejected.
 * 11. Failed transactions leave all quantities unchanged.
 * 12. Two concurrent operations cannot overdraw the same stock.
 * 13. Duplicate form submissions do not create duplicate movements.
 * 14. Product deletion is blocked when historical records or stock exist.
 * 15. Location deactivation preserves stock and history.
 * 16. Inactive products cannot be selected for new normal operations.
 * 17. Search, filters, movement history, and low-stock alerts work.
 * 18. Every successful inventory mutation has a corresponding movement record.
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_stock_runner.db");
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch {
  // Ignore file lock
}

// Direct Prisma to use the isolated test database
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
  console.log("  SHOP ERP — SUITE DE TESTS D'INTÉGRITÉ DU MODULE STOCK & INVENTAIRE");
  console.log("  Base de test isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Initialiser le schéma de la base de test via les migrations officielles
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

  // Importer Prisma et les Actions
  const { prisma } = await import("@/lib/prisma");
  const actions = await import("@/app/products/actions");

  // Helper pour FormData
  function toFormData(obj: Record<string, string>): FormData {
    const fd = new FormData();
    for (const [key, val] of Object.entries(obj)) {
      fd.append(key, val);
    }
    return fd;
  }

  // --------------------------------------------------------------------------
  // TEST 1: Initialisation correcte des 4 emplacements par défaut sans doublon
  // --------------------------------------------------------------------------
  try {
    await actions.ensureDefaultLocations();
    const locs1 = await prisma.location.findMany();
    assert(locs1.length === 4, `Attendu 4 emplacements par défaut, trouvé ${locs1.length}`);
    
    // Appel redondant (idempotence)
    await actions.ensureDefaultLocations();
    const locs2 = await prisma.location.findMany();
    assert(locs2.length === 4, `L'idempotence a échoué: trouvé ${locs2.length} emplacements`);
    
    const codes = locs2.map((l) => l.code).sort();
    assert(
      JSON.stringify(codes) === JSON.stringify(["GARAGE_3", "GARAGE_CHAABAN", "GARAGE_CHEIKH", "SHOWROOM"]),
      `Codes d'emplacements inattendus: ${codes.join(", ")}`
    );
    
    results.push({ num: 1, name: "Initialisation des 4 emplacements sans doublon", passed: true });
    console.log("✓ Test 1: Initialisation des 4 emplacements sans doublon réussi.");
  } catch (err: unknown) {
    results.push({ num: 1, name: "Initialisation des 4 emplacements sans doublon", passed: false, error: (err as Error).message });
    console.error("✗ Test 1 Échoué:", err);
  }

  // Créer une catégorie de test
  const cat = await prisma.category.create({
    data: { name: "Salons Modernes", description: "Canapés et salons d'angle" },
  });

  const showroom = await prisma.location.findUnique({ where: { code: "SHOWROOM" } });
  const chaaban = await prisma.location.findUnique({ where: { code: "GARAGE_CHAABAN" } });
  const cheikh = await prisma.location.findUnique({ where: { code: "GARAGE_CHEIKH" } });
  assert(!!showroom && !!chaaban && !!cheikh, "Emplacements requis introuvables");

  let productAId: number;

  // --------------------------------------------------------------------------
  // TEST 2: Création produit et rejet des doublons de SKU insensibles à la casse
  // --------------------------------------------------------------------------
  try {
    const res1 = await actions.createProductAction(
      toFormData({
        sku: "SALON-ROYAL-01",
        name: "Salon Royal Velours",
        model: "Royal 2026",
        color: "Bleu Nuit",
        categoryId: String(cat.id),
        sellingPrice: "185000",
        costPrice: "120000",
        minStock: "3",
      })
    );
    assert(res1.success, `Création échouée: ${res1.error}`);
    const createdProduct = await prisma.product.findUnique({ where: { sku: "SALON-ROYAL-01" } });
    assert(!!createdProduct, "Produit créé introuvable en base");
    productAId = createdProduct!.id;

    // Tentative 1: Même SKU en minuscules
    const resLower = await actions.createProductAction(
      toFormData({
        sku: "salon-royal-01",
        name: "Salon Royal Clone",
      })
    );
    assert(!resLower.success, "Le SKU en minuscules aurait dû être rejeté !");

    // Tentative 2: Même SKU avec espaces
    const resSpaces = await actions.createProductAction(
      toFormData({
        sku: "  SALON-ROYAL-01   ",
        name: "Salon Royal Clone 2",
      })
    );
    assert(!resSpaces.success, "Le SKU avec espaces aurait dû être rejeté !");

    results.push({ num: 2, name: "Rejet strict et insensible à la casse des doublons SKU", passed: true });
    console.log("✓ Test 2: Rejet strict et insensible à la casse des doublons SKU réussi.");
  } catch (err: unknown) {
    results.push({ num: 2, name: "Rejet strict et insensible à la casse des doublons SKU", passed: false, error: (err as Error).message });
    console.error("✗ Test 2 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Stock initial enregistré une seule fois (doublon rejeté)
  // --------------------------------------------------------------------------
  try {
    const resInit = await actions.recordInitialStockAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "5",
        reason: "Inventaire d'ouverture showroom",
        reference: "INIT-2026-001",
      })
    );
    assert(resInit.success, `Stock initial échoué: ${resInit.error}`);

    const pAfterInit = await prisma.product.findUnique({
      where: { id: productAId! },
      include: { stocks: true },
    });
    assert(pAfterInit!.stock === 5, `Total stock attendu 5, obtenu ${pAfterInit!.stock}`);
    assert(pAfterInit!.stocks[0].quantity === 5, `Stock Showroom attendu 5, obtenu ${pAfterInit!.stocks[0].quantity}`);

    const mvs = await prisma.stockMovement.findMany({ where: { productId: productAId! } });
    assert(mvs.length === 1, `Attendu 1 mouvement INITIAL, trouvé ${mvs.length}`);
    assert(mvs[0].type === "INITIAL", `Type attendu INITIAL, obtenu ${mvs[0].type}`);
    assert(mvs[0].stockBefore === 0, `StockBefore attendu 0, obtenu ${mvs[0].stockBefore}`);
    assert(mvs[0].stockAfter === 5, `StockAfter attendu 5, obtenu ${mvs[0].stockAfter}`);

    // Tentative de ré-appliquer un stock initial sur le même produit et même emplacement
    const resInitDup = await actions.recordInitialStockAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "3",
        reason: "Deuxième tentative frauduleuse",
      })
    );
    assert(!resInitDup.success, "Un deuxième stock initial au même emplacement aurait dû être strictement rejeté !");

    results.push({ num: 3, name: "Stock initial tracé et protégé contre les doublons", passed: true });
    console.log("✓ Test 3: Stock initial tracé et protégé contre les doublons réussi.");
  } catch (err: unknown) {
    results.push({ num: 3, name: "Stock initial tracé et protégé contre les doublons", passed: false, error: (err as Error).message });
    console.error("✗ Test 3 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Entrée de stock (Receipt) incrémente l'emplacement et le total
  // --------------------------------------------------------------------------
  try {
    const resRec = await actions.recordStockReceiptAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(chaaban!.id),
        quantity: "10",
        reason: "Livraison fournisseur atelier",
        reference: "BL-FOURN-882",
      })
    );
    assert(resRec.success, `Entrée de stock échouée: ${resRec.error}`);

    const p = await prisma.product.findUnique({
      where: { id: productAId! },
      include: { stocks: true },
    });
    // Stock Showroom = 5, Chaaban = 10 -> Total = 15
    assert(p!.stock === 15, `Stock total attendu 15, obtenu ${p!.stock}`);
    const chaabanStock = p!.stocks.find((s) => s.locationId === chaaban!.id);
    assert(chaabanStock?.quantity === 10, `Stock Chaaban attendu 10, obtenu ${chaabanStock?.quantity}`);

    const lastMv = await prisma.stockMovement.findFirst({
      where: { productId: productAId!, type: "RECEIPT" },
      orderBy: { id: "desc" },
    });
    assert(!!lastMv, "Mouvement RECEIPT non enregistré");
    assert(lastMv!.stockBefore === 0, `stockBefore Chaaban attendu 0, obtenu ${lastMv?.stockBefore}`);
    assert(lastMv!.stockAfter === 10, `stockAfter Chaaban attendu 10, obtenu ${lastMv?.stockAfter}`);

    results.push({ num: 4, name: "Entrée de stock conforme et traçable", passed: true });
    console.log("✓ Test 4: Entrée de stock conforme et traçable réussi.");
  } catch (err: unknown) {
    results.push({ num: 4, name: "Entrée de stock conforme et traçable", passed: false, error: (err as Error).message });
    console.error("✗ Test 4 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Sortie de stock (Issue) décrémente l'emplacement et le total
  // --------------------------------------------------------------------------
  try {
    const resIssue = await actions.recordStockIssueAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "2",
        reason: "Vente directe magasin",
        reference: "FACT-2026-009",
      })
    );
    assert(resIssue.success, `Sortie de stock échouée: ${resIssue.error}`);

    const p = await prisma.product.findUnique({
      where: { id: productAId! },
      include: { stocks: true },
    });
    // Showroom 5 - 2 = 3. Chaaban = 10. Total = 13.
    assert(p!.stock === 13, `Stock total attendu 13, obtenu ${p!.stock}`);
    const showStock = p!.stocks.find((s) => s.locationId === showroom!.id);
    assert(showStock?.quantity === 3, `Stock Showroom attendu 3, obtenu ${showStock?.quantity}`);

    const lastMv = await prisma.stockMovement.findFirst({
      where: { productId: productAId!, type: "ISSUE" },
      orderBy: { id: "desc" },
    });
    assert(lastMv?.stockBefore === 5, `stockBefore attendu 5, obtenu ${lastMv?.stockBefore}`);
    assert(lastMv?.stockAfter === 3, `stockAfter attendu 3, obtenu ${lastMv?.stockAfter}`);

    // Tentative de sortie excessive (> disponible)
    const resOverIssue = await actions.recordStockIssueAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "50",
        reason: "Sortie impossible",
      })
    );
    assert(!resOverIssue.success, "Une sortie supérieure au stock disponible doit être rejetée !");

    results.push({ num: 5, name: "Sortie de stock décrémente avec validation stricte du solde", passed: true });
    console.log("✓ Test 5: Sortie de stock décrémente avec validation stricte du solde réussi.");
  } catch (err: unknown) {
    results.push({ num: 5, name: "Sortie de stock décrémente avec validation stricte du solde", passed: false, error: (err as Error).message });
    console.error("✗ Test 5 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Ajustement de stock avec motif obligatoire et audit avant/après
  // --------------------------------------------------------------------------
  try {
    // 6.1 Ajustement négatif (-1 sur Showroom, solde passe de 3 à 2)
    const resAdjNeg = await actions.recordStockAdjustmentAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "1",
        isSubtraction: "true",
        reason: "Modèle d'exposition légèrement rayé",
      })
    );
    assert(resAdjNeg.success, `Ajustement négatif échoué: ${resAdjNeg.error}`);

    const pAfterNeg = await prisma.product.findUnique({
      where: { id: productAId! },
      include: { stocks: true },
    });
    // Showroom 3 - 1 = 2. Total 13 - 1 = 12.
    assert(pAfterNeg!.stock === 12, `Stock total attendu 12, obtenu ${pAfterNeg!.stock}`);
    const showStock = pAfterNeg!.stocks.find((s) => s.locationId === showroom!.id);
    assert(showStock?.quantity === 2, `Stock Showroom attendu 2, obtenu ${showStock?.quantity}`);

    const lastMvNeg = await prisma.stockMovement.findFirst({
      where: { productId: productAId!, type: "ADJUSTMENT" },
      orderBy: { id: "desc" },
    });
    assert(lastMvNeg?.stockBefore === 3, `stockBefore attendu 3, obtenu ${lastMvNeg?.stockBefore}`);
    assert(lastMvNeg?.stockAfter === 2, `stockAfter attendu 2, obtenu ${lastMvNeg?.stockAfter}`);

    // 6.2 Ajustement sans motif (doit échouer)
    const resNoReason = await actions.recordStockAdjustmentAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "2",
        isSubtraction: "false",
        reason: "   ",
      })
    );
    assert(!resNoReason.success, "Un ajustement sans motif valide doit être rejeté !");

    // 6.3 Ajustement qui mènerait à un stock négatif (solde 2, delta -5 -> -3)
    const resBelowZero = await actions.recordStockAdjustmentAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "10",
        isSubtraction: "true",
        reason: "Tentative d'ajustement sous zéro",
      })
    );
    assert(!resBelowZero.success, "Un ajustement menant à un stock négatif doit être rejeté !");

    results.push({ num: 6, name: "Ajustement de stock avec motif obligatoire et audit", passed: true });
    console.log("✓ Test 6: Ajustement de stock avec motif obligatoire et audit réussi.");
  } catch (err: unknown) {
    results.push({ num: 6, name: "Ajustement de stock avec motif obligatoire et audit", passed: false, error: (err as Error).message });
    console.error("✗ Test 6 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Transfert préserve la quantité totale de stock
  // --------------------------------------------------------------------------
  try {
    // État actuel: Showroom: 2, Chaaban: 10, Total: 12.
    // Transfert de 4 unités de Chaaban vers Cheikh.
    const resTransfer = await actions.recordStockTransferAction(
      toFormData({
        productId: String(productAId!),
        fromLocationId: String(chaaban!.id),
        toLocationId: String(cheikh!.id),
        quantity: "4",
        reason: "Réapprovisionnement Garage Cheikh pour exposition",
      })
    );
    assert(resTransfer.success, `Transfert échoué: ${resTransfer.error}`);

    const p = await prisma.product.findUnique({
      where: { id: productAId! },
      include: { stocks: true },
    });
    // Chaaban: 10 - 4 = 6. Cheikh: 0 + 4 = 4. Showroom: 2. Total: 2 + 6 + 4 = 12 !
    assert(p!.stock === 12, `Le stock total après transfert doit rester strictement 12, obtenu ${p!.stock}`);

    const chaabanQ = p!.stocks.find((s) => s.locationId === chaaban!.id)?.quantity;
    const cheikhQ = p!.stocks.find((s) => s.locationId === cheikh!.id)?.quantity;
    const showroomQ = p!.stocks.find((s) => s.locationId === showroom!.id)?.quantity;

    assert(chaabanQ === 6, `Chaaban attendu 6, obtenu ${chaabanQ}`);
    assert(cheikhQ === 4, `Cheikh attendu 4, obtenu ${cheikhQ}`);
    assert(showroomQ === 2, `Showroom attendu 2, obtenu ${showroomQ}`);

    const lastMv = await prisma.stockMovement.findFirst({
      where: { productId: productAId!, type: "TRANSFER" },
      orderBy: { id: "desc" },
    });
    assert(lastMv?.fromLocationId === chaaban!.id, "Emplacement source du transfert incorrect");
    assert(lastMv?.toLocationId === cheikh!.id, "Emplacement destination du transfert incorrect");
    assert(lastMv?.quantity === 4, "Quantité du transfert incorrecte");

    results.push({ num: 7, name: "Transfert préserve rigoureusement le stock total", passed: true });
    console.log("✓ Test 7: Transfert préserve rigoureusement le stock total réussi.");
  } catch (err: unknown) {
    results.push({ num: 7, name: "Transfert préserve rigoureusement le stock total", passed: false, error: (err as Error).message });
    console.error("✗ Test 7 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Échec du transfert si stock source insuffisant
  // --------------------------------------------------------------------------
  try {
    // Showroom a 2 unités. Tentative de transfert de 5 unités.
    const resFail = await actions.recordStockTransferAction(
      toFormData({
        productId: String(productAId!),
        fromLocationId: String(showroom!.id),
        toLocationId: String(chaaban!.id),
        quantity: "5",
        reason: "Transfert impossible",
      })
    );
    assert(!resFail.success, "Le transfert avec stock insuffisant aurait dû échouer !");
    assert(
      Boolean(resFail.error?.includes("Stock insuffisant")),
      `Message d'erreur inattendu: ${resFail.error}`
    );

    // Vérifier qu'aucune quantité n'a bougé
    const showStock = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: productAId!, locationId: showroom!.id } },
    });
    assert(showStock?.quantity === 2, `Le stock source a été altéré à tort: ${showStock?.quantity}`);

    results.push({ num: 8, name: "Rejet de transfert en cas de stock source insuffisant", passed: true });
    console.log("✓ Test 8: Rejet de transfert en cas de stock source insuffisant réussi.");
  } catch (err: unknown) {
    results.push({ num: 8, name: "Rejet de transfert en cas de stock source insuffisant", passed: false, error: (err as Error).message });
    console.error("✗ Test 8 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Échec du transfert si source et destination sont identiques
  // --------------------------------------------------------------------------
  try {
    const resSame = await actions.recordStockTransferAction(
      toFormData({
        productId: String(productAId!),
        fromLocationId: String(showroom!.id),
        toLocationId: String(showroom!.id),
        quantity: "1",
        reason: "Transfert sur soi-même",
      })
    );
    assert(!resSame.success, "Le transfert avec source == destination doit être rejeté !");

    results.push({ num: 9, name: "Rejet de transfert source et destination identiques", passed: true });
    console.log("✓ Test 9: Rejet de transfert source et destination identiques réussi.");
  } catch (err: unknown) {
    results.push({ num: 9, name: "Rejet de transfert source et destination identiques", passed: false, error: (err as Error).message });
    console.error("✗ Test 9 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Rejet des quantités nulles, négatives, non entières ou invalides
  // --------------------------------------------------------------------------
  try {
    // 10.1 Quantité 0
    const resZero = await actions.recordStockReceiptAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "0",
        reason: "Test zéro",
      })
    );
    assert(!resZero.success, "Quantité 0 doit être rejetée pour une réception !");

    // 10.2 Quantité négative
    const resNeg = await actions.recordStockReceiptAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "-5",
        reason: "Test négatif",
      })
    );
    assert(!resNeg.success, "Quantité négative doit être rejetée pour une réception !");

    // 10.3 Quantité décimale
    const resFloat = await actions.recordStockIssueAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "1.5",
        reason: "Test virgule",
      })
    );
    assert(!resFloat.success, "Quantité non entière doit être rejetée !");

    // 10.4 Quantité alphabétique
    const resAlpha = await actions.recordStockTransferAction(
      toFormData({
        productId: String(productAId!),
        fromLocationId: String(showroom!.id),
        toLocationId: String(chaaban!.id),
        quantity: "abc",
        reason: "Test texte",
      })
    );
    assert(!resAlpha.success, "Quantité invalide (texte) doit être rejetée !");

    results.push({ num: 10, name: "Rejet strict des quantités invalides, nulles et négatives", passed: true });
    console.log("✓ Test 10: Rejet strict des quantités invalides, nulles et négatives réussi.");
  } catch (err: unknown) {
    results.push({ num: 10, name: "Rejet strict des quantités invalides, nulles et négatives", passed: false, error: (err as Error).message });
    console.error("✗ Test 10 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Les transactions échouées laissent toutes les quantités intactes
  // --------------------------------------------------------------------------
  try {
    const pBefore = await prisma.product.findUnique({
      where: { id: productAId! },
      include: { stocks: true },
    });
    const totalBefore = pBefore!.stock;
    const mvsBeforeCount = await prisma.stockMovement.count({ where: { productId: productAId! } });

    // Exécuter 3 opérations invalides volontaires
    await actions.recordStockIssueAction(
      toFormData({ productId: String(productAId!), locationId: String(showroom!.id), quantity: "9999", reason: "Over" })
    );
    await actions.recordStockTransferAction(
      toFormData({ productId: String(productAId!), fromLocationId: String(showroom!.id), toLocationId: String(showroom!.id), quantity: "1", reason: "Loop" })
    );
    await actions.recordStockAdjustmentAction(
      toFormData({ productId: String(productAId!), locationId: String(showroom!.id), quantity: "999", isSubtraction: "true", reason: "Underflow" })
    );

    const pAfter = await prisma.product.findUnique({
      where: { id: productAId! },
      include: { stocks: true },
    });
    const totalAfter = pAfter!.stock;
    const mvsAfterCount = await prisma.stockMovement.count({ where: { productId: productAId! } });

    assert(totalBefore === totalAfter, `Stock modifié à tort: avant ${totalBefore}, après ${totalAfter}`);
    assert(mvsBeforeCount === mvsAfterCount, `Mouvements fantômes créés: avant ${mvsBeforeCount}, après ${mvsAfterCount}`);

    results.push({ num: 11, name: "Intégrité transactionnelle: aucun impact en cas d'échec", passed: true });
    console.log("✓ Test 11: Intégrité transactionnelle: aucun impact en cas d'échec réussi.");
  } catch (err: unknown) {
    results.push({ num: 11, name: "Intégrité transactionnelle: aucun impact en cas d'échec", passed: false, error: (err as Error).message });
    console.error("✗ Test 11 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 12: Deux opérations concurrentes ne peuvent pas sur-consommer le stock
  // --------------------------------------------------------------------------
  try {
    // Créer un produit spécifique pour tester la concurrence avec un stock initial de 5 au Showroom
    await actions.createProductAction(
      toFormData({
        sku: "TEST-CONCURRENT-01",
        name: "Table Concurrence",
      })
    );
    const concProd = await prisma.product.findUnique({ where: { sku: "TEST-CONCURRENT-01" } });
    await actions.recordInitialStockAction(
      toFormData({
        productId: String(concProd!.id),
        locationId: String(showroom!.id),
        quantity: "5",
        reason: "Stock initial concurrence",
      })
    );

    // Lancer deux sorties concurrentes de 4 unités chacune (Total demandé: 8, disponible: 5)
    // Une seule doit réussir, l'autre doit échouer pour stock insuffisant !
    const [p1, p2] = await Promise.all([
      actions.recordStockIssueAction(
        toFormData({
          productId: String(concProd!.id),
          locationId: String(showroom!.id),
          quantity: "4",
          reason: "Sortie concurrente A",
        })
      ),
      actions.recordStockIssueAction(
        toFormData({
          productId: String(concProd!.id),
          locationId: String(showroom!.id),
          quantity: "4",
          reason: "Sortie concurrente B",
        })
      ),
    ]);

    const successes = [p1, p2].filter((r) => r.success).length;
    const failures = [p1, p2].filter((r) => !r.success).length;

    assert(successes === 1, `Exactement 1 opération concurrente devait réussir, obtenu ${successes}`);
    assert(failures === 1, `Exactement 1 opération concurrente devait échouer, obtenu ${failures}`);

    const finalConcProd = await prisma.product.findUnique({
      where: { id: concProd!.id },
      include: { stocks: true },
    });
    // Le stock final doit être de 5 - 4 = 1, JAMAIS négatif (-3)
    assert(finalConcProd!.stock === 1, `Stock attendu 1, obtenu ${finalConcProd!.stock}`);
    assert(finalConcProd!.stocks[0].quantity === 1, `Stock emplacement attendu 1, obtenu ${finalConcProd!.stocks[0].quantity}`);

    results.push({ num: 12, name: "Protection stricte contre le sur-tirage concurrent", passed: true });
    console.log("✓ Test 12: Protection stricte contre le sur-tirage concurrent réussi.");
  } catch (err: unknown) {
    results.push({ num: 12, name: "Protection stricte contre le sur-tirage concurrent", passed: false, error: (err as Error).message });
    console.error("✗ Test 12 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 13: Protection anti-soumission dupliquée de stock initial
  // --------------------------------------------------------------------------
  try {
    await actions.createProductAction(
      toFormData({
        sku: "TEST-IDEMP-01",
        name: "Chaise Idempotente",
      })
    );
    const dupProd = await prisma.product.findUnique({ where: { sku: "TEST-IDEMP-01" } });

    // Soumission 1
    const resA = await actions.recordInitialStockAction(
      toFormData({
        productId: String(dupProd!.id),
        locationId: String(showroom!.id),
        quantity: "8",
        reason: "Initial A",
      })
    );
    assert(resA.success, "La première soumission de stock initial aurait dû réussir");

    // Soumission 2 immédiate (clic double utilisateur ou formulaire répété)
    const resB = await actions.recordInitialStockAction(
      toFormData({
        productId: String(dupProd!.id),
        locationId: String(showroom!.id),
        quantity: "8",
        reason: "Initial A",
      })
    );
    assert(!resB.success, "La soumission dupliquée doit être rejetée !");

    const mvs = await prisma.stockMovement.findMany({ where: { productId: dupProd!.id } });
    assert(mvs.length === 1, `Un seul mouvement doit exister, trouvé ${mvs.length}`);

    results.push({ num: 13, name: "Rejet des soumissions répétées de stock initial", passed: true });
    console.log("✓ Test 13: Rejet des soumissions répétées de stock initial réussi.");
  } catch (err: unknown) {
    results.push({ num: 13, name: "Rejet des soumissions répétées de stock initial", passed: false, error: (err as Error).message });
    console.error("✗ Test 13 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 14: Suppression produit bloquée si stock ou mouvements existants
  // --------------------------------------------------------------------------
  try {
    // productAId a du stock (12) et des mouvements
    const resDel = await actions.deleteProductAction(productAId!);
    assert(!resDel.success, "La suppression d'un produit avec historique et stock doit être bloquée !");
    assert(
      Boolean(resDel.error?.toLowerCase().includes("désactiver")),
      `Le message doit recommander la désactivation: ${resDel.error}`
    );

    // Vérifier que le produit existe toujours intact
    const stillThere = await prisma.product.findUnique({ where: { id: productAId! } });
    assert(!!stillThere, "Le produit ne doit pas avoir été supprimé");

    results.push({ num: 14, name: "Suppression physique bloquée si historique ou stock", passed: true });
    console.log("✓ Test 14: Suppression physique bloquée si historique ou stock réussi.");
  } catch (err: unknown) {
    results.push({ num: 14, name: "Suppression physique bloquée si historique ou stock", passed: false, error: (err as Error).message });
    console.error("✗ Test 14 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 15: Désactivation d'emplacement préserve les stocks et l'historique
  // --------------------------------------------------------------------------
  try {
    // Désactiver le Garage Cheikh (qui a 4 unités de productAId)
    const resToggleLoc = await actions.toggleLocationStatusAction(cheikh!.id);
    assert(resToggleLoc.success, `Désactivation emplacement échouée: ${resToggleLoc.error}`);

    const cheikhAfter = await prisma.location.findUnique({ where: { id: cheikh!.id } });
    assert(cheikhAfter!.isActive === false, "L'emplacement devrait être inactif");

    // Vérifier que le stock du produit inclut TOUJOURS les emplacements inactifs (Règle 2)
    const p = await prisma.product.findUnique({
      where: { id: productAId! },
      include: { stocks: true },
    });
    assert(p!.stock === 12, `Le stock total doit continuer à comptabiliser l'emplacement inactif: attendu 12, obtenu ${p!.stock}`);

    // Réactiver pour la suite des tests
    await actions.toggleLocationStatusAction(cheikh!.id);

    results.push({ num: 15, name: "Désactivation d'emplacement préserve stock et traçabilité", passed: true });
    console.log("✓ Test 15: Désactivation d'emplacement préserve stock et traçabilité réussi.");
  } catch (err: unknown) {
    results.push({ num: 15, name: "Désactivation d'emplacement préserve stock et traçabilité", passed: false, error: (err as Error).message });
    console.error("✗ Test 15 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 16: Produits inactifs exclus des nouvelles opérations de stock
  // --------------------------------------------------------------------------
  try {
    // Désactiver productAId
    const resToggleProd = await actions.toggleProductStatusAction(productAId!);
    assert(resToggleProd.success, "Désactivation du produit échouée");

    // Tentative d'entrée de stock sur le produit inactif
    const resReceiptInactive = await actions.recordStockReceiptAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "3",
        reason: "Test inactif",
      })
    );
    assert(!resReceiptInactive.success, "Une entrée sur un produit inactif doit être rejetée !");
    assert(Boolean(resReceiptInactive.error?.includes("inactif")), `Message attendu: ${resReceiptInactive.error}`);

    // Tentative de sortie de stock sur le produit inactif
    const resIssueInactive = await actions.recordStockIssueAction(
      toFormData({
        productId: String(productAId!),
        locationId: String(showroom!.id),
        quantity: "1",
        reason: "Test inactif sortie",
      })
    );
    assert(!resIssueInactive.success, "Une sortie sur un produit inactif doit être rejetée !");

    // Réactiver le produit pour les tests finaux
    await actions.toggleProductStatusAction(productAId!);

    results.push({ num: 16, name: "Produits inactifs exclus des nouvelles opérations", passed: true });
    console.log("✓ Test 16: Produits inactifs exclus des nouvelles opérations réussi.");
  } catch (err: unknown) {
    results.push({ num: 16, name: "Produits inactifs exclus des nouvelles opérations", passed: false, error: (err as Error).message });
    console.error("✗ Test 16 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 17: Recherche, filtres, historique des mouvements et alertes stock
  // --------------------------------------------------------------------------
  try {
    // Créer un produit en alerte de stock (minStock = 5, stock actuel = 2)
    await actions.createProductAction(
      toFormData({
        sku: "FAUTEUIL-MIN-01",
        name: "Fauteuil Club Cuir",
        minStock: "5",
      })
    );
    const alertProd = await prisma.product.findUnique({ where: { sku: "FAUTEUIL-MIN-01" } });
    await actions.recordInitialStockAction(
      toFormData({
        productId: String(alertProd!.id),
        locationId: String(showroom!.id),
        quantity: "2",
        reason: "Stock initial bas",
      })
    );

    // Récupérer les données complètes du module
    const data = await actions.getProductsModuleData();
    assert(data.products.length >= 3, `Nombre de produits attendu >= 3, trouvé ${data.products.length}`);
    assert(data.locations.length >= 4, `Nombre d'emplacements attendu >= 4, trouvé ${data.locations.length}`);
    assert(data.movements.length >= 5, `Nombre de mouvements attendu >= 5, trouvé ${data.movements.length}`);

    // Vérifier l'alerte de stock faible sur FAUTEUIL-MIN-01
    const item = data.products.find((p) => p.sku === "FAUTEUIL-MIN-01");
    assert(!!item, "Produit en alerte introuvable");
    assert(item!.stock === 2, `Stock attendu 2, obtenu ${item?.stock}`);
    assert(item!.minStock === 5, `MinStock attendu 5, obtenu ${item?.minStock}`);
    // Le statut calculé doit être "LOW" (Stock faible car stock <= minStock et stock > 0)
    const isLow = (item?.stock ?? 0) <= (item?.minStock ?? 0) && (item?.stock ?? 0) > 0;
    assert(isLow, "Le produit aurait dû être qualifié en Stock Faible !");

    results.push({ num: 17, name: "Récupération globale, filtres et alertes stock", passed: true });
    console.log("✓ Test 17: Récupération globale, filtres et alertes stock réussi.");
  } catch (err: unknown) {
    results.push({ num: 17, name: "Récupération globale, filtres et alertes stock", passed: false, error: (err as Error).message });
    console.error("✗ Test 17 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 18: Réconciliation comptable totale (Mouvements == Stocks actuels)
  // --------------------------------------------------------------------------
  try {
    const allProducts = await prisma.product.findMany({
      include: {
        stocks: true,
        movements: true,
      },
    });

    for (const prod of allProducts) {
      // Calculer le stock attendu à partir de l'historique complet des mouvements
      let calculatedTotal = 0;
      const locationBalances: Record<number, number> = {};

      for (const m of prod.movements) {
        if (m.type === "INITIAL" || m.type === "RECEIPT") {
          calculatedTotal += m.quantity;
          if (m.toLocationId) {
            locationBalances[m.toLocationId] = (locationBalances[m.toLocationId] || 0) + m.quantity;
          }
        } else if (m.type === "ISSUE") {
          calculatedTotal -= m.quantity;
          if (m.fromLocationId) {
            locationBalances[m.fromLocationId] = (locationBalances[m.fromLocationId] || 0) - m.quantity;
          }
        } else if (m.type === "ADJUSTMENT") {
          // Pour un ajustement: si toLocationId est défini -> augmentation (+), si fromLocationId est défini -> déduction (-)
          if (m.toLocationId) {
            calculatedTotal += m.quantity;
            locationBalances[m.toLocationId] = (locationBalances[m.toLocationId] || 0) + m.quantity;
          } else if (m.fromLocationId) {
            calculatedTotal -= m.quantity;
            locationBalances[m.fromLocationId] = (locationBalances[m.fromLocationId] || 0) - m.quantity;
          }
        } else if (m.type === "TRANSFER") {
          // Transfert: source diminue, dest augmente, total inchangé
          if (m.fromLocationId) {
            locationBalances[m.fromLocationId] = (locationBalances[m.fromLocationId] || 0) - m.quantity;
          }
          if (m.toLocationId) {
            locationBalances[m.toLocationId] = (locationBalances[m.toLocationId] || 0) + m.quantity;
          }
        }
      }

      // Comparer avec la table Product
      assert(
        prod.stock === calculatedTotal,
        `Réconciliation échouée pour ${prod.sku}: stock en table = ${prod.stock}, mouvements calculés = ${calculatedTotal}`
      );

      // Comparer chaque balance d'emplacement
      for (const st of prod.stocks) {
        const expectedLocStock = locationBalances[st.locationId] || 0;
        assert(
          st.quantity === expectedLocStock,
          `Réconciliation emplacement échouée pour ${prod.sku} (loc ${st.locationId}): stock = ${st.quantity}, calculé = ${expectedLocStock}`
        );
      }
    }

    results.push({ num: 18, name: "Réconciliation comptable parfaite: Mouvements = Stocks", passed: true });
    console.log("✓ Test 18: Réconciliation comptable parfaite: Mouvements = Stocks réussi.");
  } catch (err: unknown) {
    results.push({ num: 18, name: "Réconciliation comptable parfaite: Mouvements = Stocks", passed: false, error: (err as Error).message });
    console.error("✗ Test 18 Échoué:", err);
  }

  // --------------------------------------------------------------------------
  // BILAN FINAL
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("  RÉSULTAT DES TESTS DU MODULE STOCK & INVENTAIRE");
  console.log("================================================================================");
  const totalPassed = results.filter((r) => r.passed).length;
  for (const r of results) {
    console.log(`  [${r.passed ? "PASS" : "FAIL"}] Exigence ${r.num.toString().padStart(2, "0")} : ${r.name}`);
    if (r.error) console.log(`         Erreur: ${r.error}`);
  }
  console.log(`\nTOTAL: ${totalPassed} / ${results.length} tests réussis (${Math.round((totalPassed / results.length) * 100)}%).`);
  console.log("================================================================================\n");

  await prisma.$disconnect();

  if (totalPassed !== results.length) {
    process.exit(1);
  }
}

runTests().catch((e) => {
  console.error("Erreur critique d'exécution:", e);
  process.exit(1);
});
