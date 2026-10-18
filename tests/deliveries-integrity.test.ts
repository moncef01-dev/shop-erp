/**
 * Integration Test Suite: Simple Livraisons & Bon de Livraison Algérien (Décret 05-468)
 *
 * Runs against an isolated temporary SQLite database: prisma/test_deliveries_runner.db
 * Never touches real shop data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";
import { createClient } from "@libsql/client";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_deliveries_runner.db");

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
  console.log("  SHOP ERP — SUITE DE TESTS D'INTÉGRITÉ : LIVRAISONS & BON DE LIVRAISON");
  console.log("  Base de test isolée :", testDbPath);
  console.log("================================================================================\n");

  // 1. Initialiser le schéma via les migrations SQL
  const ddlClient = createClient({ url: `file:${testDbPath}` });
  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const migrationFolders = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const folder of migrationFolders) {
    const sqlPath = path.join(migrationsDir, folder, "migration.sql");
    if (fs.existsSync(sqlPath)) {
      const sqlContent = fs.readFileSync(sqlPath, "utf-8");
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

  // Initialiser les dépendances dynamiquement
  const { prisma } = await import("@/lib/prisma");
  const { createSaleAction } = await import("@/app/sales/actions");
  const {
    getDeliveriesModuleData,
    updateDeliveryStatusAction,
    updateDeliveryMethodAction,
  } = await import("@/app/deliveries/actions");

  // Fixtures de base
  const loc = await prisma.location.create({
    data: { name: "Showroom Alger", code: "ALGER", isDefault: true },
  });

  const cat = await prisma.category.create({
    data: { name: "Salons & Canapés" },
  });

  const prodA = await prisma.product.create({
    data: {
      name: "Canapé Cuir 3 Places",
      sku: "CAN-001",
      sellingPrice: 120000,
      costPrice: 85000,
      stock: 10,
      minStock: 2,
      categoryId: cat.id,
      stocks: {
        create: { locationId: loc.id, quantity: 10 },
      },
    },
  });

  const prodB = await prisma.product.create({
    data: {
      name: "Table Basse Bois Massif",
      sku: "TAB-002",
      sellingPrice: 35000,
      costPrice: 22000,
      stock: 5,
      minStock: 1,
      categoryId: cat.id,
      stocks: {
        create: { locationId: loc.id, quantity: 5 },
      },
    },
  });

  const customer = await prisma.customer.create({
    data: {
      name: "Amine Benali",
      phone: "0550123456",
      address: "14 Rue Didouche Mourad, Alger Centre",
    },
  });

  // Shop settings pour les mentions légales algériennes (Décret 05-468)
  await prisma.shopSettings.create({
    data: {
      id: 1,
      shopName: "Meubles & Déco Alger",
      address: "Zone d'Activité Dar El Beïda, Alger",
      phone: "023809000",
      nifRc: "RC: 16/00-1234567B16 | NIF: 001616012345678",
      nis: "00161601234567890",
      legalForm: "SARL au capital de 10 000 000 DA",
      documentFooter: "Garantie légale de conformité 24 mois.",
    },
  });

  let homeSaleId: number;
  let homeDeliveryId: number;
  let homeDeliveryRef: string;
  let pickupDeliveryId: number;

  // ── TEST 1: Vente avec livraison à domicile ─────────────────────────────────
  await executeTest(1, "Création d'une vente avec livraison à domicile", async () => {
    const res = await createSaleAction({
      customerId: customer.id,
      status: "confirmed",
      items: [{ productId: prodA.id, locationId: loc.id, quantity: 2, unitPrice: 120000 }],
      deliveryFee: 4000,
      delivery: {
        hasDelivery: true,
        method: "home_delivery",
        fee: 4000,
        address: "14 Rue Didouche Mourad, Alger Centre",
        plannedDate: "2026-10-25",
        notes: "Étage 2, digicode 1234",
        carrierName: "Karim Transport",
      },
    });

    assert(res.success, `Erreur création vente: ${res.error}`);
    const sale = res.data as { id: number; totalAmount: number };
    homeSaleId = sale.id;

    // Facture totale = 2 * 120 000 + 4000 = 244 000 DA
    assert(sale.totalAmount === 244000, `Total facture invalide: ${sale.totalAmount}`);

    const deliveries = await prisma.delivery.findMany({ where: { saleId: sale.id } });
    assert(deliveries.length === 1, `Une seule fiche livraison doit être créée (trouvé: ${deliveries.length})`);

    const del = deliveries[0];
    homeDeliveryId = del.id;
    homeDeliveryRef = del.reference;

    assert(del.reference.startsWith("LIV-"), `Format référence invalide: ${del.reference}`);
    assert(del.method === "home_delivery", `Mode de livraison invalide: ${del.method}`);
    assert(del.status === "to_prepare" || del.status === "pending", `Statut initial doit être to_prepare ou pending (trouvé: ${del.status})`);
    assert(del.fee === 4000, `Frais de livraison invalides: ${del.fee}`);
    assert(del.address === "14 Rue Didouche Mourad, Alger Centre", "Adresse incorrecte");
  });

  // ── TEST 2: Vente avec retrait au magasin ────────────────────────────────────
  await executeTest(2, "Création d'une vente avec retrait au magasin (store_pickup)", async () => {
    const res = await createSaleAction({
      customerId: customer.id,
      status: "confirmed",
      items: [{ productId: prodB.id, locationId: loc.id, quantity: 1, unitPrice: 35000 }],
      deliveryFee: 0,
      delivery: {
        hasDelivery: true,
        method: "store_pickup",
        fee: 0,
        address: "Retrait au comptoir",
        notes: "Retrait par le client samedi matin",
      },
    });

    assert(res.success, `Erreur création vente: ${res.error}`);
    const sale = res.data as { id: number; totalAmount: number };
    assert(sale.id > 0, "Id vente retrait valide");

    const del = await prisma.delivery.findFirst({ where: { saleId: sale.id } });
    assert(Boolean(del), "Fiche livraison retrait introuvable");
    pickupDeliveryId = del!.id;

    assert(del!.method === "store_pickup", "Le mode doit être store_pickup");
    assert(del!.fee === 0, `Les frais de retrait doivent être de 0 DA (trouvé: ${del!.fee})`);
    assert(del!.reference !== homeDeliveryRef, "Les références de livraison doivent être uniques");
  });

  // ── TEST 3: Déduction de stock unique lors de la vente ───────────────────────
  await executeTest(3, "Vérification de la déduction unique du stock (2 unités de prodA)", async () => {
    const currentProdA = await prisma.product.findUnique({ where: { id: prodA.id } });
    assert(currentProdA!.stock === 8, `Stock attendu: 8 (trouvé: ${currentProdA!.stock})`);
  });

  // ── TEST 4: Tableau de bord & KPIs logistiques ──────────────────────────────
  await executeTest(4, "Calcul des métriques logistiques (en attente vs retraits magasin)", async () => {
    const data = await getDeliveriesModuleData();

    assert(data.metrics.totalDeliveries >= 2, "Total livraisons incorrect");
    // La livraison domicile est en attente
    assert(data.metrics.pendingHomeCount >= 1, "Compte pending home incorrect");
    // Le retrait au magasin est exclu des tournées domicile
    assert(data.metrics.storePickupsCount >= 1, "Compte retraits magasin incorrect");

    const homeItem = data.deliveries.find((d) => d.id === homeDeliveryId);
    assert(Boolean(homeItem), "Fiche livraison domicile introuvable dans le dashboard");
    assert(!homeItem!.isPickup, "isPickup doit être false pour livraison domicile");
    assert(homeItem!.customerPhone === "0550123456", "Téléphone client manquant");
    assert(homeItem!.items.length === 1, "Nombre d'articles de livraison incorrect");
    assert(homeItem!.items[0].product?.sku === "CAN-001", "SKU de meuble incorrect");
  });

  // ── TEST 5: Transitions de statuts de livraison ──────────────────────────────
  await executeTest(5, "Mise à jour séquentielle des statuts logistiques", async () => {
    // 1. to_prepare -> ready
    const res1 = await updateDeliveryStatusAction(homeDeliveryId, "ready");
    assert(res1.success, `Erreur transition ready: ${res1.error}`);

    let del = await prisma.delivery.findUnique({ where: { id: homeDeliveryId } });
    assert(del!.status === "ready", "Statut attendu: ready");

    // 2. ready -> in_transit avec assignation de transporteur
    const res2 = await updateDeliveryStatusAction(homeDeliveryId, "in_transit", {
      carrierName: "Mourad Express",
    });
    assert(res2.success, `Erreur transition in_transit: ${res2.error}`);

    del = await prisma.delivery.findUnique({ where: { id: homeDeliveryId } });
    assert(del!.status === "in_transit", "Statut attendu: in_transit");
    assert(del!.carrierName === "Mourad Express", "Transporteur non enregistré");

    // 3. in_transit -> delivered avec enregistrement du réceptionnaire
    const res3 = await updateDeliveryStatusAction(homeDeliveryId, "delivered", {
      recipientName: "Amine Benali (Signature Client)",
    });
    assert(res3.success, `Erreur transition delivered: ${res3.error}`);

    del = await prisma.delivery.findUnique({ where: { id: homeDeliveryId } });
    assert(del!.status === "delivered", "Statut attendu: delivered");
    assert(del!.recipientName === "Amine Benali (Signature Client)", "Réceptionnaire non enregistré");
    assert(Boolean(del!.deliveredAt), "Date de livraison effective deliveredAt non enregistrée");
  });

  // ── TEST 6: Intégrité stock et comptable lors des statuts ───────────────────
  await executeTest(6, "La livraison finale ne déduit PAS le stock une 2ème fois et ne modifie pas les comptes", async () => {
    const currentProdA = await prisma.product.findUnique({ where: { id: prodA.id } });
    assert(currentProdA!.stock === 8, `Le stock de prodA ne doit pas changer (attendu: 8, trouvé: ${currentProdA!.stock})`);

    const sale = await prisma.sales.findUnique({ where: { id: homeSaleId } });
    assert(sale!.totalAmount === 244000, "Le montant total de la facture ne doit pas changer");
    assert(sale!.deliveryStatus === "delivered", "Le deliveryStatus de la vente doit être synchronisé");

    // Aucun paiement fantôme créé automatiquement
    const payments = await prisma.payment.findMany({ where: { saleId: homeSaleId } });
    assert(payments.length === 0, "Aucun paiement ne doit être créé lors de la livraison");
  });

  // ── TEST 7: Basculement de mode de distribution ─────────────────────────────
  await executeTest(7, "Basculement d'un retrait magasin en livraison sans duplication de frais", async () => {
    const res = await updateDeliveryMethodAction(pickupDeliveryId, "home_delivery", "Adresse client mise à jour");
    assert(res.success, `Erreur basculement mode: ${res.error}`);

    const del = await prisma.delivery.findUnique({ where: { id: pickupDeliveryId } });
    assert(del!.method === "home_delivery", "Mode attendu: home_delivery");
    assert(del!.fee === 0, "Les frais ne doivent pas être dupliqués");
    assert(del!.address === "Adresse client mise à jour", "Adresse mise à jour incorrecte");
  });

  // ── TEST 8: Rejet des statuts invalides ─────────────────────────────────────
  await executeTest(8, "Rejet des statuts arbitraires ou invalides", async () => {
    const res = await updateDeliveryStatusAction(pickupDeliveryId, "statut_fantome");
    assert(!res.success, "Un statut invalide doit être rejeté");
  });

  // ── TEST 9: Données du Bon de Livraison (Décret 05-468) ──────────────────────
  await executeTest(9, "Vérification des mentions obligatoires du Bon de Livraison (BL)", async () => {
    const data = await getDeliveriesModuleData();
    const settings = data.settings;

    // Mentions vendeur
    assert(Boolean(settings?.shopName), "Nom commercial manquant");
    assert(Boolean(settings?.nifRc), "NIF/RC manquant");
    assert(Boolean(settings?.nis), "NIS manquant");
    assert(Boolean(settings?.legalForm), "Forme juridique manquante");

    // Fiche BL
    const bl = data.deliveries.find((d) => d.id === homeDeliveryId);
    assert(Boolean(bl), "Fiche BL introuvable");
    assert(bl!.reference.startsWith("LIV-"), "Référence BL invalide");
    assert(bl!.saleRef.startsWith("FAC-"), "Référence facture liée invalide");
    assert(bl!.items.length > 0, "Lignes de meuble requises pour le BL");
    assert(bl!.items[0].quantity === 2, "Quantité livrée incorrecte");
    assert(Boolean(bl!.carrierName), "Nom du livreur requis");
    assert(Boolean(bl!.recipientName), "Nom du réceptionnaire requis");
  });

  // ── TEST 10: Robustesse face aux enregistrements hérités (legacy) ────────────
  await executeTest(10, "Compatibilité totale avec les enregistrements historiques", async () => {
    // Insérer une livraison legacy (ex: créée avant la migration sans méthode explicite)
    const legacySale = await prisma.sales.create({
      data: {
        reference: "FAC-LEGACY-001",
        totalAmount: 50000,
        paidAmount: 50000,
        saleDate: new Date(),
        status: "confirmed",
        paymentStatus: "paid",
        deliveryFee: 0,
      },
    });

    const legacyDel = await prisma.delivery.create({
      data: {
        reference: "LIV-LEGACY-001",
        saleId: legacySale.id,
        status: "pending",
        fee: 0,
        address: "Adresse ancienne",
      },
    });

    const data = await getDeliveriesModuleData();
    const found = data.deliveries.find((d) => d.id === legacyDel.id);
    assert(Boolean(found), "Livraison legacy introuvable");
    // Doit être traitée comme pending / to_prepare
    assert(found!.status === "pending", "Statut legacy préservé");

    // Possibilité de la mettre à jour vers les nouveaux statuts
    const updRes = await updateDeliveryStatusAction(legacyDel.id, "to_prepare");
    assert(updRes.success, "La mise à jour d'un enregistrement legacy doit réussir");
  });

  // Bilan
  console.log("\n================================================================================");
  console.log("  RÉSULTATS DE LA SUITE DE TESTS LIVRAISONS");
  console.log("================================================================================");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`  Tests réussis : ${passed} / ${results.length}`);
  if (failed > 0) {
    console.log(`  Tests échoués : ${failed}`);
    process.exit(1);
  } else {
    console.log("  TOUS LES TESTS D'INTÉGRITÉ LIVRAISONS SONT VALIDÉS AVEC SUCCÈS.");
  }
}

runTests()
  .catch((e) => {
    console.error("FATAL ERROR IN TEST RUNNER:", e);
    process.exit(1);
  })
  .finally(() => {
    try {
      if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
      if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
      if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    } catch {
      // Ignore
    }
  });
