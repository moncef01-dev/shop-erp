import { prisma } from "../src/lib/prisma";
import { calculateAccountBalance } from "../src/app/cash/treasury-actions";
import { calculateSupplierDebt } from "../src/app/suppliers/actions";
import { generateNextSupplierCode } from "../src/app/purchases/actions";

async function main() {
  console.log("===============================================================");
  console.log("       STARTING TREASURY AND BALANCES CORRECTIONS");
  console.log("===============================================================");

  // 1. Définir le solde initial de Coffre magasin à 2 828 000 DA
  const coffreAcc = await prisma.treasuryAccount.findFirst({
    where: { code: "ACC-COFFRE-MAGASIN" },
  });
  if (!coffreAcc) {
    throw new Error("Compte Coffre magasin introuvable.");
  }
  console.log(`1. Compte Coffre magasin (#${coffreAcc.id}): mise à jour du solde d'ouverture à 2 828 000 DA`);
  await prisma.treasuryAccount.update({
    where: { id: coffreAcc.id },
    data: { openingBalance: 2828000 },
  });

  // 2. Supprimer la transaction erronée de -1 500 DA sur Compte bancaire
  console.log("2. Recherche et suppression de la dépense test erronée de -1 500 DA sur Compte bancaire...");
  const wrongExpense = await prisma.expense.findFirst({
    where: {
      amount: 1500,
      method: "transfer",
      description: { contains: "emballage" },
    },
  });
  if (wrongExpense) {
    console.log(`   Transaction identifiée: ID #${wrongExpense.id}, Réf: ${wrongExpense.reference}, Montant: ${wrongExpense.amount} DA, Date: ${wrongExpense.date.toISOString()}, Desc: "${wrongExpense.description}"`);
    await prisma.expense.delete({
      where: { id: wrongExpense.id },
    });
    console.log("   -> Transaction supprimée avec succès.");
  } else {
    console.log("   -> Aucune transaction correspondante trouvée (déjà supprimée).");
  }

  // 3. Créer les comptes fournisseurs Basem et Ramzi Boukhari s'ils n'existent pas
  console.log("3. Création des fournisseurs Basem et Ramzi Boukhari...");
  let basem = await prisma.supplier.findFirst({ where: { name: "Basem" } });
  if (!basem) {
    const nextCode = await generateNextSupplierCode();
    basem = await prisma.supplier.create({
      data: {
        code: nextCode,
        name: "Basem",
        notes: "Fournisseur créé pour régularisation trésorerie",
        isActive: true,
      },
    });
    console.log(`   -> Fournisseur Basem créé: ID #${basem.id}, Code: ${basem.code}`);
  } else {
    console.log(`   -> Fournisseur Basem déjà existant: ID #${basem.id}, Code: ${basem.code}`);
  }

  let ramzi = await prisma.supplier.findFirst({ where: { name: "Ramzi Boukhari" } });
  if (!ramzi) {
    const nextCode = await generateNextSupplierCode();
    ramzi = await prisma.supplier.create({
      data: {
        code: nextCode,
        name: "Ramzi Boukhari",
        notes: "Fournisseur créé pour régularisation trésorerie",
        isActive: true,
      },
    });
    console.log(`   -> Fournisseur Ramzi Boukhari créé: ID #${ramzi.id}, Code: ${ramzi.code}`);
  } else {
    console.log(`   -> Fournisseur Ramzi Boukhari déjà existant: ID #${ramzi.id}, Code: ${ramzi.code}`);
  }

  const tayeb = await prisma.supplier.findFirst({ where: { name: { contains: "Tayeb" } } });
  if (!tayeb) {
    throw new Error("Fournisseur Tayeb Gidoum introuvable.");
  }

  // 4. Enregistrer les dettes initiales / antérieures pour préserver l'historique comptable
  console.log("4. Vérification et enregistrement des dettes antérieures...");
  // Basem: 238 000 DA
  const existingBasemDebt = await prisma.supplierDebt.findFirst({
    where: { supplierId: basem.id, amount: 238000 },
  });
  if (!existingBasemDebt) {
    await prisma.supplierDebt.create({
      data: {
        reference: "DET-202610-0002",
        supplierId: basem.id,
        amount: 238000,
        type: "initial_debt",
        description: "Solde dette antérieure",
        date: new Date("2026-10-20T10:00:00Z"),
      },
    });
    console.log("   -> Dette antérieure de 238 000 DA enregistrée pour Basem");
  }

  // Ramzi Boukhari: 210 000 DA
  const existingRamziDebt = await prisma.supplierDebt.findFirst({
    where: { supplierId: ramzi.id, amount: 210000 },
  });
  if (!existingRamziDebt) {
    await prisma.supplierDebt.create({
      data: {
        reference: "DET-202610-0003",
        supplierId: ramzi.id,
        amount: 210000,
        type: "initial_debt",
        description: "Solde dette antérieure",
        date: new Date("2026-10-20T10:00:00Z"),
      },
    });
    console.log("   -> Dette antérieure de 210 000 DA enregistrée pour Ramzi Boukhari");
  }

  // Tayeb Gidoum: 1 708 500 DA (pour que 1 708 500 + 1 578 000 - 2 082 000 = 1 204 500 DA exactement)
  const existingTayebDebt = await prisma.supplierDebt.findFirst({
    where: { supplierId: tayeb.id, amount: 1708500 },
  });
  if (!existingTayebDebt) {
    await prisma.supplierDebt.create({
      data: {
        reference: "DET-202610-0001",
        supplierId: tayeb.id,
        amount: 1708500,
        type: "initial_debt",
        description: "Solde de dette antérieure report",
        date: new Date("2026-10-20T10:00:00Z"),
      },
    });
    console.log("   -> Dette antérieure de 1 708 500 DA enregistrée pour Tayeb Gidoum");
  }

  // 5. Enregistrer les 3 règlements fournisseurs depuis Coffre magasin
  console.log("5. Enregistrement des règlements fournisseurs depuis Coffre magasin...");
  // Tayeb Gidoum: 2 082 000 DA
  const existingTayebPay = await prisma.payment.findFirst({
    where: { supplierId: tayeb.id, amount: 2082000, accountId: coffreAcc.id },
  });
  if (!existingTayebPay) {
    await prisma.payment.create({
      data: {
        reference: "PAYF-202610-0001",
        supplierId: tayeb.id,
        accountId: coffreAcc.id,
        amount: 2082000,
        method: "cash",
        status: "completed",
        notes: "Règlement fournisseur Tayeb Gidoum depuis Coffre magasin",
        paymentDate: new Date("2026-10-20T12:00:00Z"),
      },
    });
    // Mettre à jour l'achat BC-202610-0001 en statut payé
    const purchase = await prisma.purchase.findFirst({
      where: { supplierId: tayeb.id, status: { not: "cancelled" } },
    });
    if (purchase) {
      await prisma.purchase.update({
        where: { id: purchase.id },
        data: {
          paidAmount: purchase.totalAmount,
          paymentStatus: "paid",
        },
      });
      console.log(`   -> Achat ${purchase.reference} (${purchase.totalAmount} DA) marqué comme entièrement payé.`);
    }
    console.log("   -> Règlement de 2 082 000 DA enregistré pour Tayeb Gidoum");
  }

  // Basem: 238 000 DA
  const existingBasemPay = await prisma.payment.findFirst({
    where: { supplierId: basem.id, amount: 238000, accountId: coffreAcc.id },
  });
  if (!existingBasemPay) {
    await prisma.payment.create({
      data: {
        reference: "PAYF-202610-0002",
        supplierId: basem.id,
        accountId: coffreAcc.id,
        amount: 238000,
        method: "cash",
        status: "completed",
        notes: "Règlement fournisseur Basem depuis Coffre magasin",
        paymentDate: new Date("2026-10-20T12:05:00Z"),
      },
    });
    console.log("   -> Règlement de 238 000 DA enregistré pour Basem");
  }

  // Ramzi Boukhari: 210 000 DA
  const existingRamziPay = await prisma.payment.findFirst({
    where: { supplierId: ramzi.id, amount: 210000, accountId: coffreAcc.id },
  });
  if (!existingRamziPay) {
    await prisma.payment.create({
      data: {
        reference: "PAYF-202610-0003",
        supplierId: ramzi.id,
        accountId: coffreAcc.id,
        amount: 210000,
        method: "cash",
        status: "completed",
        notes: "Règlement fournisseur Ramzi Boukhari depuis Coffre magasin",
        paymentDate: new Date("2026-10-20T12:10:00Z"),
      },
    });
    console.log("   -> Règlement de 210 000 DA enregistré pour Ramzi Boukhari");
  }

  // 6. Enregistrer les dépenses de salaires après la clôture de caisse CS-202610-0003
  console.log("6. Enregistrement des dépenses de salaires après la clôture CS-202610-0003...");
  const caisseAcc = await prisma.treasuryAccount.findFirst({
    where: { code: "ACC-CAISSE" },
  });
  if (!caisseAcc) {
    throw new Error("Compte Caisse journalière introuvable.");
  }

  // Salaires depuis Coffre magasin: 3 000 DA
  const existingSalaryCoffre = await prisma.expense.findFirst({
    where: {
      amount: 3000,
      category: "salary",
      accountId: coffreAcc.id,
    },
  });
  if (!existingSalaryCoffre) {
    await prisma.expense.create({
      data: {
        reference: "DEP-202610-0032",
        accountId: coffreAcc.id,
        type: "expense",
        category: "salary",
        description: "Règlement salaires depuis Coffre magasin",
        amount: 3000,
        method: "cash",
        date: new Date("2026-10-20T17:00:00Z"),
        sessionId: null,
      },
    });
    console.log("   -> Dépense de salaires 3 000 DA enregistrée sur Coffre magasin");
  }

  // Salaires depuis Caisse journalière: 8 000 DA
  const existingSalaryCaisse = await prisma.expense.findFirst({
    where: {
      amount: 8000,
      category: "salary",
      accountId: caisseAcc.id,
    },
  });
  if (!existingSalaryCaisse) {
    await prisma.expense.create({
      data: {
        reference: "DEP-202610-0033",
        accountId: caisseAcc.id,
        type: "expense",
        category: "salary",
        description: "Règlement salaires après clôture CS-202610-0003",
        amount: 8000,
        method: "cash",
        date: new Date("2026-10-20T17:05:00Z"),
        sessionId: null,
      },
    });
    console.log("   -> Dépense de salaires 8 000 DA enregistrée sur Caisse journalière");
  }

  console.log("\n===============================================================");
  console.log("               VERIFICATION DES SOLDES FINAUX");
  console.log("===============================================================");
  const balCoffre = await calculateAccountBalance(coffreAcc.id);
  const balCaisse = await calculateAccountBalance(caisseAcc.id);
  const banqueAcc = await prisma.treasuryAccount.findFirst({ where: { code: "ACC-BANQUE" } });
  const balBanque = banqueAcc ? await calculateAccountBalance(banqueAcc.id) : 0;
  const totalCash = balCoffre + balCaisse;

  const debtTayeb = await calculateSupplierDebt(tayeb.id);
  const debtBasem = await calculateSupplierDebt(basem.id);
  const debtRamzi = await calculateSupplierDebt(ramzi.id);

  const session3 = await prisma.cashSession.findFirst({ where: { reference: "CS-202610-0003" } });

  console.log(`- Solde Coffre magasin : ${balCoffre} DA (Attendu: 295 000 DA) -> ${balCoffre === 295000 ? "OK" : "ERREUR"}`);
  console.log(`- Solde Caisse journalière : ${balCaisse} DA (Attendu: 200 DA) -> ${balCaisse === 200 ? "OK" : "ERREUR"}`);
  console.log(`- Total cash 2 comptes : ${totalCash} DA (Attendu: 295 200 DA) -> ${totalCash === 295200 ? "OK" : "ERREUR"}`);
  console.log(`- Montant clôture historique CS-202610-0003 : ${session3?.closingAmount} DA (Attendu: 8 200 DA) -> ${session3?.closingAmount === 8200 ? "OK" : "ERREUR"}`);
  console.log(`- Dette restante Tayeb Gidoum : ${debtTayeb.outstandingDebt} DA (Attendu: 1 204 500 DA) -> ${debtTayeb.outstandingDebt === 1204500 ? "OK" : "ERREUR"}`);
  console.log(`- Dette restante Basem : ${debtBasem.outstandingDebt} DA (Attendu: 0 DA) -> ${debtBasem.outstandingDebt === 0 ? "OK" : "ERREUR"}`);
  console.log(`- Dette restante Ramzi Boukhari : ${debtRamzi.outstandingDebt} DA (Attendu: 0 DA) -> ${debtRamzi.outstandingDebt === 0 ? "OK" : "ERREUR"}`);
  console.log(`- Solde Compte bancaire : ${balBanque} DA (Attendu: 0 DA) -> ${balBanque === 0 ? "OK" : "ERREUR"}`);

  if (
    balCoffre === 295000 &&
    balCaisse === 200 &&
    totalCash === 295200 &&
    session3?.closingAmount === 8200 &&
    debtTayeb.outstandingDebt === 1204500 &&
    debtBasem.outstandingDebt === 0 &&
    debtRamzi.outstandingDebt === 0 &&
    balBanque === 0
  ) {
    console.log("\n>>> TOUTES LES CORRECTIONS ET RÈGLES DE VALIDATION SONT CONFORMES A 100% <<<");
  } else {
    throw new Error("Certaines vérifications comptables ne correspondent pas aux valeurs attendues.");
  }
}

main()
  .catch((err) => {
    console.error("Erreur exécution script:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
