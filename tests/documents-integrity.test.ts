/**
 * Integration Test Suite: Documents & Archives Centrales
 *
 * Runs against an isolated temporary SQLite database: prisma/test_documents_runner.db
 * Never touches real shop data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";
import { createClient } from "@libsql/client";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_documents_runner.db");

try {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
} catch {
  // Ignore
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

async function executeTest(num: number, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ num, name, passed: true });
    console.log(`  [TEST ${String(num).padStart(2, "0")}] PASS: ${name}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({ num, name, passed: false, error: errorMsg });
    console.error(`  [TEST ${String(num).padStart(2, "0")}] FAIL: ${name}\n         Cause: ${errorMsg}`);
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("  SHOP ERP — SUITE DE TESTS D'INTÉGRITÉ DU MODULE DOCUMENTS & ARCHIVES");
  console.log("  Base de test isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Initialiser le schéma via les migrations
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
  await ddlClient.close();
  console.log("✓ Schéma et tables initialisés sur la base isolée.\n");

  const { prisma } = await import("@/lib/prisma");
  const {
    getDocumentsData,
    getInventorySheetData,
    getAccountStatementData,
    getPartiesForStatement,
  } = await import("@/app/documents/actions");

  // ─── SEED INITIAL POUR TEST ───────────────────────────────────────────────
  const loc1 = await prisma.location.create({
    data: { name: "Showroom Principal", code: "LOC-01", isDefault: true },
  });
  const loc2 = await prisma.location.create({
    data: { name: "Entrepôt Annexe", code: "LOC-02" },
  });

  const prod1 = await prisma.product.create({
    data: {
      sku: "CAN-001",
      name: "Canapé Cuir 3 Places",
      sellingPrice: 85000,
      costPrice: 55000,
      stock: 5,
      minStock: 2,
    },
  });

  await prisma.productStock.create({
    data: { productId: prod1.id, locationId: loc1.id, quantity: 3 },
  });
  await prisma.productStock.create({
    data: { productId: prod1.id, locationId: loc2.id, quantity: 2 },
  });

  const cust1 = await prisma.customer.create({
    data: { name: "Karim Benali", phone: "0550112233", address: "Hydra, Alger" },
  });

  const supp1 = await prisma.supplier.create({
    data: { name: "Mobilier Prestige DZ", phone: "021001122", address: "Blida" },
  });

  // Vente 1
  await prisma.sales.create({
    data: {
      reference: "FAC-202610-0001",
      customerId: cust1.id,
      status: "confirmed",
      paymentStatus: "partial",
      subtotal: 85000,
      totalAmount: 85000,
      paidAmount: 50000,
      items: {
        create: {
          productId: prod1.id,
          locationId: loc1.id,
          quantity: 1,
          unitPrice: 85000,
          subtotal: 85000,
        },
      },
      payments: {
        create: {
          reference: "PAY-202610-0001",
          amount: 50000,
          method: "cash",
          status: "completed",
        },
      },
    },
  });

  // Commande Achat 1
  await prisma.purchase.create({
    data: {
      reference: "BC-202610-0001",
      supplierId: supp1.id,
      status: "ordered",
      paymentStatus: "partial",
      subtotal: 110000,
      totalAmount: 110000,
      paidAmount: 40000,
      items: {
        create: {
          productId: prod1.id,
          locationId: loc2.id,
          quantity: 2,
          unitCost: 55000,
          subtotal: 110000,
        },
      },
      payments: {
        create: {
          reference: "PAYF-202610-0001",
          amount: 40000,
          method: "transfer",
          status: "completed",
        },
      },
    },
  });

  // Session de caisse
  await prisma.cashSession.create({
    data: {
      reference: "CS-202610-0001",
      status: "closed",
      openingAmount: 10000,
      closingAmount: 60000,
      theoreticalAmount: 60000,
      difference: 0,
      totalCashIn: 50000,
      totalCashOut: 0,
    },
  });

  // Transfert de stock
  await prisma.stockMovement.create({
    data: {
      reference: "TRF-202610-0001",
      type: "TRANSFER",
      productId: prod1.id,
      fromLocationId: loc1.id,
      toLocationId: loc2.id,
      quantity: 1,
      reason: "Rééquilibrage stock showroom",
    },
  });

  // ─── TEST 1: Récupération consolidée de tous les documents ────────────────
  await executeTest(1, "Agrégation unifiée de toutes les pièces dans le hub Documents", async () => {
    const data = await getDocumentsData();
    assert(data.documents.length >= 4, "Le hub doit retourner les factures, achats, paiements, caisse, transferts.");
    assert(data.stats.totalDocuments === data.documents.length, "Le compteur total de stats doit correspondre au tableau.");
    assert(data.stats.invoicesCount >= 1, "Au moins 1 facture répertoriée.");
    assert(data.stats.purchasesCount >= 1, "Au moins 1 commande d'achat répertoriée.");
    assert(data.stats.paymentsCount >= 2, "Au moins 2 règlements (client + fournisseur) répertoriés.");
    assert(data.stats.transfersCount >= 1, "Au moins 1 transfert répertorié.");
  });

  // ─── TEST 2: Intégrité des références et immuabilité ───────────────────────
  await executeTest(2, "Préservation stricte des références existantes (aucune modification de stock/base)", async () => {
    const data = await getDocumentsData();
    const fac = data.documents.find((d) => d.reference === "FAC-202610-0001");
    assert(fac !== undefined, "La facture FAC-202610-0001 doit exister.");
    assert(fac?.amount === 85000, "Le montant de la facture doit être exactement 85 000 DA.");
    assert(fac?.partyName === "Karim Benali", "Le tiers associé doit être Karim Benali.");

    // Vérifier que stock n'a pas bougé
    const p = await prisma.product.findUnique({ where: { id: prod1.id } });
    assert(p?.stock === 5, "La consultation de document ne doit pas altérer le stock.");
  });

  // ─── TEST 3: Payload facture et intégrité des pièces ───────────────────────
  await executeTest(3, "Présence du payload facture complet avec articles et tiers pour impression", async () => {
    const data = await getDocumentsData();
    const fac = data.documents.find((d) => d.reference === "FAC-202610-0001");
    assert(fac !== undefined, "La facture liée doit être présente.");
    assert(fac?.salePayload !== undefined, "Le payload de vente doit être présent pour impression.");
    assert(fac?.salePayload?.reference === "FAC-202610-0001", "La référence liée doit être FAC-202610-0001.");
    assert(fac?.salePayload?.items?.length === 1, "La ligne d'article doit être incluse.");
  });

  // ─── TEST 4: Générateur de Fiche d'Inventaire Physique ────────────────────
  await executeTest(4, "Génération de la Fiche de Comptage d'Inventaire par dépôt", async () => {
    const globalSheet = await getInventorySheetData();
    assert(globalSheet.items.length >= 1, "La fiche générale doit contenir les produits actifs.");
    assert(globalSheet.items[0].systemStock === 5, "Le stock théorique global doit être 5.");

    const loc1Sheet = await getInventorySheetData(loc1.id);
    assert(loc1Sheet.locationName === "Showroom Principal", "Le nom du dépôt doit être Showroom Principal.");
    assert(loc1Sheet.items[0].systemStock === 3, "Le stock théorique du Showroom doit être 3.");

    const loc2Sheet = await getInventorySheetData(loc2.id);
    assert(loc2Sheet.items[0].systemStock === 2, "Le stock théorique de l'Entrepôt Annexe doit être 2.");
  });

  // ─── TEST 5: Relevé de Compte Client ──────────────────────────────────────
  await executeTest(5, "Calcul exact du Relevé de Compte Client (Débits, Crédits et Solde restant)", async () => {
    const stmt = await getAccountStatementData({
      type: "customer",
      partyId: cust1.id,
    });
    assert(stmt !== null, "Le relevé client doit être généré.");
    assert(stmt?.party.name === "Karim Benali", "Le nom du client doit être Karim Benali.");
    assert(stmt?.totalDebit === 85000, "Le total débité (facturé) doit être 85 000 DA.");
    assert(stmt?.totalCredit === 50000, "Le total crédité (réglé) doit être 50 000 DA.");
    assert(stmt?.finalBalance === 35000, "Le solde net exigible restant doit être 35 000 DA.");
    assert(stmt?.entries.length === 2, "Le relevé doit comporter 2 lignes (1 facture + 1 versement).");
  });

  // ─── TEST 6: Relevé de Compte Fournisseur ─────────────────────────────────
  await executeTest(6, "Calcul exact du Relevé de Compte Fournisseur (Commandes, Règlements, Dettes)", async () => {
    const stmt = await getAccountStatementData({
      type: "supplier",
      partyId: supp1.id,
    });
    assert(stmt !== null, "Le relevé fournisseur doit être généré.");
    assert(stmt?.party.name === "Mobilier Prestige DZ", "Le nom du fournisseur doit correspondre.");
    assert(stmt?.totalDebit === 110000, "Le total commandé doit être 110 000 DA.");
    assert(stmt?.totalCredit === 40000, "Le total payé doit être 40 000 DA.");
    assert(stmt?.finalBalance === 70000, "La dette fournisseur restante doit être 70 000 DA.");
  });

  // ─── TEST 7: Sélecteur de Tiers pour Relevés ──────────────────────────────
  await executeTest(7, "Liste des clients et fournisseurs actifs pour le sélecteur de relevés", async () => {
    const parties = await getPartiesForStatement();
    assert(parties.customers.some((c) => c.name === "Karim Benali"), "Karim Benali doit figurer dans les clients.");
    assert(parties.suppliers.some((s) => s.name === "Mobilier Prestige DZ"), "Mobilier Prestige DZ doit figurer dans les fournisseurs.");
  });

  // ─── NETTOYAGE BASE DE TEST ───────────────────────────────────────────────
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch {
    // ignore
  }

  // ─── BILAN ────────────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  console.log("  RÉSUMÉ DES TESTS DU MODULE DOCUMENTS & ARCHIVES");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`  Total tests     : ${total}`);
  console.log(`  Tests réussis   : ${passed}`);
  console.log(`  Tests échoués   : ${failed}`);

  if (failed > 0) {
    console.error("\nDes tests ont échoué !");
    process.exit(1);
  } else {
    console.log("\n✓ TOUS LES TESTS DU MODULE DOCUMENTS SONT AU VERT !\n");
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale des tests documents:", err);
  process.exit(1);
});
