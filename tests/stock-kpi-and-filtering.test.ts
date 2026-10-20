/**
 * Integration Test: Stock Module KPIs & Improved Filtering
 * Tests:
 * 1. Articles référencés (distinct active products, no double-counting)
 * 2. Unités en stock (sum across all locations)
 * 3. Articles en rupture (distinct active products with 0 total quantity across ALL locations)
 * 4. Multi-location zero stock check: article with 0 in Location A but >0 in Location B is NOT out of stock
 * 5. Mouvements aujourd'hui (count of movements recorded today)
 * 6. Filtering logic (category, location, search, global rupture)
 * 7. Negative stock prevention rule preserved
 */

import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import assert from "assert";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_stock_kpi_runner.db");
try {
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
} catch {
  // Ignore
}

process.env.DATABASE_URL = `file:${testDbPath}`;

async function run() {
  console.log("=== TEST SUITE: STOCK KPIS, ZERO-STOCK RUPTURE & FILTERING ===");

  // Apply migrations to test DB
  execSync(`npx prisma migrate deploy`, {
    env: { ...process.env, DATABASE_URL: `file:${testDbPath}` },
    stdio: "pipe",
  });

  const { prisma } = await import("../src/lib/prisma");
  const {
    getProductsModuleData,
    recordStockReceiptAction,
    recordStockIssueAction,
  } = await import("../src/app/products/actions");

  // 1. Seed categories
  const catFauteuil = await prisma.category.create({
    data: { name: "Fauteuil" },
  });
  const catTable = await prisma.category.create({
    data: { name: "Table" },
  });
  const catChambre = await prisma.category.create({
    data: { name: "Chambre" },
  });

  // 2. Seed locations
  const locShowroom = await prisma.location.create({
    data: { code: "SHOWROOM", name: "Showroom", isDefault: true, isActive: true },
  });
  const locChaaban = await prisma.location.create({
    data: { code: "GARAGE_CHAABAN", name: "Garage Chaaban", isDefault: false, isActive: true },
  });
  const locCheikh = await prisma.location.create({
    data: { code: "GARAGE_CHEIKH", name: "Garage Cheikh", isDefault: false, isActive: true },
  });

  // 3. Seed products:
  // Product 1: Stored in multiple locations (3 in Showroom, 7 in Chaaban -> total 10)
  const prodMulti = await prisma.product.create({
    data: {
      sku: "F001",
      name: "Fauteuil Royal Cuir",
      model: "Modèle Prestige",
      categoryId: catFauteuil.id,
      isActive: true,
      stock: 0,
    },
  });

  // Product 2: Stored in one location but 0 in another (0 in Showroom, 4 in Cheikh -> total 4)
  // Crucial test case: Must NOT be considered out of stock!
  const prodPartialZero = await prisma.product.create({
    data: {
      sku: "T001",
      name: "Table Basse Verre",
      model: "Modèle Oval",
      categoryId: catTable.id,
      isActive: true,
      stock: 0,
    },
  });

  // Product 3: Completely out of stock (0 in all locations -> total 0)
  const prodRupture = await prisma.product.create({
    data: {
      sku: "C001",
      name: "Lit Deux Places Bois",
      model: "Modèle Queen",
      categoryId: catChambre.id,
      isActive: true,
      stock: 0,
    },
  });

  // Product 4: Inactive product with 0 stock (should not be counted in active KPIs)
  const prodInactive = await prisma.product.create({
    data: {
      sku: "F099",
      name: "Fauteuil Vintage Inactif",
      categoryId: catFauteuil.id,
      isActive: false,
      stock: 0,
    },
  });

  // 4. Record stock receipts
  // Product 1 receipts
  await recordStockReceiptAction(
    toFormData({
      productId: String(prodMulti.id),
      locationId: String(locShowroom.id),
      quantity: "3",
      reason: "Livraison showroom",
    })
  );
  await recordStockReceiptAction(
    toFormData({
      productId: String(prodMulti.id),
      locationId: String(locChaaban.id),
      quantity: "7",
      reason: "Stockage entrepôt Chaaban",
    })
  );

  // Product 2 receipt (only in Cheikh)
  await recordStockReceiptAction(
    toFormData({
      productId: String(prodPartialZero.id),
      locationId: String(locCheikh.id),
      quantity: "4",
      reason: "Stockage entrepôt Cheikh",
    })
  );
  // Also create a 0-quantity record in Showroom for Product 2
  await prisma.productStock.create({
    data: {
      productId: prodPartialZero.id,
      locationId: locShowroom.id,
      quantity: 0,
    },
  });

  // 5. Test getProductsModuleData() database queries
  const moduleData = await getProductsModuleData();
  const { products, movements, todayMovementsCount } = moduleData;

  console.log("-> Checking getProductsModuleData output...");
  assert(products.length === 4, `Attendu 4 produits, trouvé ${products.length}`);
  assert(todayMovementsCount === 3, `Attendu 3 mouvements aujourd'hui, trouvé ${todayMovementsCount}`);

  // Test KPI 1: Articles référencés (distinct active products)
  const activeProducts = products.filter((p) => p.isActive);
  assert.strictEqual(
    activeProducts.length,
    3,
    `Articles référencés doit être 3 (F001, T001, C001), obtenu: ${activeProducts.length}`
  );

  // Test KPI 2: Unités en stock (sum across all locations)
  const totalUnits = activeProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
  assert.strictEqual(
    totalUnits,
    14,
    `Unités en stock doit être 14 (3 + 7 + 4 + 0), obtenu: ${totalUnits}`
  );

  // Test KPI 3: Articles en rupture (distinct active products whose total quantity across all locations is zero)
  const outOfStockProducts = activeProducts.filter((p) => p.stock === 0);
  assert.strictEqual(
    outOfStockProducts.length,
    1,
    `Articles en rupture doit être exactement 1 (C001), obtenu: ${outOfStockProducts.length}`
  );
  assert.strictEqual(
    outOfStockProducts[0].sku,
    "C001",
    `Le produit en rupture doit être C001, obtenu: ${outOfStockProducts[0].sku}`
  );

  // CRITICAL TEST: Product with 0 in Showroom but 4 in Cheikh must NOT be in outOfStockProducts
  const partialZeroInRupture = outOfStockProducts.some((p) => p.sku === "T001");
  assert.strictEqual(
    partialZeroInRupture,
    false,
    "T001 a 0 en Showroom mais 4 dans le Garage Cheikh : il NE DOIT PAS être considéré en rupture !"
  );

  // Test KPI 4: Mouvements aujourd'hui
  assert.strictEqual(
    todayMovementsCount,
    3,
    `Mouvements aujourd'hui doit être 3, obtenu: ${todayMovementsCount}`
  );

  // 6. Test filtering logic
  console.log("-> Checking filtering logic...");

  // Helper matching the component's useMemo filter
  function filterItems(
    items: typeof products,
    filters: {
      searchTerm?: string;
      selectedCategory?: string;
      selectedLocation?: string;
      selectedStockStatus?: string;
    }
  ) {
    const {
      searchTerm = "",
      selectedCategory = "ALL",
      selectedLocation = "ALL",
      selectedStockStatus = "ALL",
    } = filters;

    return items.filter((p) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.model && p.model.toLowerCase().includes(q));

      const matchesCategory =
        selectedCategory === "ALL" ||
        (p.categoryId !== null && p.categoryId.toString() === selectedCategory);

      const totalStock =
        p.stocks && p.stocks.length > 0
          ? p.stocks.reduce((acc, s) => acc + (s.quantity || 0), 0)
          : (p.stock || 0);

      let matchesStockStatus = true;
      if (selectedStockStatus === "IN_STOCK") {
        matchesStockStatus = totalStock > 0;
      } else if (selectedStockStatus === "OUT_OF_STOCK") {
        matchesStockStatus = totalStock === 0;
      }

      let matchesLocation = true;
      if (selectedLocation !== "ALL") {
        const locId = parseInt(selectedLocation, 10);
        const st = p.stocks.find((s) => s.locationId === locId);
        if (selectedStockStatus === "OUT_OF_STOCK") {
          matchesLocation = !!st || p.stocks.length === 0;
        } else {
          matchesLocation = !!st && st.quantity > 0;
        }
      }

      return matchesSearch && matchesCategory && matchesStockStatus && matchesLocation;
    });
  }

  // Filter by category: Fauteuil
  const fauteuils = filterItems(products, { selectedCategory: catFauteuil.id.toString() });
  assert(fauteuils.some((p) => p.sku === "F001"), "Fauteuil F001 doit correspondre");
  assert(!fauteuils.some((p) => p.sku === "T001"), "Table T001 ne doit pas être dans Fauteuils");

  // Filter by location: Garage Chaaban (has F001)
  const chaabanItems = filterItems(products, { selectedLocation: locChaaban.id.toString() });
  assert.strictEqual(chaabanItems.length, 1, "Seul F001 a du stock dans Garage Chaaban");
  assert.strictEqual(chaabanItems[0].sku, "F001");

  // Filter by search: "Verre"
  const searchVerre = filterItems(products, { searchTerm: "Verre" });
  assert.strictEqual(searchVerre.length, 1, "Un seul article contient 'Verre'");
  assert.strictEqual(searchVerre[0].sku, "T001");

  // Filter by Rupture de stock (OUT_OF_STOCK)
  const ruptureItems = filterItems(products, { selectedStockStatus: "OUT_OF_STOCK" });
  assert(ruptureItems.some((p) => p.sku === "C001"), "C001 (stock 0) doit être dans les ruptures");
  assert(!ruptureItems.some((p) => p.sku === "T001"), "T001 a du stock global : ne doit PAS être dans les ruptures !");
  assert(!ruptureItems.some((p) => p.sku === "F001"), "F001 a du stock global : ne doit PAS être dans les ruptures !");

  // 7. Verify negative stock business rule is strictly preserved
  console.log("-> Checking negative stock prevention...");
  const issueResult = await recordStockIssueAction(
    toFormData({
      productId: String(prodMulti.id),
      locationId: String(locShowroom.id),
      quantity: "999", // Attempt to issue more than 3
      reason: "Tentative de sortie excessive",
    })
  );
  assert.strictEqual(issueResult.success, false, "Une sortie supérieure au stock disponible doit échouer !");
  assert(
    issueResult.error?.includes("Stock insuffisant"),
    `Message attendu 'Stock insuffisant', obtenu: ${issueResult.error}`
  );

  console.log("✓ TOUS LES TESTS DE VALIDATION DU MODULE STOCK ONT RÉUSSI AVEC SUCCÈS !");

  // Clean up
  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  } catch {
    // Ignore
  }
}

function toFormData(data: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(data)) {
    fd.append(k, v);
  }
  return fd;
}

run().catch((err) => {
  console.error("FATAL ERROR IN TEST SUITE:", err);
  process.exit(1);
});
