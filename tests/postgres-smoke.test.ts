/**
 * Smoke test PostgreSQL — exécuté UNIQUEMENT si TEST_POSTGRES_URL est défini.
 * Usage :
 *   1. Démarrer PostgreSQL et créer une base jetable :
 *        createdb shop_smoke_test
 *   2. TEST_POSTGRES_URL=postgresql://user:pass@localhost:5432/shop_smoke_test npm run test:pg:smoke
 *
 * Le script applique le schéma via `prisma migrate deploy` (migrations-postgres),
 * puis vérifie : une lecture, une transaction, une déduction de stock atomique.
 */

import { execSync } from "node:child_process";

const TEST_URL = process.env.TEST_POSTGRES_URL;

if (!TEST_URL || !TEST_URL.trim()) {
  console.error(
    "✗ test:pg:smoke nécessite TEST_POSTGRES_URL (base PostgreSQL jetable).\n" +
      "  Exemple : TEST_POSTGRES_URL=postgresql://user:pass@localhost:5432/shop_smoke_test npm run test:pg:smoke"
  );
  process.exit(1);
}

process.env.DB_PROVIDER = "postgres";
process.env.POSTGRES_DATABASE_URL = TEST_URL;

function assert(cond: boolean, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  // 1. Appliquer les migrations PostgreSQL (baseline + suivantes)
  console.log("→ Application des migrations PostgreSQL (prisma migrate deploy)...");
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env },
  });

  const { prisma } = await import("@/server/db");

  // 2. Une lecture
  const productCount = await prisma.product.count();
  console.log(`✓ Lecture OK — ${productCount} produit(s) dans la base de smoke.`);

  // 3. Une transaction (création + suppression d'un emplacement jetable)
  const smokeLoc = await prisma.$transaction(async (tx) => {
    const created = await tx.location.create({
      data: {
        code: `SMOKE_${Date.now()}`,
        name: "Smoke Test Location",
        address: null,
        isDefault: false,
        isActive: false,
      },
    });
    return created;
  });
  assert(!!smokeLoc.id, "La création transactionnelle d'emplacement a échoué.");
  console.log("✓ Transaction OK — emplacement jetable créé.");

  // 4. Déduction de stock atomique (updateMany conditionnel)
  const cat = await prisma.category.create({ data: { name: `SMOKE_CAT_${Date.now()}` } });
  const prod = await prisma.product.create({
    data: {
      sku: `SMOKE-${Date.now()}`,
      name: "Smoke Test Product",
      categoryId: cat.id,
      category: cat.name,
      costPrice: 1000,
      sellingPrice: 2000,
      unitPrice: 2000,
      minStock: 0,
      stock: 5,
      isActive: true,
    },
  });
  await prisma.productStock.create({
    data: { productId: prod.id, locationId: smokeLoc.id, quantity: 5 },
  });

  const overdraw = await prisma.productStock.updateMany({
    where: { productId: prod.id, locationId: smokeLoc.id, quantity: { gte: 10 } },
    data: { quantity: { decrement: 10 } },
  });
  assert(overdraw.count === 0, "Le sur-tirage aurait dû être refusé (count=0 attendu).");

  const okDraw = await prisma.productStock.updateMany({
    where: { productId: prod.id, locationId: smokeLoc.id, quantity: { gte: 3 } },
    data: { quantity: { decrement: 3 } },
  });
  assert(okDraw.count === 1, "La déduction conditionnelle aurait dû toucher 1 ligne.");

  const remaining = await prisma.productStock.findUnique({
    where: { productId_locationId: { productId: prod.id, locationId: smokeLoc.id } },
  });
  assert(remaining?.quantity === 2, `Stock restant attendu 2, obtenu ${remaining?.quantity}.`);
  console.log("✓ Déduction atomique OK — 5 → 2, sur-tirage refusé.");

  // 5. Nettoyage
  await prisma.productStock.deleteMany({ where: { productId: prod.id } });
  await prisma.stockMovement.deleteMany({ where: { productId: prod.id } });
  await prisma.product.delete({ where: { id: prod.id } });
  await prisma.category.delete({ where: { id: cat.id } });
  await prisma.location.delete({ where: { id: smokeLoc.id } });
  console.log("✓ Nettoyage effectué.");

  console.log("\n================================================================================");
  console.log("  SMOKE POSTGRESQL : TOUS LES CONTRÔLES SONT AU VERT ✓");
  console.log("================================================================================");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("✗ SMOKE POSTGRESQL ÉCHOUÉ :", err);
  process.exit(1);
});
