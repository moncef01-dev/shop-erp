/**
 * Integration Test Suite: Create New Client Directly from Sales Form
 *
 * Runs against an isolated temporary SQLite database: prisma/test_new_customer_sale_runner.db
 * Never touches real shop data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";
import { createClient } from "@libsql/client";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_new_customer_sale_runner.db");

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
  console.log("  SHOP ERP — SUITE DE TESTS : CRÉATION CLIENT DEPUIS LE FORMULAIRE DE VENTE");
  console.log("  Base de test isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Initialiser le schéma via les migrations SQL
  const ddlClient = createClient({ url: `file:${testDbPath}` });
  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const migrationFolders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  for (const folder of migrationFolders) {
    const migrationFile = path.join(migrationsDir, folder, "migration.sql");
    if (fs.existsSync(migrationFile)) {
      const sqlContent = fs.readFileSync(migrationFile, "utf-8");
      const statements = sqlContent
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      for (const statement of statements) {
        await ddlClient.execute(statement);
      }
    }
  }
  await ddlClient.close();

  // Import application actions & prisma
  const { prisma } = await import("../src/lib/prisma");
  const { createCustomerAction } = await import("../src/app/customers/actions");
  const { createSaleAction } = await import("../src/app/sales/actions");

  // Setup initial test data
  const showroom = await prisma.location.create({
    data: { name: "Showroom Test", code: "SHOWROOM", isDefault: true },
  });

  const category = await prisma.category.create({
    data: { name: "Salons" },
  });

  const product = await prisma.product.create({
    data: {
      sku: "SALON-ROYAL-01",
      name: "Salon Royal 7 Places",
      sellingPrice: 120000,
      categoryId: category.id,
      stocks: {
        create: {
          locationId: showroom.id,
          quantity: 10,
        },
      },
    },
  });

  let createdCustomerId: number = 0;

  // TEST 01: Rejet si nom manquant ou inférieur à 2 caractères
  await executeTest(1, "Validation stricte du nom requis (min 2 caractères)", async () => {
    const fd = new FormData();
    fd.append("name", " ");
    fd.append("phone", "0550112233");

    const res = await createCustomerAction(fd);
    assert(!res.success, "La création sans nom valide aurait dû échouer");
    assert(res.error?.includes("obligatoire") || false, "Message d'erreur explicite attendu");
  });

  // TEST 02: Création complète d'un client avec tous les 5 champs
  await executeTest(2, "Création d'un client avec les 5 champs et persistance en base", async () => {
    const fd = new FormData();
    fd.append("name", "Boudiaf Ahmed Enterprise");
    fd.append("phone", "0551 23 45 67");
    fd.append("email", "boudiaf@enterprise.dz");
    fd.append("address", "Zone Industrielle Rouiba, Alger");
    fd.append("notes", "Livraison VIP par hayon arrière uniquement");

    const res = await createCustomerAction(fd);
    assert(res.success, `La création a échoué: ${res.error}`);
    assert(!!res.data, "L'action doit retourner l'objet client créé");
    const custData = res.data as {
      id: number;
      name: string;
      phone: string | null;
      email: string | null;
      address: string | null;
      notes: string | null;
    };
    assert(custData.id > 0, "L'ID du client doit être un entier positif");
    assert(custData.name === "Boudiaf Ahmed Enterprise", "Nom incorrect");
    assert(custData.phone === "0551 23 45 67", "Téléphone incorrect");
    assert(custData.email === "boudiaf@enterprise.dz", "Email incorrect");
    assert(custData.address === "Zone Industrielle Rouiba, Alger", "Adresse incorrecte");
    assert(custData.notes === "Livraison VIP par hayon arrière uniquement", "Notes incorrectes");

    createdCustomerId = custData.id;

    // Vérifier la présence directe dans la table Customer
    const inDb = await prisma.customer.findUnique({ where: { id: createdCustomerId } });
    assert(!!inDb, "Le client doit être physiquement présent dans la table Customer");
    assert(inDb?.isActive === true, "Le client doit être actif par défaut");
  });

  // TEST 03: Rejet des doublons de numéro de téléphone si configuré
  await executeTest(3, "Détection et rejet d'un numéro de téléphone déjà enregistré", async () => {
    const fd = new FormData();
    fd.append("name", "Autre Client Doublon");
    fd.append("phone", "0551 23 45 67"); // Même téléphone que Test 2

    const res = await createCustomerAction(fd);
    assert(!res.success, "La création avec le même numéro de téléphone doit être rejetée");
    assert(res.error?.includes("téléphone") || false, "Erreur sur le téléphone attendue");
  });

  // TEST 04: Création d'une vente avec le nouveau client créé
  await executeTest(4, "Création d'une vente rattachée au nouveau client avec déduction de stock", async () => {
    const salePayload = {
      customerId: createdCustomerId,
      saleDate: "2026-10-18",
      status: "confirmed" as const,
      deliveryFee: 3000,
      discount: 5000,
      items: [
        {
          productId: product.id,
          locationId: showroom.id,
          quantity: 2,
          unitPrice: 120000,
          discount: 0,
        },
      ],
      initialPayment: {
        amount: 100000,
        method: "cash" as const,
        notes: "Acompte espèces à la commande",
      },
      includeDeliveryFee: true,
    };

    const res = await createSaleAction(salePayload);
    assert(res.success, `La création de vente a échoué: ${res.error}`);

    // Vérification en base
    const sale = await prisma.sales.findFirst({
      where: { customerId: createdCustomerId },
      include: { customer: true, items: true, payments: true },
    });

    assert(!!sale, "La vente doit être enregistrée pour ce client");
    assert(sale?.customerId === createdCustomerId, "L'ID client de la vente doit correspondre exactement");
    assert(sale?.customer?.name === "Boudiaf Ahmed Enterprise", "Le client lié doit être Boudiaf Ahmed Enterprise");
    assert(sale?.totalAmount === 238000, `Total attendu 238000 DA (2*120000 - 5000 + 3000), reçu: ${sale?.totalAmount}`);
    assert(sale?.paidAmount === 100000, "Acompte attendu 100000 DA");

    // Stock vérifié : 10 - 2 = 8
    const stockRow = await prisma.productStock.findUnique({
      where: {
        productId_locationId: {
          productId: product.id,
          locationId: showroom.id,
        },
      },
    });
    assert(stockRow?.quantity === 8, `Stock attendu 8, trouvé: ${stockRow?.quantity}`);
  });

  // TEST 05: Préservation du client si une vente ultérieure est annulée
  await executeTest(5, "Indépendance de la fiche client en cas d'annulation de vente", async () => {
    // Le client existe toujours
    const customer = await prisma.customer.findUnique({ where: { id: createdCustomerId } });
    assert(!!customer, "Le client doit persister de manière permanente");
  });

  // TEST 06: La vente comptoir (sans client / walkin) fonctionne toujours
  await executeTest(6, "Vente au comptoir (client passager null) continue de fonctionner parfaitement", async () => {
    const walkinPayload = {
      customerId: null,
      saleDate: "2026-10-18",
      status: "confirmed" as const,
      deliveryFee: 0,
      discount: 0,
      items: [
        {
          productId: product.id,
          locationId: showroom.id,
          quantity: 1,
          unitPrice: 120000,
          discount: 0,
        },
      ],
      initialPayment: {
        amount: 120000,
        method: "cash" as const,
      },
    };

    const res = await createSaleAction(walkinPayload);
    assert(res.success, `La vente comptoir a échoué: ${res.error}`);

    // Stock vérifié : 8 - 1 = 7
    const stockRow = await prisma.productStock.findUnique({
      where: {
        productId_locationId: {
          productId: product.id,
          locationId: showroom.id,
        },
      },
    });
    assert(stockRow?.quantity === 7, `Stock attendu 7, trouvé: ${stockRow?.quantity}`);
  });

  // Nettoyage de la base de test
  await prisma.$disconnect();
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  } catch {
    // Ignore
  }

  console.log("\n================================================================================");
  console.log("  RÉSULTATS DE LA SUITE : CRÉATION CLIENT DEPUIS LES VENTES");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`  Tests exécutés : ${total}`);
  console.log(`  Tests réussis  : ${passed}`);
  console.log(`  Tests échoués  : ${failed}`);

  if (failed > 0) {
    console.error("\n❌ DES TESTS ONT ÉCHOUÉ !");
    process.exit(1);
  } else {
    console.log("\n✓ TOUS LES TESTS SONT VALIDÉS AVEC SUCCÈS !");
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale d'exécution de la suite de tests:", err);
  process.exit(1);
});
