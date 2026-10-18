/**
 * Integration Test Suite: Rapports & Analyses Décisionnelles
 *
 * Runs against an isolated temporary SQLite database: prisma/test_reports_runner.db
 * Never touches real shop data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";
import { createClient } from "@libsql/client";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_reports_runner.db");

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
  console.log("  SHOP ERP — SUITE DE TESTS D'INTÉGRITÉ DU MODULE RAPPORTS & ANALYSES");
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
  const { getReportsData } = await import("@/app/reports/actions");

  // ─── SEED POUR LES TESTS FINANCIERS ───────────────────────────────────────
  const loc1 = await prisma.location.create({
    data: { name: "Showroom Alger", code: "ALGER-01", isDefault: true },
  });
  const loc2 = await prisma.location.create({
    data: { name: "Entrepôt Blida", code: "BLIDA-01" },
  });

  // Produit A (avec coût d'achat fiable)
  const prodA = await prisma.product.create({
    data: {
      sku: "TABLE-001",
      name: "Table Salle à Manger Chêne",
      sellingPrice: 60000,
      costPrice: 40000, // Coût connu = 40 000 DA
      stock: 4,
      minStock: 2,
    },
  });

  // Produit B (sans coût d'achat renseigné)
  const prodB = await prisma.product.create({
    data: {
      sku: "CHAISE-002",
      name: "Chaise Velours Design",
      sellingPrice: 15000,
      costPrice: null, // Coût inconnu
      stock: 1,
      minStock: 5, // Sous-stock !
    },
  });

  // Répartition des stocks par dépôt
  await prisma.productStock.create({
    data: { productId: prodA.id, locationId: loc1.id, quantity: 3 },
  });
  await prisma.productStock.create({
    data: { productId: prodA.id, locationId: loc2.id, quantity: 1 },
  });
  await prisma.productStock.create({
    data: { productId: prodB.id, locationId: loc1.id, quantity: 1 },
  });

  const cust1 = await prisma.customer.create({
    data: { name: "Mohamed Amine", phone: "0555123456" },
  });
  const supp1 = await prisma.supplier.create({
    data: { name: "Bois & Déco SARL", phone: "025001122" },
  });

  // Vente 1 : 1x Table (60 000 DA) + 2x Chaise (30 000 DA) - Remise (5 000 DA) + Livraison (3 000 DA) = 88 000 DA
  // Acompte payé : 50 000 DA en espèces
  const now = new Date();
  await prisma.sales.create({
    data: {
      reference: "FAC-TEST-001",
      customerId: cust1.id,
      status: "confirmed",
      subtotal: 90000,
      discount: 5000,
      deliveryFee: 3000,
      totalAmount: 88000,
      paidAmount: 50000,
      paymentStatus: "partial",
      saleDate: now,
      items: {
        create: [
          {
            productId: prodA.id,
            locationId: loc1.id,
            quantity: 1,
            unitPrice: 60000,
            subtotal: 60000,
          },
          {
            productId: prodB.id,
            locationId: loc1.id,
            quantity: 2,
            unitPrice: 15000,
            subtotal: 30000,
          },
        ],
      },
      payments: {
        create: {
          reference: "PAY-TEST-001",
          amount: 50000,
          method: "cash",
          status: "completed",
          paymentDate: now,
        },
      },
    },
  });

  // Achat Fournisseur 1 : 100 000 DA, Acompte réglé : 60 000 DA par Virement
  await prisma.purchase.create({
    data: {
      reference: "BC-TEST-001",
      supplierId: supp1.id,
      status: "ordered",
      paymentStatus: "partial",
      subtotal: 100000,
      totalAmount: 100000,
      paidAmount: 60000,
      purchaseDate: now,
      payments: {
        create: {
          reference: "PAYF-TEST-001",
          amount: 60000,
          method: "transfer",
          status: "completed",
          paymentDate: now,
        },
      },
    },
  });

  // Dépenses : Loyer (25 000 DA) + Transport (5 000 DA) = 30 000 DA
  await prisma.expense.create({
    data: {
      reference: "DEP-TEST-001",
      type: "expense",
      category: "rent",
      description: "Loyer mensuel Showroom",
      amount: 25000,
      method: "cash",
      date: now,
    },
  });
  await prisma.expense.create({
    data: {
      reference: "DEP-TEST-002",
      type: "expense",
      category: "transport",
      description: "Carburant camion livraison",
      amount: 5000,
      method: "cash",
      date: now,
    },
  });

  // ─── TEST 1: Calculs Ventes et Chiffre d'Affaires ─────────────────────────
  await executeTest(1, "Calculs Chiffre d'Affaires, Remises, Livraisons et Créances", async () => {
    const report = await getReportsData({ preset: "all" });
    assert(report.salesSummary.invoicedRevenue === 88000, "Le CA facturé TTC doit être exactement 88 000 DA.");
    assert(report.salesSummary.subtotalGross === 90000, "Le sous-total brut des articles doit être 90 000 DA.");
    assert(report.salesSummary.totalDiscounts === 5000, "Le total des remises doit être 5 000 DA.");
    assert(report.salesSummary.totalDeliveryFees === 3000, "Le total des frais de livraison doit être 3 000 DA.");
    assert(report.salesSummary.collectedRevenue === 50000, "Le montant total encaissé doit être 50 000 DA.");
    assert(report.salesSummary.customerDebts === 38000, "Les créances clients restantes doivent être 38 000 DA (88000 - 50000).");
  });

  // ─── TEST 2: Rigueur de la Marge Brute Estimée (Transparence Coûts) ────────
  await executeTest(2, "Calcul prudent de la marge brute et transparence sur les coûts manquants", async () => {
    const report = await getReportsData({ preset: "all" });

    // Table Chêne : Vente = 60 000 DA, Coût = 40 000 DA -> Marge = 20 000 DA
    assert(report.marginAnalysis.coveredSellingRevenue === 60000, "Les ventes couvertes par coût doivent être 60 000 DA.");
    assert(report.marginAnalysis.coveredCostTotal === 40000, "Le coût estimé des articles couverts doit être 40 000 DA.");
    assert(report.marginAnalysis.estimatedGrossMargin === 20000, "La marge brute estimée doit être 20 000 DA.");
    assert(
      Math.round(report.marginAnalysis.estimatedMarginRate) === 33,
      "Le taux de marge brute estimé doit être d'environ 33.3%."
    );

    // Chaises : Vente = 30 000 DA sans coût de revient
    assert(report.marginAnalysis.uncoveredSellingRevenue === 30000, "Les ventes sans coût doivent être isolées (30 000 DA).");
    assert(
      Math.round(report.marginAnalysis.costCoveragePercentage) === 67,
      "La couverture de coût doit être de 66.7% (60000 / 90000)."
    );
    assert(
      report.marginAnalysis.disclosureNote.includes("Estimation calculée sur"),
      "La mention légale de transparence doit divulguer la couverture partielle."
    );
  });

  // ─── TEST 3: Achats et Dettes Fournisseurs ─────────────────────────────────
  await executeTest(3, "Bilan des achats fournisseurs, règlements et dettes exigibles", async () => {
    const report = await getReportsData({ preset: "all" });
    assert(report.purchasesSummary.totalPurchases === 100000, "Le total des achats doit être 100 000 DA.");
    assert(report.purchasesSummary.paidToSuppliers === 60000, "Le total réglé doit être 60 000 DA.");
    assert(report.purchasesSummary.supplierDebts === 40000, "La dette fournisseur restante doit être 40 000 DA.");
    assert(report.purchasesSummary.paymentRate === 60, "Le taux de règlement fournisseur doit être 60%.");
  });

  // ─── TEST 4: Dépenses d'Exploitation et Trésorerie ─────────────────────────
  await executeTest(4, "Ventilation des charges par catégorie et flux net de trésorerie espèces", async () => {
    const report = await getReportsData({ preset: "all" });
    assert(report.cashSummary.totalExpenses === 30000, "Le total des dépenses doit être 30 000 DA (25000 + 5000).");
    assert(report.cashSummary.expensesByCategory.length === 2, "2 catégories de dépenses (rent, transport).");

    const rentCat = report.cashSummary.expensesByCategory.find((c) => c.category === "rent");
    assert(rentCat?.total === 25000, "La catégorie Loyer doit afficher 25 000 DA.");

    // Encaissement espèces : 50 000 DA
    assert(report.cashSummary.cashCollections === 50000, "Les encaissements en espèces doivent être 50 000 DA.");
    // Flux net espèces : 50 000 DA (entrées) - 30 000 DA (dépenses) = 20 000 DA
    assert(report.cashSummary.netOperatingCash === 20000, "Le flux net de caisse espèces doit être 20 000 DA.");
  });

  // ─── TEST 5: Valorisation des Stocks par Dépôt ─────────────────────────────
  await executeTest(5, "Valorisation exacte des stocks au coût d'achat et au prix de vente par dépôt", async () => {
    const report = await getReportsData({ preset: "all" });

    // Stock global : 4 Tables (4x40 000 DA coût = 160 000 DA, 4x60 000 DA vente = 240 000 DA)
    // + 1 Chaise (1x0 DA coût = 0 DA, 1x15 000 DA vente = 15 000 DA)
    // Global Coût = 160 000 DA, Global Vente = 255 000 DA, Pièces = 5
    assert(report.stockValuation.globalTotalQuantity === 5, "La quantité totale de pièces doit être 5.");
    assert(report.stockValuation.globalValuationCost === 160000, "La valorisation au coût doit être 160 000 DA.");
    assert(report.stockValuation.globalValuationSelling === 255000, "La valorisation à la vente doit être 255 000 DA.");

    // Showroom Alger : 3 Tables + 1 Chaise = 4 pièces
    const whAlger = report.stockValuation.warehouses.find((w) => w.locationCode === "ALGER-01");
    assert(whAlger?.totalQuantity === 4, "Showroom Alger doit comporter 4 pièces.");
    assert(whAlger?.valuationCost === 120000, "Valeur coût Alger = 120 000 DA (3 x 40000).");
    assert(whAlger?.valuationSelling === 195000, "Valeur vente Alger = 195 000 DA (3 x 60000 + 1 x 15000).");

    // Entrepôt Blida : 1 Table = 1 pièce
    const whBlida = report.stockValuation.warehouses.find((w) => w.locationCode === "BLIDA-01");
    assert(whBlida?.totalQuantity === 1, "Entrepôt Blida doit comporter 1 pièce.");
    assert(whBlida?.valuationCost === 40000, "Valeur coût Blida = 40 000 DA.");
    assert(whBlida?.valuationSelling === 60000, "Valeur vente Blida = 60 000 DA.");
  });

  // ─── TEST 6: Détection des Alertes Sous-Stock ──────────────────────────────
  await executeTest(6, "Identification des produits en rupture / sous-stock critique", async () => {
    const report = await getReportsData({ preset: "all" });
    // Chaise Velours : stock = 1, minStock = 5 -> manque = 4
    assert(report.lowStockAlerts.length === 1, "1 produit en sous-stock critique.");
    assert(report.lowStockAlerts[0].sku === "CHAISE-002", "Le produit en alerte doit être CHAISE-002.");
    assert(report.lowStockAlerts[0].shortage === 4, "Le déficit de stock doit être de 4 pièces.");
  });

  // ─── TEST 7: Filtrage par Période (Bornes Temporelles) ─────────────────────
  await executeTest(7, "Exclusion stricte des transactions hors période d'analyse", async () => {
    // Requête sur une période passée (ex: 2024)
    const reportPast = await getReportsData({
      startDate: "2024-01-01",
      endDate: "2024-12-31",
    });
    assert(reportPast.salesSummary.invoicedRevenue === 0, "Aucune vente en 2024.");
    assert(reportPast.purchasesSummary.totalPurchases === 0, "Aucun achat en 2024.");
    assert(reportPast.cashSummary.totalExpenses === 0, "Aucune dépense en 2024.");
  });

  // ─── NETTOYAGE ────────────────────────────────────────────────────────────
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch {
    // ignore
  }

  // ─── BILAN ────────────────────────────────────────────────────────────────
  console.log("\n================================================================================");
  console.log("  RÉSUMÉ DES TESTS DU MODULE RAPPORTS & ANALYSES");
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
    console.log("\n✓ TOUS LES TESTS DU MODULE RAPPORTS SONT AU VERT !\n");
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale des tests rapports:", err);
  process.exit(1);
});
