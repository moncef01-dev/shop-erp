/**
 * Integration Test Suite: Achats & Fournisseurs Module
 *
 * Runs against an isolated temporary SQLite database: prisma/test_purchases_runner.db
 * Preserves the real database (prisma/shop.db) completely untouched.
 *
 * Covers:
 * 1. Supplier creation, sequential reference generation (FOU-0001, FOU-0002), duplicate phone rejection.
 * 2. Supplier editing, active/inactive toggle, and deletion rejection when purchases exist.
 * 3. Multi-line purchase order creation with custom unit costs (product cost price preserved).
 * 4. Draft order verification: creating draft or ordered order does NOT increase stock.
 * 5. Partial goods receipt: updates target location stock exactly once, creates StockMovement (RECEIPT) with stockBefore/stockAfter.
 * 6. Full goods receipt: completes order receipt status and keeps stock reconciled.
 * 7. Multi-location receipts: goods received into SHOWROOM vs GARAGE_CHAABAN increment respective location stock.
 * 8. Over-receipt protection: rejecting quantities exceeding remaining ordered quantity.
 * 9. Atomic transaction rollback: error in one line does not leave partial stock changes.
 * 10. Duplicate/repeat receipt protection: repeated receipt of remaining 0 is rejected.
 * 11. Supplier payments: full, partial, and additional payments reduce debt accurately.
 * 12. Payment validation: rejection of 0, negative, and excessive payments (overpayment protection).
 * 13. Purchase order cancellation: compensatory stock deduction (ISSUE) with audit trail, preventing negative stock.
 * 14. Supplier balances and payment statuses reconcile accurately from authoritative DB records.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_purchases_runner.db");
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
  console.log("  SHOP ERP — SUITE DE TESTS D'INTÉGRITÉ DU MODULE ACHATS & FOURNISSEURS");
  console.log("  Base de test isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Initialiser la base de test avec toutes les migrations
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
  console.log("✓ Schéma et migrations (dont achats & fournisseurs) appliqués à la base isolée.\n");

  const { prisma } = await import("@/lib/prisma");
  const productActions = await import("@/app/products/actions");
  const purchaseActions = await import("@/app/purchases/actions");

  // Initialiser les emplacements de stock
  await productActions.ensureDefaultLocations();
  const showroom = await prisma.location.findFirst({ where: { code: "SHOWROOM" } });
  const garageChaaban = await prisma.location.findFirst({ where: { code: "GARAGE_CHAABAN" } });
  assert(showroom !== null && garageChaaban !== null, "Emplacements SHOWROOM et GARAGE_CHAABAN introuvables.");

  // Créer une catégorie et des produits de test
  const cat = await prisma.category.create({
    data: { name: "Salons & Canapés Test", description: "Catégorie de test pour les achats" },
  });

  const productA = await prisma.product.create({
    data: {
      name: "Canapé 3 Places Cuir Brun",
      sku: "CAN-BRUN-01",
      model: "Chesterfield",
      color: "Brun",
      costPrice: 40000,
      sellingPrice: 75000,
      stock: 0,
      categoryId: cat.id,
      isActive: true,
    },
  });

  const productB = await prisma.product.create({
    data: {
      name: "Fauteuil Velours Vert",
      sku: "FAUT-VERT-02",
      model: "Scandinave",
      color: "Vert",
      costPrice: 15000,
      sellingPrice: 28000,
      stock: 0,
      categoryId: cat.id,
      isActive: true,
    },
  });

  console.log("✓ Données de test initiales créées : 2 produits (Stock = 0), 2 emplacements.\n");

  async function executeTest(num: number, name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ num, name, passed: true });
      console.log(`  [TEST ${String(num).padStart(2, "0")}] PASS: ${name}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ num, name, passed: false, error: msg });
      console.error(`  [TEST ${String(num).padStart(2, "0")}] FAIL: ${name}`);
      console.error(`          Erreur: ${msg}`);
    }
  }

  let supplier1Id: number = 0;
  let supplier2Id: number = 0;

  // ─── TEST 1: CRÉATION FOURNISSEUR & SÉQUENCE FOU-0001 ────────────────────────
  await executeTest(1, "Création fournisseur avec génération automatique du code séquentiel FOU-0001", async () => {
    const fd = new FormData();
    fd.set("name", "Société Boiseries Blida SARL");
    fd.set("phone", "0550112233");
    fd.set("email", "contact@boiseries-blida.dz");
    fd.set("address", "Zone Industrielle Benboulaid, Blida");
    fd.set("notes", "Fournisseur principal de structures en bois");

    const res = await purchaseActions.createSupplierAction(fd);
    assert(res.success === true, `Échec création fournisseur: ${res.error}`);
    assert(Boolean(res.data), "Données fournisseur manquantes");

    const created = res.data as any;
    assert(created.code === "FOU-0001", `Code attendu FOU-0001 mais reçu: ${created.code}`);
    assert(created.name === "Société Boiseries Blida SARL", "Nom incorrect");
    assert(created.isActive === true, "Le fournisseur doit être actif par défaut");
    supplier1Id = created.id;
  });

  // ─── TEST 2: CRÉATION 2E FOURNISSEUR & INCRÉMENTATION FOU-0002 ───────────────
  await executeTest(2, "Génération séquentielle pour le deuxième fournisseur (FOU-0002)", async () => {
    const fd = new FormData();
    fd.set("name", "Tissus & Mousse Alger");
    fd.set("phone", "0555998877");
    fd.set("address", "Oued Smar, Alger");

    const res = await purchaseActions.createSupplierAction(fd);
    assert(res.success === true, `Échec création 2e fournisseur: ${res.error}`);
    const created = res.data as any;
    assert(created.code === "FOU-0002", `Code attendu FOU-0002 mais reçu: ${created.code}`);
    supplier2Id = created.id;
  });

  // ─── TEST 3: REJET DOUBLON NUMÉRO DE TÉLÉPHONE ──────────────────────────────
  await executeTest(3, "Rejet de duplication de numéro de téléphone fournisseur", async () => {
    const fd = new FormData();
    fd.set("name", "Fournisseur Copieur");
    fd.set("phone", "0550112233"); // Même téléphone que FOU-0001

    const res = await purchaseActions.createSupplierAction(fd);
    assert(res.success === false, "La création avec téléphone dupliqué aurait dû être rejetée.");
    assert(Boolean(res.error?.includes("déjà enregistré")), `Message d'erreur inattendu: ${res.error}`);
  });

  // ─── TEST 4: MODIFICATION FOURNISSEUR & DÉSACTIVATION / ACTIVATION ──────────
  await executeTest(4, "Modification des coordonnées et bascule de statut actif/inactif", async () => {
    const updateFd = new FormData();
    updateFd.set("name", "Société Boiseries Blida SARL (Mise à jour)");
    updateFd.set("phone", "0550112233");
    updateFd.set("address", "Nouvelle Zone Industrielle Blida");

    const updateRes = await purchaseActions.updateSupplierAction(supplier1Id, updateFd);
    assert(updateRes.success === true, `Échec mise à jour: ${updateRes.error}`);

    // Désactivation
    const toggleRes1 = await purchaseActions.toggleSupplierStatusAction(supplier1Id);
    assert(toggleRes1.success === true, "Échec désactivation");
    let supp = await prisma.supplier.findUnique({ where: { id: supplier1Id } });
    assert(supp?.isActive === false, "Le statut doit être inactif (false)");

    // Réactivation
    const toggleRes2 = await purchaseActions.toggleSupplierStatusAction(supplier1Id);
    assert(toggleRes2.success === true, "Échec réactivation");
    supp = await prisma.supplier.findUnique({ where: { id: supplier1Id } });
    assert(supp?.isActive === true, "Le statut doit être actif (true)");
  });

  let purchaseOrderId: number = 0;

  // ─── TEST 5: CRÉATION COMMANDE D'ACHAT AVEC LIGNES MULTIPLES & PRIX DÉRIVÉS ──
  await executeTest(5, "Création commande multi-lignes avec prix d'achat négocié sans impacter le prix catalogue", async () => {
    // Coût par défaut de Product A = 40,000 DA. On commande à 38,000 DA (négocié).
    // Coût par défaut de Product B = 15,000 DA. On commande à 14,500 DA.
    const res = await purchaseActions.createPurchaseOrderAction({
      supplierId: supplier1Id,
      status: "ordered",
      notes: "Commande approvisionnement printemps",
      discount: 2500,
      items: [
        {
          productId: productA.id,
          locationId: showroom!.id,
          quantity: 5,
          unitCost: 38000,
        },
        {
          productId: productB.id,
          locationId: garageChaaban!.id,
          quantity: 10,
          unitCost: 14500,
        },
      ],
    });

    assert(res.success === true, `Échec création commande d'achat: ${res.error}`);
    const po = res.data as any;
    purchaseOrderId = po.id;

    // Calculs attendus: (5 * 38000 = 190000) + (10 * 14500 = 145000) = 335000
    // Total après remise (2500) = 332500 DA
    assert(po.subtotal === 335000, `Sous-total attendu 335000, reçu: ${po.subtotal}`);
    assert(po.discount === 2500, `Remise attendue 2500, reçu: ${po.discount}`);
    assert(po.totalAmount === 332500, `Total attendu 332500, reçu: ${po.totalAmount}`);
    assert(po.paidAmount === 0, `Montant payé attendu 0, reçu: ${po.paidAmount}`);
    assert(po.receiptStatus === "pending", "Le statut de réception doit être 'pending'");
    assert(po.paymentStatus === "unpaid", "Le statut de paiement doit être 'unpaid'");
    assert(po.reference.startsWith("BC-"), `La référence doit débuter par BC-: ${po.reference}`);

    // Vérifier que le prix de revient catalogue n'a PAS été modifié
    const pA = await prisma.product.findUnique({ where: { id: productA.id } });
    assert(pA?.costPrice === 40000, `Le prix de revient catalogue du produit A ne doit pas changer (attendu 40000, reçu ${pA?.costPrice})`);
  });

  // ─── TEST 6: RÈGLE STRICTE : AUCUNE ENTRÉE EN STOCK À LA COMMANDE ──────────
  await executeTest(6, "Règle stricte: la création de commande d'achat n'augmente PAS le stock", async () => {
    const pA = await prisma.product.findUnique({ where: { id: productA.id } });
    const pB = await prisma.product.findUnique({ where: { id: productB.id } });
    assert(pA?.stock === 0, `Le stock du produit A doit être 0 mais est ${pA?.stock}`);
    assert(pB?.stock === 0, `Le stock du produit B doit être 0 mais est ${pB?.stock}`);

    const movements = await prisma.stockMovement.findMany({ where: { purchaseId: purchaseOrderId } });
    assert(movements.length === 0, `Aucun mouvement de stock ne doit exister pour une commande non réceptionnée (trouvé: ${movements.length})`);
  });

  // ─── TEST 7: RÉCEPTION PARTIELLE ET AUDIT DE STOCK ─────────────────────────
  await executeTest(7, "Réception partielle: incrémente le stock de l'emplacement et génère un bon BR", async () => {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    const itemA = purchase!.items.find((i) => i.productId === productA.id)!;

    // Réceptionner 2 unités sur les 5 commandées de Product A dans SHOWROOM
    const res = await purchaseActions.receivePurchaseGoodsAction({
      purchaseId: purchaseOrderId,
      notes: "Livraison partielle par camionnette",
      items: [
        {
          purchaseItemId: itemA.id,
          locationId: showroom!.id,
          quantity: 2,
        },
      ],
    });

    assert(res.success === true, `Échec réception partielle: ${res.error}`);
    const receipt = res.data as any;
    assert(receipt.reference.startsWith("BR-"), `Référence du bon attendue BR-..., reçue: ${receipt.reference}`);

    // Vérifier le stock physique
    const pA = await prisma.product.findUnique({ where: { id: productA.id } });
    assert(pA?.stock === 2, `Le stock total du produit A doit être 2 (reçu: ${pA?.stock})`);

    const pStock = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: productA.id, locationId: showroom!.id } },
    });
    assert(pStock?.quantity === 2, `Le stock Showroom doit être 2 (reçu: ${pStock?.quantity})`);

    // Vérifier le mouvement d'audit
    const movement = await prisma.stockMovement.findFirst({
      where: { purchaseId: purchaseOrderId, productId: productA.id },
    });
    assert(movement !== null, "Mouvement de stock introuvable");
    assert(movement!.type === "RECEIPT", `Type attendu RECEIPT, reçu ${movement!.type}`);
    assert(movement!.quantity === 2, `Quantité reçue 2, reçue ${movement!.quantity}`);
    assert(movement!.stockBefore === 0, `Stock avant attendu 0, reçu ${movement!.stockBefore}`);
    assert(movement!.stockAfter === 2, `Stock après attendu 2, reçu ${movement!.stockAfter}`);
    assert(movement!.toLocationId === showroom!.id, "Emplacement de destination incorrect");

    // Vérifier statut de la commande
    const updatedPurchase = await prisma.purchase.findUnique({ where: { id: purchaseOrderId } });
    assert(updatedPurchase?.receiptStatus === "partial", `Statut réception attendu 'partial', reçu: ${updatedPurchase?.receiptStatus}`);
    assert(updatedPurchase?.status === "partially_received", `Statut commande attendu 'partially_received', reçu: ${updatedPurchase?.status}`);
  });

  // ─── TEST 8: REJET STRICT DU SUR-STOCKAGE (OVER-RECEIPT) ───────────────────
  await executeTest(8, "Protection contre la sur-réception : rejet si quantité > restant commandé", async () => {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    const itemA = purchase!.items.find((i) => i.productId === productA.id)!;
    // Commandé = 5, Déjà reçu = 2, Reste = 3. Si on demande 4, ça doit être rejeté.
    const res = await purchaseActions.receivePurchaseGoodsAction({
      purchaseId: purchaseOrderId,
      items: [
        {
          purchaseItemId: itemA.id,
          locationId: showroom!.id,
          quantity: 4, // > 3 restant
        },
      ],
    });

    assert(res.success === false, "La sur-réception aurait dû être rejetée.");
    assert(Boolean(res.error?.includes("Quantité excessive")), `Message attendu sur quantité excessive, reçu: ${res.error}`);

    // Le stock ne doit pas avoir bougé
    const pA = await prisma.product.findUnique({ where: { id: productA.id } });
    assert(pA?.stock === 2, "Le stock ne doit pas avoir augmenté lors d'un rejet.");
  });

  // ─── TEST 9: RÉCEPTION MULTI-EMPLACEMENTS ET SOLDE DE LA COMMANDE ──────────
  await executeTest(9, "Réception multi-emplacements: solde le restant dû et passe le statut à 'received'", async () => {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    const itemA = purchase!.items.find((i) => i.productId === productA.id)!; // Reste 3
    const itemB = purchase!.items.find((i) => i.productId === productB.id)!; // Reste 10

    // Réceptionner les 3 Product A dans GARAGE_CHAABAN et les 10 Product B dans GARAGE_CHAABAN
    const res = await purchaseActions.receivePurchaseGoodsAction({
      purchaseId: purchaseOrderId,
      notes: "Deuxième livraison finale",
      items: [
        {
          purchaseItemId: itemA.id,
          locationId: garageChaaban!.id,
          quantity: 3,
        },
        {
          purchaseItemId: itemB.id,
          locationId: garageChaaban!.id,
          quantity: 10,
        },
      ],
    });

    assert(res.success === true, `Échec réception finale: ${res.error}`);

    // Vérifier stocks finaux:
    // Product A: 2 dans showroom, 3 dans garage = 5 total
    const pA = await prisma.product.findUnique({ where: { id: productA.id } });
    assert(pA?.stock === 5, `Stock attendu 5 pour Product A, reçu: ${pA?.stock}`);

    const pA_garage = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: productA.id, locationId: garageChaaban!.id } },
    });
    assert(pA_garage?.quantity === 3, `Stock Garage attendu 3 pour Product A, reçu: ${pA_garage?.quantity}`);

    // Product B: 10 dans garage = 10 total
    const pB = await prisma.product.findUnique({ where: { id: productB.id } });
    assert(pB?.stock === 10, `Stock attendu 10 pour Product B, reçu: ${pB?.stock}`);

    // Statut commande: received
    const updatedPurchase = await prisma.purchase.findUnique({ where: { id: purchaseOrderId } });
    assert(updatedPurchase?.receiptStatus === "received", `Statut réception attendu 'received', reçu: ${updatedPurchase?.receiptStatus}`);
    assert(updatedPurchase?.status === "received", `Statut commande attendu 'received', reçu: ${updatedPurchase?.status}`);
  });

  // ─── TEST 10: REJET RÉCEPTION LORSQUE TOUT EST DÉJÀ REÇU ───────────────────
  await executeTest(10, "Rejet de double réception lorsque tous les articles sont déjà reçus", async () => {
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    const itemA = purchase!.items.find((i) => i.productId === productA.id)!;

    const res = await purchaseActions.receivePurchaseGoodsAction({
      purchaseId: purchaseOrderId,
      items: [
        {
          purchaseItemId: itemA.id,
          locationId: showroom!.id,
          quantity: 1,
        },
      ],
    });

    assert(res.success === false, "Une tentative de réception supplémentaire aurait dû être rejetée.");
  });

  // ─── TEST 11: RÈGLEMENT FOURNISSEUR PARTIEL & VÉRIFICATION DU SOLDE ────────
  await executeTest(11, "Enregistrement d'un premier règlement partiel fournisseur (PAYF-...)", async () => {
    // Total de la commande = 332,500 DA. Déjà payé = 0 DA.
    // On verse un premier acompte de 100,000 DA en Espèces.
    const fd = new FormData();
    fd.set("purchaseId", purchaseOrderId.toString());
    fd.set("amount", "100000");
    fd.set("method", "cash");
    fd.set("notes", "Premier versement espèces au déchargement");

    const res = await purchaseActions.recordSupplierPaymentAction(fd);
    assert(res.success === true, `Échec paiement partiel: ${res.error}`);

    const pay = res.data as any;
    assert(pay.reference.startsWith("PAYF-"), `Référence paiement attendue PAYF-..., reçue: ${pay.reference}`);
    assert(pay.amount === 100000, `Montant attendu 100000, reçu: ${pay.amount}`);

    const p = await prisma.purchase.findUnique({ where: { id: purchaseOrderId } });
    assert(p?.paidAmount === 100000, `Montant payé attendu 100000, reçu: ${p?.paidAmount}`);
    assert(p?.paymentStatus === "partial", `Statut paiement attendu 'partial', reçu: ${p?.paymentStatus}`);
  });

  // ─── TEST 12: REJET STRICT DES PAIEMENTS NÉGATIFS, NULS OU EXCESSIFS ───────
  await executeTest(12, "Rejet strict des règlements négatifs, nuls ou supérieurs au solde dû", async () => {
    // 1. Zéro ou négatif
    const fdZero = new FormData();
    fdZero.set("purchaseId", purchaseOrderId.toString());
    fdZero.set("amount", "0");
    const resZero = await purchaseActions.recordSupplierPaymentAction(fdZero);
    assert(resZero.success === false, "Le montant 0 aurait dû être rejeté.");

    const fdNeg = new FormData();
    fdNeg.set("purchaseId", purchaseOrderId.toString());
    fdNeg.set("amount", "-5000");
    const resNeg = await purchaseActions.recordSupplierPaymentAction(fdNeg);
    assert(resNeg.success === false, "Le montant négatif aurait dû être rejeté.");

    // 2. Montant excessif (solde restant = 332,500 - 100,000 = 232,500 DA)
    const fdExcess = new FormData();
    fdExcess.set("purchaseId", purchaseOrderId.toString());
    fdExcess.set("amount", "250000"); // 250,000 > 232,500
    const resExcess = await purchaseActions.recordSupplierPaymentAction(fdExcess);
    assert(resExcess.success === false, "Le trop-perçu / paiement excessif aurait dû être rejeté.");
    assert(Boolean(resExcess.error?.includes("dépasse le solde restant")), `Message attendu sur dépassement de solde, reçu: ${resExcess.error}`);
  });

  // ─── TEST 13: SOLDE INTÉGRAL DU FOURNISSEUR & STATUT 'PAID' ────────────────
  await executeTest(13, "Solde intégral du restant dû: passage du statut de paiement à 'paid'", async () => {
    // Reste dû = 232,500 DA
    const fd = new FormData();
    fd.set("purchaseId", purchaseOrderId.toString());
    fd.set("amount", "232500");
    fd.set("method", "transfer");
    fd.set("notes", "Virement BNA solde commande");

    const res = await purchaseActions.recordSupplierPaymentAction(fd);
    assert(res.success === true, `Échec paiement solde: ${res.error}`);

    const p = await prisma.purchase.findUnique({ where: { id: purchaseOrderId } });
    assert(p?.paidAmount === 332500, `Montant payé attendu 332500, reçu: ${p?.paidAmount}`);
    assert(p?.paymentStatus === "paid", `Statut paiement attendu 'paid', reçu: ${p?.paymentStatus}`);
  });

  // ─── TEST 14: RÉCONCILIATION COMPTABLE DU FOURNISSEUR ──────────────────────
  await executeTest(14, "Réconciliation automatique des statistiques et soldes du fournisseur", async () => {
    const suppliers = await purchaseActions.getSuppliersData();
    const supp = suppliers.find((s) => s.id === supplier1Id);
    assert(supp !== undefined, "Fournisseur introuvable");

    assert(supp!.totalPurchases === 332500, `Achats totaux attendus 332500, reçus: ${supp!.totalPurchases}`);
    assert(supp!.totalPaid === 332500, `Total réglé attendu 332500, reçu: ${supp!.totalPaid}`);
    assert(supp!.outstandingBalance === 0, `Solde dû attendu 0, reçu: ${supp!.outstandingBalance}`);
  });

  // ─── TEST 15: INTERDICTION DE SUPPRIMER UN FOURNISSEUR AVEC HISTORIQUE ─────
  await executeTest(15, "Préservation de l'historique comptable : interdiction de supprimer un fournisseur avec commandes", async () => {
    const res = await purchaseActions.deleteSupplierAction(supplier1Id);
    assert(res.success === false, "La suppression aurait dû être bloquée.");
    assert(Boolean(res.error?.includes("Veuillez plutôt le désactiver")), `Message attendu sur la désactivation, reçu: ${res.error}`);

    const exists = await prisma.supplier.findUnique({ where: { id: supplier1Id } });
    assert(exists !== null, "Le fournisseur doit toujours exister en base.");
  });

  // ─── TEST 16: CRÉATION D'UNE COMMANDE ET ANNULATION AVEC COMPENSATION STOCK 
  await executeTest(16, "Annulation de commande avec marchandises reçues: compensation et inversion du stock (ISSUE)", async () => {
    // 1. Créer une nouvelle commande pour Supplier 2
    const createRes = await purchaseActions.createPurchaseOrderAction({
      supplierId: supplier2Id,
      items: [
        {
          productId: productA.id,
          locationId: showroom!.id,
          quantity: 4,
          unitCost: 39000,
        },
      ],
    });
    assert(createRes.success === true, "Échec création 2e commande");
    const po2 = createRes.data as any;

    // Stock avant réception de la 2e commande = 5
    const stockAvant = (await prisma.product.findUnique({ where: { id: productA.id } }))?.stock;
    assert(stockAvant === 5, `Stock avant attendu 5, reçu ${stockAvant}`);

    // 2. Réceptionner 4 unités dans Showroom
    const item = (await prisma.purchase.findUnique({ where: { id: po2.id }, include: { items: true } }))!.items[0];
    await purchaseActions.receivePurchaseGoodsAction({
      purchaseId: po2.id,
      items: [
        {
          purchaseItemId: item.id,
          locationId: showroom!.id,
          quantity: 4,
        },
      ],
    });

    const stockApresRec = (await prisma.product.findUnique({ where: { id: productA.id } }))?.stock;
    assert(stockApresRec === 9, `Stock après réception attendu 9, reçu ${stockApresRec}`);

    // 3. Annuler la commande avec motif explicite
    const cancelRes = await purchaseActions.cancelPurchaseOrderAction(po2.id, "Retour marchandise cause non-conformité produit");
    assert(cancelRes.success === true, `Échec annulation commande: ${cancelRes.error}`);

    // 4. Vérifier que le stock a été compensé (9 - 4 = 5)
    const stockApresAnnul = (await prisma.product.findUnique({ where: { id: productA.id } }))?.stock;
    assert(stockApresAnnul === 5, `Stock après annulation attendu 5, reçu ${stockApresAnnul}`);

    // 5. Vérifier la création d'un mouvement d'audit compensatoire ISSUE
    const compensatoryMovement = await prisma.stockMovement.findFirst({
      where: {
        purchaseId: po2.id,
        type: "ISSUE",
      },
    });
    assert(compensatoryMovement !== null, "Mouvement compensatoire ISSUE introuvable");
    assert(compensatoryMovement!.quantity === 4, `Quantité compensée attendue 4, reçue: ${compensatoryMovement!.quantity}`);
    assert(compensatoryMovement!.stockBefore === 6, `Stock avant compensation attendu 6 (dans Showroom), reçu ${compensatoryMovement!.stockBefore}`);
    assert(compensatoryMovement!.stockAfter === 2, `Stock après compensation attendu 2 (dans Showroom), reçu ${compensatoryMovement!.stockAfter}`);

    // 6. Statut de la commande: cancelled
    const finalPO2 = await prisma.purchase.findUnique({ where: { id: po2.id } });
    assert(finalPO2?.status === "cancelled", `Statut commande attendu 'cancelled', reçu ${finalPO2?.status}`);
  });

  // ─── TEST 17: ATOMICITÉ ET ROLLBACK EN CAS D'ERREUR ─────────────────────────
  await executeTest(17, "Atomicité de transaction: aucun mouvement partiel de stock si une ligne échoue", async () => {
    // Créer une commande de test
    const createRes = await purchaseActions.createPurchaseOrderAction({
      supplierId: supplier2Id,
      items: [
        {
          productId: productA.id,
          locationId: showroom!.id,
          quantity: 2,
          unitCost: 39000,
        },
        {
          productId: productB.id,
          locationId: garageChaaban!.id,
          quantity: 2,
          unitCost: 15000,
        },
      ],
    });
    const po3 = createRes.data as any;
    const po3Items = (await prisma.purchase.findUnique({ where: { id: po3.id }, include: { items: true } }))!.items;

    const stockA_avant = (await prisma.product.findUnique({ where: { id: productA.id } }))!.stock;
    const stockB_avant = (await prisma.product.findUnique({ where: { id: productB.id } }))!.stock;

    // Tenter une réception où la 1ère ligne est valide (1 unité) mais la 2e est invalide (> quantité commandée)
    const res = await purchaseActions.receivePurchaseGoodsAction({
      purchaseId: po3.id,
      items: [
        {
          purchaseItemId: po3Items[0].id,
          locationId: showroom!.id,
          quantity: 1, // Valide
        },
        {
          purchaseItemId: po3Items[1].id,
          locationId: garageChaaban!.id,
          quantity: 999, // Invalide (> 2 restant)
        },
      ],
    });

    assert(res.success === false, "La transaction globale aurait dû échouer et être annulée.");

    // Vérifier le rollback complet: ni Product A ni Product B n'ont changé de stock
    const stockA_apres = (await prisma.product.findUnique({ where: { id: productA.id } }))!.stock;
    const stockB_apres = (await prisma.product.findUnique({ where: { id: productB.id } }))!.stock;

    assert(stockA_apres === stockA_avant, "Le stock du produit A n'a pas été rollback !");
    assert(stockB_apres === stockB_avant, "Le stock du produit B n'a pas été rollback !");
  });

  // ─── TEST 18: DATA FLOW DU BON DE RÉCEPTION (A4) ET STRUCTURATION DES LIGNES
  await executeTest(18, "Bon de Réception A4: présence des lignes, articles, dépôts, P.U et quantités exactes", async () => {
    // 1. Créer une nouvelle commande multi-produits pour Supplier 1
    const poRes = await purchaseActions.createPurchaseOrderAction({
      supplierId: supplier1Id,
      items: [
        {
          productId: productA.id,
          locationId: showroom!.id,
          quantity: 4,
          unitCost: 45000,
        },
        {
          productId: productB.id,
          locationId: garageChaaban!.id,
          quantity: 6,
          unitCost: 11000,
        },
      ],
      notes: "Commande test Bon de Réception A4",
    });

    assert(poRes.success === true, `Échec création commande: ${poRes.error}`);
    const po = poRes.data as any;

    // 2. Première réception partielle (2 Product A dans Showroom, 3 Product B dans Garage)
    const itemA = po.items.find((i: any) => i.productId === productA.id);
    const itemB = po.items.find((i: any) => i.productId === productB.id);

    const recRes1 = await purchaseActions.receivePurchaseGoodsAction({
      purchaseId: po.id,
      notes: "Première livraison partielle",
      items: [
        {
          purchaseItemId: itemA.id,
          locationId: showroom!.id,
          quantity: 2,
        },
        {
          purchaseItemId: itemB.id,
          locationId: garageChaaban!.id,
          quantity: 3,
        },
      ],
    });

    assert(recRes1.success === true, `Échec réception 1: ${recRes1.error}`);
    const rec1Data = recRes1.data as any;
    assert(rec1Data.items !== undefined, "Les lignes de réception (items) doivent être renvoyées dans res.data !");
    assert(rec1Data.items.length === 2, `Attendu 2 lignes dans le premier BR, reçu: ${rec1Data.items.length}`);

    // Vérifier les détails de chaque ligne retournée dans le BR
    const recItemA = rec1Data.items.find((it: any) => it.productId === productA.id);
    assert(recItemA !== undefined, "Ligne produit A manquante dans le BR");
    assert(recItemA.quantity === 2, `Quantité reçue pour A attendue 2, reçue: ${recItemA.quantity}`);
    assert(recItemA.product?.sku === productA.sku, `SKU produit A attendu ${productA.sku}, reçu: ${recItemA.product?.sku}`);
    assert(recItemA.product?.name === productA.name, "Nom produit A incorrect");
    assert(recItemA.location?.name === showroom!.name, `Dépôt attendu ${showroom!.name}, reçu: ${recItemA.location?.name}`);
    const costA = recItemA.unitCost ?? recItemA.purchaseItem?.unitCost ?? recItemA.product?.costPrice ?? 0;
    assert(costA === 45000, `P.U Achat attendu 45000, reçu: ${costA}`);

    // Vérifier getReceiptDetailsAction
    const detailsRes = await purchaseActions.getReceiptDetailsAction(rec1Data.id);
    assert(detailsRes.success === true, `Échec getReceiptDetailsAction: ${detailsRes.error}`);
    const details = detailsRes.data as any;
    assert(details.items && details.items.length === 2, "getReceiptDetailsAction doit inclure toutes les lignes");
    assert(details.purchase?.reference === po.reference, "Référence commande liée incorrecte");
    assert(details.purchase?.supplier?.name !== undefined, "Fournisseur de la commande liée manquant");
  });

  // ─── TEST 19: getPurchasesData CONTIENT LES LIGNES COMPLÈTES DES BONS DE RÉCEPTION
  await executeTest(19, "getPurchasesData: intègre les items et détails produits/dépôts pour l'onglet Bons de Réception", async () => {
    const data = await purchaseActions.getPurchasesData();
    const allReceipts = data.purchases.flatMap((p) => p.receipts || []);
    assert(allReceipts.length > 0, "Au moins un bon de réception doit être retourné");

    for (const r of allReceipts) {
      assert(Array.isArray(r.items), `Les items du bon ${r.reference} doivent être un tableau`);
      for (const it of r.items) {
        assert(it.quantity > 0, "Chaque item de réception doit avoir une quantité > 0");
        assert(it.product?.name !== undefined, "Chaque item doit contenir le nom du produit");
        assert(it.location?.name !== undefined, "Chaque item doit contenir le nom de l'emplacement");
      }
    }
  });

  // ─── RÉCAPITULATIF ─────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`  RÉSULTATS DE LA SUITE ACHATS & FOURNISSEURS : ${passed}/${total} RÉUSSIS`);
  if (failed > 0) {
    console.error(`  ÉCHECS : ${failed} test(s) ont échoué.`);
    process.exit(1);
  } else {
    console.log("  TOUS LES TESTS DU MODULE ACHATS & FOURNISSEURS SONT VALIDÉS AVEC SUCCÈS !");
    console.log("================================================================================\n");
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale d'exécution de la suite de tests :", err);
  process.exit(1);
});
