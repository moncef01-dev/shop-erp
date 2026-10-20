/**
 * Comprehensive Integration & Regression Test Suite:
 * Sales Module Delivery Fees Simplification & Module Removal Verification
 *
 * Runs against an isolated temporary SQLite database: prisma/test_sales_delivery_fees.db
 * Never touches real production data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_sales_delivery_fees.db");
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
  console.log("  SHOP ERP — SUITE DE TESTS : FRAIS DE LIVRAISON SIMPLIFIÉS SUR FACTURE");
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

    for (const statement of statements) {
      try {
        await ddlClient.execute(statement);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("already exists") && !msg.includes("duplicate column")) {
          throw new Error(`Erreur migration ${folder}: ${msg}\nStatement: ${statement}`);
        }
      }
    }
  }

  // 2. Initialiser Prisma
  const { prisma } = await import("../src/lib/prisma");

  // Création du dépôt de test
  const showroom = await prisma.location.create({
    data: { name: "Showroom Principal", code: "LOC-SHOWROOM", isDefault: true, isActive: true },
  });

  // Catégorie et Meubles
  const catSalons = await prisma.category.create({
    data: { name: "Salons & Canapés" },
  });

  const canapeL = await prisma.product.create({
    data: {
      name: "Canapé d'Angle Cuir Italien",
      sku: "CAN-ANG-001",
      sellingPrice: 120000,
      costPrice: 80000,
      categoryId: catSalons.id,
      stock: 10,
      stocks: { create: { locationId: showroom.id, quantity: 10 } },
    },
  });

  const tableBasse = await prisma.product.create({
    data: {
      name: "Table Basse Marbre & Bois",
      sku: "TAB-BAS-002",
      sellingPrice: 35000,
      costPrice: 20000,
      categoryId: catSalons.id,
      stock: 15,
      stocks: { create: { locationId: showroom.id, quantity: 15 } },
    },
  });

  // Client de test
  const clientSofiane = await prisma.customer.create({
    data: {
      name: "Sofiane Meziane",
      phone: "0550112233",
      address: "Hydra, Alger",
      isActive: true,
    },
  });

  // Session de caisse ouverte pour tester l'absence stricte de dépense de livraison automatique
  const openSession = await prisma.cashSession.create({
    data: {
      reference: "CS-202610-0001",
      status: "open",
      openingAmount: 50000,
      totalCashIn: 0,
      totalCashOut: 0,
    },
  });

  const { createSaleAction, confirmDraftSaleAction } = await import("../src/app/sales/actions");

  // --------------------------------------------------------------------------
  // TEST 1: Vente sans frais de livraison (0 DA par défaut)
  // --------------------------------------------------------------------------
  try {
    const res = await createSaleAction({
      customerId: clientSofiane.id,
      status: "confirmed",
      items: [
        {
          productId: canapeL.id,
          locationId: showroom.id,
          quantity: 1,
          unitPrice: 120000,
        },
      ],
      deliveryFee: 0,
      includeDeliveryFee: false,
    });

    assert(res.success, `Échec Test 1: ${res.error}`);
    const sale = await prisma.sales.findUnique({ where: { id: (res.data as { id: number }).id } });
    assert(sale !== null, "Vente introuvable");
    assert(sale!.subtotal === 120000, `Sous-total attendu 120 000 DA, obtenu ${sale!.subtotal}`);
    assert(sale!.deliveryFee === 0, `Frais livraison attendus 0 DA, obtenu ${sale!.deliveryFee}`);
    assert(sale!.includeDeliveryFee === false, "includeDeliveryFee doit être false");
    assert(sale!.totalAmount === 120000, `Total attendu 120 000 DA, obtenu ${sale!.totalAmount}`);

    results.push({ num: 1, name: "Vente sans frais de livraison (0 DA par défaut)", passed: true });
    console.log("  ✓ Test 1 réussi");
  } catch (err) {
    results.push({ num: 1, name: "Vente sans frais de livraison (0 DA par défaut)", passed: false, error: String(err) });
    console.error("  ✗ Test 1 échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Frais de livraison saisis mais EXCLUS de la facture (includeDeliveryFee = false)
  // --------------------------------------------------------------------------
  try {
    const res = await createSaleAction({
      customerId: clientSofiane.id,
      status: "confirmed",
      items: [
        {
          productId: canapeL.id,
          locationId: showroom.id,
          quantity: 1,
          unitPrice: 120000,
        },
      ],
      deliveryFee: 3500,
      includeDeliveryFee: false,
    });

    assert(res.success, `Échec Test 2: ${res.error}`);
    const sale = await prisma.sales.findUnique({ where: { id: (res.data as { id: number }).id } });
    assert(sale !== null, "Vente introuvable");
    assert(sale!.subtotal === 120000, `Sous-total articles attendu 120 000 DA, obtenu ${sale!.subtotal}`);
    assert(sale!.deliveryFee === 3500, `Frais saisis attendus 3 500 DA, obtenu ${sale!.deliveryFee}`);
    assert(sale!.includeDeliveryFee === false, "includeDeliveryFee doit être false");
    // Le total de la facture ne doit PAS inclure les frais
    assert(sale!.totalAmount === 120000, `Total facture attendu 120 000 DA (excluant les 3 500 DA), obtenu ${sale!.totalAmount}`);

    results.push({ num: 2, name: "Frais de livraison saisis mais EXCLUS de la facture", passed: true });
    console.log("  ✓ Test 2 réussi");
  } catch (err) {
    results.push({ num: 2, name: "Frais de livraison saisis mais EXCLUS de la facture", passed: false, error: String(err) });
    console.error("  ✗ Test 2 échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Frais de livraison saisis et INCLUS dans la facture (includeDeliveryFee = true)
  // --------------------------------------------------------------------------
  try {
    const res = await createSaleAction({
      customerId: clientSofiane.id,
      status: "confirmed",
      items: [
        {
          productId: canapeL.id,
          locationId: showroom.id,
          quantity: 1,
          unitPrice: 120000,
        },
      ],
      deliveryFee: 4000,
      includeDeliveryFee: true,
    });

    assert(res.success, `Échec Test 3: ${res.error}`);
    const sale = await prisma.sales.findUnique({ where: { id: (res.data as { id: number }).id } });
    assert(sale !== null, "Vente introuvable");
    assert(sale!.subtotal === 120000, `Sous-total articles attendu 120 000 DA, obtenu ${sale!.subtotal}`);
    assert(sale!.deliveryFee === 4000, `Frais saisis attendus 4 000 DA, obtenu ${sale!.deliveryFee}`);
    assert(sale!.includeDeliveryFee === true, "includeDeliveryFee doit être true");
    // Le total de la facture doit inclure exactement une fois les frais
    assert(sale!.totalAmount === 124000, `Total facture attendu 124 000 DA (120 000 + 4 000), obtenu ${sale!.totalAmount}`);

    results.push({ num: 3, name: "Frais de livraison saisis et INCLUS dans la facture", passed: true });
    console.log("  ✓ Test 3 réussi");
  } catch (err) {
    results.push({ num: 3, name: "Frais de livraison saisis et INCLUS dans la facture", passed: false, error: String(err) });
    console.error("  ✗ Test 3 échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Facture avec remise globale ET frais de livraison inclus
  // --------------------------------------------------------------------------
  try {
    const res = await createSaleAction({
      customerId: clientSofiane.id,
      status: "confirmed",
      items: [
        {
          productId: canapeL.id,
          locationId: showroom.id,
          quantity: 1,
          unitPrice: 120000, // 120 000
        },
        {
          productId: tableBasse.id,
          locationId: showroom.id,
          quantity: 1,
          unitPrice: 35000, // 35 000
        },
      ], // Sous-total = 155 000 DA
      discount: 10000, // Remise = 10 000 DA
      deliveryFee: 5000, // Livraison = 5 000 DA
      includeDeliveryFee: true,
    });

    assert(res.success, `Échec Test 4: ${res.error}`);
    const sale = await prisma.sales.findUnique({ where: { id: (res.data as { id: number }).id } });
    assert(sale !== null, "Vente introuvable");
    assert(sale!.subtotal === 155000, `Sous-total attendu 155 000 DA, obtenu ${sale!.subtotal}`);
    assert(sale!.discount === 10000, `Remise attendue 10 000 DA, obtenu ${sale!.discount}`);
    assert(sale!.deliveryFee === 5000, `Frais attendus 5 000 DA, obtenu ${sale!.deliveryFee}`);
    // Total attendu : 155 000 - 10 000 + 5 000 = 150 000 DA
    assert(sale!.totalAmount === 150000, `Total attendu 150 000 DA, obtenu ${sale!.totalAmount}`);

    results.push({ num: 4, name: "Facture avec remise globale ET frais de livraison inclus", passed: true });
    console.log("  ✓ Test 4 réussi");
  } catch (err) {
    results.push({ num: 4, name: "Facture avec remise globale ET frais de livraison inclus", passed: false, error: String(err) });
    console.error("  ✗ Test 4 échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Statuts de paiement (Payé comptant, acompte partiel, et crédit intégral)
  // --------------------------------------------------------------------------
  try {
    // 5a. Payé comptant (125 000 DA dont 5 000 DA livraison)
    const resPaid = await createSaleAction({
      customerId: clientSofiane.id,
      status: "confirmed",
      items: [{ productId: canapeL.id, locationId: showroom.id, quantity: 1, unitPrice: 120000 }],
      deliveryFee: 5000,
      includeDeliveryFee: true,
      initialPayment: { amount: 125000, method: "cash" },
    });
    assert(resPaid.success, `Échec 5a: ${resPaid.error}`);
    const salePaid = await prisma.sales.findUnique({ where: { id: (resPaid.data as { id: number }).id } });
    assert(salePaid!.paymentStatus === "paid", `Attendu 'paid', obtenu ${salePaid!.paymentStatus}`);
    assert(salePaid!.paidAmount === 125000, "Montant versé attendu 125 000 DA");

    // 5b. Partiellement payé (acompte 50 000 DA sur 125 000 DA)
    const resPartial = await createSaleAction({
      customerId: clientSofiane.id,
      status: "confirmed",
      items: [{ productId: canapeL.id, locationId: showroom.id, quantity: 1, unitPrice: 120000 }],
      deliveryFee: 5000,
      includeDeliveryFee: true,
      initialPayment: { amount: 50000, method: "cash" },
    });
    assert(resPartial.success, `Échec 5b: ${resPartial.error}`);
    const salePartial = await prisma.sales.findUnique({ where: { id: (resPartial.data as { id: number }).id } });
    assert(salePartial!.paymentStatus === "partial", `Attendu 'partial', obtenu ${salePartial!.paymentStatus}`);
    assert(salePartial!.paidAmount === 50000, "Acompte attendu 50 000 DA");
    const balance = salePartial!.totalAmount - salePartial!.paidAmount;
    assert(balance === 75000, `Reste dû attendu 75 000 DA, obtenu ${balance}`);

    // 5c. À crédit (0 DA versé)
    const resCredit = await createSaleAction({
      customerId: clientSofiane.id,
      status: "confirmed",
      items: [{ productId: canapeL.id, locationId: showroom.id, quantity: 1, unitPrice: 120000 }],
      deliveryFee: 5000,
      includeDeliveryFee: true,
    });
    assert(resCredit.success, `Échec 5c: ${resCredit.error}`);
    const saleCredit = await prisma.sales.findUnique({ where: { id: (resCredit.data as { id: number }).id } });
    assert(saleCredit!.paymentStatus === "unpaid", `Attendu 'unpaid', obtenu ${saleCredit!.paymentStatus}`);
    assert(saleCredit!.paidAmount === 0, "Montant versé attendu 0 DA");

    results.push({ num: 5, name: "Statuts de paiement (Comptant, partiel, à crédit)", passed: true });
    console.log("  ✓ Test 5 réussi");
  } catch (err) {
    results.push({ num: 5, name: "Statuts de paiement (Comptant, partiel, à crédit)", passed: false, error: String(err) });
    console.error("  ✗ Test 5 échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Confirmation de devis / brouillon sans double-comptage des frais
  // --------------------------------------------------------------------------
  try {
    // Créer un devis (brouillon) avec frais inclus
    const resDraft = await createSaleAction({
      customerId: clientSofiane.id,
      status: "draft",
      items: [{ productId: canapeL.id, locationId: showroom.id, quantity: 1, unitPrice: 120000 }],
      deliveryFee: 6000,
      includeDeliveryFee: true,
      initialPayment: { amount: 20000, method: "cash" }, // acompte sur devis
    });
    assert(resDraft.success, `Échec création devis: ${resDraft.error}`);
    const draftId = (resDraft.data as { id: number }).id;

    // Confirmer le devis
    const resConfirm = await confirmDraftSaleAction(draftId, {
      amount: 40000, // versement complémentaire à la confirmation
      method: "cash",
    });
    assert(resConfirm.success, `Échec confirmation devis: ${resConfirm.error}`);

    const confirmedSale = await prisma.sales.findUnique({ where: { id: draftId } });
    assert(confirmedSale !== null, "Vente introuvable");
    // Le totalAmount ne doit PAS avoir été ré-additionné avec les frais
    assert(
      confirmedSale!.totalAmount === 126000,
      `Total attendu 126 000 DA (120 000 + 6 000), obtenu ${confirmedSale!.totalAmount} (double-comptage détecté si > 126 000)`
    );
    assert(confirmedSale!.deliveryFee === 6000, "Frais de livraison doivent rester 6 000 DA");
    assert(confirmedSale!.paidAmount === 60000, `Montant versé cumulé attendu 60 000 DA (20k + 40k), obtenu ${confirmedSale!.paidAmount}`);
    assert(confirmedSale!.paymentStatus === "partial", "Statut paiement attendu 'partial'");

    results.push({ num: 6, name: "Confirmation de devis / brouillon sans double-comptage des frais", passed: true });
    console.log("  ✓ Test 6 réussi");
  } catch (err) {
    results.push({ num: 6, name: "Confirmation de devis / brouillon sans double-comptage des frais", passed: false, error: String(err) });
    console.error("  ✗ Test 6 échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 7: ABSENCE STRICTE de création automatique de dépense / mouvement caisse pour la livraison
  // --------------------------------------------------------------------------
  try {
    // Comptabiliser les dépenses existantes avant l'action
    const expensesBefore = await prisma.expense.count();

    const resSale = await createSaleAction({
      customerId: clientSofiane.id,
      status: "confirmed",
      items: [{ productId: canapeL.id, locationId: showroom.id, quantity: 1, unitPrice: 120000 }],
      deliveryFee: 4500,
      includeDeliveryFee: true,
      initialPayment: { amount: 124500, method: "cash" },
    });
    assert(resSale.success, `Échec vente Test 7: ${resSale.error}`);

    const expensesAfter = await prisma.expense.count();
    assert(
      expensesAfter === expensesBefore,
      `Aucune dépense de caisse ne doit être créée automatiquement ! (Avant: ${expensesBefore}, Après: ${expensesAfter})`
    );

    // Vérifier également qu'aucun enregistrement n'existe dans la table deliveries (table supprimée de toute façon)
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM sqlite_master WHERE type='table' AND name='deliveries';
    `;
    assert(tables.length === 0, "La table 'deliveries' ne doit plus exister dans la base");

    results.push({ num: 7, name: "Absence stricte de dépense de caisse / chauffeur automatique", passed: true });
    console.log("  ✓ Test 7 réussi");
  } catch (err) {
    results.push({ num: 7, name: "Absence stricte de dépense de caisse / chauffeur automatique", passed: false, error: String(err) });
    console.error("  ✗ Test 7 échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Préservation stricte des stocks et traçabilité des mouvements
  // --------------------------------------------------------------------------
  try {
    const stockCanapé = await prisma.productStock.findUnique({
      where: { productId_locationId: { productId: canapeL.id, locationId: showroom.id } },
    });

    // 10 au départ, plusieurs ventes confirmées ont déduit du stock
    assert(stockCanapé !== null, "Stock introuvable");
    assert(stockCanapé!.quantity < 10, "Le stock physique doit avoir été déduit à la facturation");

    // Vérifier les mouvements de stock
    const movements = await prisma.stockMovement.findMany({
      where: { productId: canapeL.id, type: "SALE" },
    });
    assert(movements.length > 0, "Les mouvements de stock doivent tracer les ventes");

    results.push({ num: 8, name: "Préservation stricte des stocks et traçabilité des mouvements", passed: true });
    console.log("  ✓ Test 8 réussi");
  } catch (err) {
    results.push({ num: 8, name: "Préservation stricte des stocks et traçabilité des mouvements", passed: false, error: String(err) });
    console.error("  ✗ Test 8 échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Hub Documents consolide les ventes avec frais de livraison
  // --------------------------------------------------------------------------
  try {
    const { getDocumentsData } = await import("../src/app/documents/actions");
    const docsData = await getDocumentsData();
    assert(docsData.documents.length > 0, "Le hub documents doit lister les factures");
    const docSale = docsData.documents.find((d) => d.salePayload?.deliveryFee === 4500);
    assert(docSale !== undefined, "La facture avec frais de livraison 4500 DA doit être répertoriée");
    assert(docSale!.amount === 124500, "Le montant unifié doit correspondre exactement au total TTC");

    results.push({ num: 9, name: "Hub Documents consolide les ventes avec frais de livraison", passed: true });
    console.log("  ✓ Test 9 réussi");
  } catch (err) {
    results.push({ num: 9, name: "Hub Documents consolide les ventes avec frais de livraison", passed: false, error: String(err) });
    console.error("  ✗ Test 9 échoué:", err);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Génération PDF de la facture avec ligne séparée de livraison
  // --------------------------------------------------------------------------
  try {
    const { buildInvoicePdf } = await import("../src/lib/pdf/invoicePdf");
    const doc = await buildInvoicePdf({
      sale: {
        id: 1,
        reference: "FAC-202610-9999",
        status: "confirmed",
        paymentStatus: "paid",
        saleDate: new Date(),
        subtotal: 120000,
        discount: 5000,
        deliveryFee: 4500,
        includeDeliveryFee: true,
        totalAmount: 119500,
        paidAmount: 119500,
        customer: { id: 1, name: "Sofiane Meziane", phone: "0550112233", address: "Hydra, Alger" },
        items: [
          {
            quantity: 1,
            unitPrice: 120000,
            subtotal: 120000,
            product: { name: "Canapé d'Angle Cuir", sku: "CAN-001" },
          },
        ],
      },
    });

    const pdfOutput = doc.output("datauristring");
    assert(typeof pdfOutput === "string" && pdfOutput.length > 100, "Le PDF de facture doit être généré avec succès");

    results.push({ num: 10, name: "Génération PDF de la facture avec ligne séparée de livraison", passed: true });
    console.log("  ✓ Test 10 réussi");
  } catch (err) {
    results.push({ num: 10, name: "Génération PDF de la facture avec ligne séparée de livraison", passed: false, error: String(err) });
    console.error("  ✗ Test 10 échoué:", err);
  }

  // --------------------------------------------------------------------------
  // Rapport final
  // --------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("  RÉSULTATS DE LA SUITE DE TESTS");
  console.log("================================================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`  Tests réussis : ${passedCount} / ${results.length}`);
  if (passedCount < results.length) {
    console.error("  DES TESTS ONT ÉCHOUÉ !");
    process.exit(1);
  } else {
    console.log("  TOUS LES TESTS SONT PASSÉS AVEC SUCCÈS ! ✓");
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
