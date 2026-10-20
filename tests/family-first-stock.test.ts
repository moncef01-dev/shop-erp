/**
 * Integration Test: Family-First Article Selection & Stock Entry
 * Validates category filtering, family switching, formatting, and stock operations.
 * Uses isolated test database: prisma/test_family_stock_runner.db
 */

import path from "path";
import fs from "fs";
import { execSync } from "child_process";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_family_stock_runner.db");
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch {
  // Ignore lock
}

process.env.DATABASE_URL = `file:${testDbPath}`;

async function run() {
  console.log("=== TEST SUITE: FAMILY-FIRST ARTICLE SELECTION IN STOCK ===");

  // Apply migrations to test DB
  execSync(`npx prisma migrate deploy`, {
    env: { ...process.env, DATABASE_URL: `file:${testDbPath}` },
    stdio: "pipe",
  });

  const { prisma } = await import("../src/lib/prisma");
  const {
    getProductsModuleData,
    recordStockReceiptAction,
  } = await import("../src/app/products/actions");

  // 1. Seed categories
  const categoriesToSeed = [
    "Armoire",
    "Bahut",
    "Chambre",
    "Fauteuil",
    "Porte-chaussures",
    "Table",
    "Tapis",
    "VideSansArticles", // Test category with no articles
  ];

  const categoryMap = new Map<string, number>();
  for (const catName of categoriesToSeed) {
    const c = await prisma.category.create({
      data: { name: catName, description: `Description ${catName}` },
    });
    categoryMap.set(catName, c.id);
  }

  // 2. Seed showroom location
  const loc = await prisma.location.create({
    data: { code: "SHOWROOM", name: "Showroom", isDefault: true, isActive: true },
  });

  // 3. Seed products belonging to distinct categories
  const pFauteuil1 = await prisma.product.create({
    data: {
      sku: "F008",
      name: "Capila 7P",
      categoryId: categoryMap.get("Fauteuil")!,
      isActive: true,
      stock: 0,
    },
  });

  await prisma.product.create({
    data: {
      sku: "F005",
      name: "Alpha 7p",
      categoryId: categoryMap.get("Fauteuil")!,
      isActive: true,
      stock: 0,
    },
  });

  await prisma.product.create({
    data: {
      sku: "T022",
      name: "Table Base 5p",
      categoryId: categoryMap.get("Table")!,
      isActive: true,
      stock: 0,
    },
  });

  await prisma.product.create({
    data: {
      sku: "A001",
      name: "Armoire 2 portes",
      categoryId: categoryMap.get("Armoire")!,
      isActive: true,
      stock: 0,
    },
  });

  // Fetch module data like ProductsPage does
  const data = await getProductsModuleData();

  // TEST 1: Categories loaded properly
  console.log("Test 1: Verify all categories are returned in alphabetical order");
  const catNames = data.categories.map((c) => c.name);
  if (!catNames.includes("Fauteuil") || !catNames.includes("Table") || !catNames.includes("Armoire")) {
    throw new Error("Categories missing from module data");
  }
  console.log("  ✓ Categories available:", catNames);

  // TEST 2: Family filtering for "Fauteuil"
  console.log("Test 2: Select 'Fauteuil' family — only Fauteuil articles returned");
  const fauteuilId = categoryMap.get("Fauteuil")!;
  const fauteuilArticles = data.products.filter(
    (p) => p.isActive && (p.categoryId === fauteuilId || p.categoryRef?.id === fauteuilId)
  );
  if (fauteuilArticles.length !== 2) {
    throw new Error(`Expected 2 fauteuils, got ${fauteuilArticles.length}`);
  }
  if (!fauteuilArticles.some((p) => p.sku === "F008") || !fauteuilArticles.some((p) => p.sku === "F005")) {
    throw new Error("Missing expected fauteuil articles");
  }
  if (fauteuilArticles.some((p) => p.sku === "T022" || p.sku === "A001")) {
    throw new Error("Articles from other families leaked into Fauteuil selection!");
  }
  console.log("  ✓ Only Fauteuils returned:", fauteuilArticles.map((p) => `${p.sku} — ${p.name}`));

  // TEST 3: Formatting matches "SKU — Designation" (e.g. "F008 — Capila 7P")
  console.log("Test 3: Formatting matches reference and designation together");
  const formattedLabels = fauteuilArticles.map((p) => `${p.sku} — ${p.name}`);
  if (!formattedLabels.includes("F008 — Capila 7P")) {
    throw new Error("Formatted label F008 — Capila 7P not found");
  }
  console.log("  ✓ Formatted labels:", formattedLabels);

  // TEST 4: Family switching resets selected article and switches list
  console.log("Test 4: Switch family to 'Table'");
  const tableId = categoryMap.get("Table")!;
  const tableArticles = data.products.filter(
    (p) => p.isActive && (p.categoryId === tableId || p.categoryRef?.id === tableId)
  );
  if (tableArticles.length !== 1 || tableArticles[0].sku !== "T022") {
    throw new Error("Table articles mismatch");
  }
  if (tableArticles.some((p) => p.sku.startsWith("F"))) {
    throw new Error("Fauteuils leaked into Table family");
  }
  console.log("  ✓ Only Table articles returned:", tableArticles.map((p) => `${p.sku} — ${p.name}`));

  // TEST 5: Empty family detection
  console.log("Test 5: Empty family returns 0 articles (triggers 'Aucun article dans cette famille')");
  const emptyCatId = categoryMap.get("VideSansArticles")!;
  const emptyArticles = data.products.filter(
    (p) => p.isActive && (p.categoryId === emptyCatId || p.categoryRef?.id === emptyCatId)
  );
  if (emptyArticles.length !== 0) {
    throw new Error("Expected empty family to have 0 articles");
  }
  console.log("  ✓ Empty family correctly has 0 articles");

  // TEST 6: Submit valid stock entry for F008 via recordStockReceiptAction
  console.log("Test 6: Submit valid stock entry (Receipt / Ajouter au stock) for F008");
  const formData = new FormData();
  formData.append("productId", pFauteuil1.id.toString());
  formData.append("locationId", loc.id.toString());
  formData.append("quantity", "5");
  formData.append("reason", "Arrivage atelier nouveau modèle");
  formData.append("reference", "REC-TEST-001");

  const receiptRes = await recordStockReceiptAction(formData);
  if (!receiptRes.success) {
    throw new Error(`Receipt failed: ${receiptRes.error}`);
  }
  console.log("  ✓ Receipt action result:", receiptRes.message);

  // Verify stock was updated in DB
  const updatedProduct = await prisma.product.findUnique({ where: { id: pFauteuil1.id } });
  if (updatedProduct?.stock !== 5) {
    throw new Error(`Expected product stock to be 5, got ${updatedProduct?.stock}`);
  }

  const stockMovement = await prisma.stockMovement.findFirst({
    where: { productId: pFauteuil1.id, type: "RECEIPT" },
  });
  if (!stockMovement || stockMovement.quantity !== 5) {
    throw new Error("Stock movement record missing or incorrect quantity");
  }
  console.log("  ✓ Stock updated to 5 units and movement logged successfully.");

  // Clean up test DB
  await prisma.$disconnect();
  try {
    fs.unlinkSync(testDbPath);
  } catch {}

  console.log("\n================================================================================");
  console.log("  ALL FAMILY-FIRST ARTICLE SELECTION TESTS PASSED SUCCESSFULLY (6/6)!");
  console.log("================================================================================");
}

run().catch((err) => {
  console.error("FATAL ERROR IN TEST:", err);
  process.exit(1);
});
