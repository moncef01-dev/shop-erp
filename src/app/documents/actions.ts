"use server";

import { prisma } from "@/lib/prisma";
import { getShopSettings, type ShopSettingsData } from "@/app/settings/actions";
import type {
  PrintableSale,
  PrintablePayment,
} from "@/components/sales/PrintableInvoice";
import type {
  PrintablePurchase,
  PrintablePurchaseReceipt,
  PrintableSupplierPayment,
} from "@/components/purchases/PrintablePurchaseDocuments";
import type {
  PrintableTransferData,
  PrintableInventoryItem,
  PrintableAccountStatementData,
  StatementEntry,
} from "@/components/documents/PrintableNewDocuments";

export type DocumentTypeFilter =
  | "all"
  | "invoice"
  | "quote"
  | "purchase"
  | "receipt"
  | "payment_client"
  | "payment_supplier"
  | "cash_session"
  | "expense"
  | "transfer";

export interface UnifiedDocumentItem {
  id: string;
  rawId: number;
  type: DocumentTypeFilter;
  typeLabel: string;
  reference: string;
  date: string;
  partyName: string;
  partyType: "customer" | "supplier" | "internal";
  amount: number;
  status: string;
  statusLabel: string;
  notes?: string | null;
  // Specific data payloads for instant modal reprinting
  salePayload?: PrintableSale;
  paymentPayload?: PrintablePayment;
  purchasePayload?: PrintablePurchase;
  receiptPayload?: PrintablePurchaseReceipt;
  supplierPaymentPayload?: PrintableSupplierPayment;
  transferPayload?: PrintableTransferData;
  cashSessionPayload?: {
    reference: string;
    openedAt: string;
    closedAt?: string | null;
    status: string;
    openingAmount: number;
    totalCashIn: number;
    totalCashOut: number;
    theoreticalAmount?: number | null;
    closingAmount?: number | null;
    difference?: number | null;
    openingNotes?: string | null;
    closingNotes?: string | null;
  };
  expensePayload?: {
    reference: string;
    type: string;
    category: string;
    description: string;
    amount: number;
    method: string;
    beneficiary?: string | null;
    receiptNumber?: string | null;
    notes?: string | null;
    date: string;
  };
}

export interface DocumentsDashboardData {
  documents: UnifiedDocumentItem[];
  settings: ShopSettingsData;
  locations: Array<{ id: number; name: string; code: string }>;
  stats: {
    totalDocuments: number;
    invoicesCount: number;
    purchasesCount: number;
    receiptsCount: number;
    paymentsCount: number;
    cashEventsCount: number;
    transfersCount: number;
  };
}

export async function getDocumentsData(): Promise<DocumentsDashboardData> {
  const [
    sales,
    purchases,
    receipts,
    payments,
    cashSessions,
    expenses,
    transfers,
    settings,
    locations,
  ] = await Promise.all([
    // 1. Ventes (Factures et Devis)
    prisma.sales.findMany({
      orderBy: { saleDate: "desc" },
      include: {
        customer: true,
        items: {
          include: {
            product: { select: { sku: true, name: true, model: true, color: true } },
            location: { select: { name: true } },
          },
        },
        payments: true,
      },
    }),

    // 2. Commandes Fournisseurs
    prisma.purchase.findMany({
      orderBy: { purchaseDate: "desc" },
      include: {
        supplier: true,
        items: {
          include: {
            product: { select: { sku: true, name: true, model: true, color: true, costPrice: true } },
            location: { select: { name: true, code: true } },
          },
        },
        receipts: {
          include: {
            items: {
              include: {
                product: { select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true } },
                location: { select: { id: true, name: true, code: true } },
                purchaseItem: { select: { id: true, quantity: true, unitCost: true } },
              },
            },
          },
        },
        payments: true,
      },
    }),

    // 4. Bons de Réception Marchandises
    prisma.purchaseReceipt.findMany({
      orderBy: { receiptDate: "desc" },
      include: {
        purchase: {
          include: {
            supplier: true,
          },
        },
        items: {
          include: {
            product: { select: { id: true, sku: true, name: true, model: true, color: true, costPrice: true } },
            location: { select: { id: true, name: true, code: true } },
            purchaseItem: { select: { id: true, quantity: true, unitCost: true } },
          },
        },
      },
    }),

    // 5. Règlements (Clients et Fournisseurs)
    prisma.payment.findMany({
      orderBy: { paymentDate: "desc" },
      include: {
        sale: {
          include: {
            customer: true,
          },
        },
        purchase: {
          include: {
            supplier: true,
          },
        },
      },
    }),

    // 6. Sessions de Caisse
    prisma.cashSession.findMany({
      orderBy: { openedAt: "desc" },
      include: {
        expenses: true,
        payments: true,
      },
    }),

    // 7. Dépenses de Caisse
    prisma.expense.findMany({
      orderBy: { date: "desc" },
    }),

    // 8. Transferts de Stock inter-dépôts
    prisma.stockMovement.findMany({
      where: { type: "TRANSFER" },
      orderBy: { date: "desc" },
      include: {
        product: { select: { sku: true, name: true, model: true, color: true } },
        fromLocation: true,
        toLocation: true,
      },
    }),

    // Paramètres partagés
    getShopSettings(),

    // Emplacements
    prisma.location.findMany({
      where: { isActive: true },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const docs: UnifiedDocumentItem[] = [];

  // 1. Mapper Ventes
  for (const s of sales) {
    const isQuote = s.status === "draft";
    docs.push({
      id: `sale-${s.id}`,
      rawId: s.id,
      type: isQuote ? "quote" : "invoice",
      typeLabel: isQuote ? "Devis / Bon de commande" : "Facture de Vente",
      reference: s.reference,
      date: s.saleDate.toISOString(),
      partyName: s.customer?.name || "Client Passager",
      partyType: "customer",
      amount: s.totalAmount,
      status: s.status,
      statusLabel:
        s.status === "confirmed"
          ? s.paymentStatus === "paid"
            ? "Payée"
            : s.paymentStatus === "partial"
            ? "Partiel"
            : "Non payée"
          : isQuote
          ? "Brouillon / Devis"
          : "Annulée",
      notes: s.notes,
      salePayload: {
        id: s.id,
        reference: s.reference,
        status: s.status,
        paymentStatus: s.paymentStatus,
        deliveryStatus: s.deliveryStatus,
        saleDate: s.saleDate.toISOString(),
        subtotal: s.subtotal,
        discount: s.discount,
        deliveryFee: s.deliveryFee,
        totalAmount: s.totalAmount,
        paidAmount: s.paidAmount,
        notes: s.notes,
        customer: s.customer
          ? {
              id: s.customer.id,
              code: s.customer.code,
              name: s.customer.name,
              phone: s.customer.phone,
              address: s.customer.address,
            }
          : null,
        items: s.items.map((it) => ({
          id: it.id,
          product: it.product,
          location: it.location,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          discount: it.discount,
          subtotal: it.subtotal,
        })),
        payments: s.payments.map((p) => ({
          id: p.id,
          reference: p.reference,
          amount: p.amount,
          method: p.method,
          paymentDate: p.paymentDate.toISOString(),
          notes: p.notes,
        })),
        deliveries: [],
      },
    });
  }

  // 2. Mapper Achats Fournisseurs
  for (const p of purchases) {
    docs.push({
      id: `purchase-${p.id}`,
      rawId: p.id,
      type: "purchase",
      typeLabel: "Bon de Commande Fournisseur",
      reference: p.reference,
      date: p.purchaseDate.toISOString(),
      partyName: p.supplier?.name || "Fournisseur",
      partyType: "supplier",
      amount: p.totalAmount,
      status: p.status,
      statusLabel:
        p.status === "received"
          ? "Reçu intégral"
          : p.status === "partially_received"
          ? "Réception partielle"
          : p.status === "ordered"
          ? "Commandé"
          : p.status === "cancelled"
          ? "Annulé"
          : "Brouillon",
      notes: p.notes,
      purchasePayload: {
        id: p.id,
        reference: p.reference,
        status: p.status,
        receiptStatus: p.receiptStatus,
        paymentStatus: p.paymentStatus,
        purchaseDate: p.purchaseDate.toISOString(),
        expectedDeliveryDate: p.expectedDeliveryDate ? p.expectedDeliveryDate.toISOString() : null,
        subtotal: p.subtotal,
        discount: p.discount,
        totalAmount: p.totalAmount,
        paidAmount: p.paidAmount,
        notes: p.notes,
        supplierId: p.supplierId,
        supplier: p.supplier,
        items: p.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          product: it.product,
          location: it.location,
          quantity: it.quantity,
          receivedQuantity: it.receivedQuantity,
          unitCost: it.unitCost,
          subtotal: it.subtotal,
        })),
        receipts: p.receipts.map((r) => ({
          id: r.id,
          reference: r.reference,
          receiptDate: r.receiptDate.toISOString(),
          notes: r.notes,
          items: r.items,
        })),
        payments: p.payments.map((py) => ({
          id: py.id,
          reference: py.reference,
          amount: py.amount,
          method: py.method,
          paymentDate: py.paymentDate.toISOString(),
          notes: py.notes,
        })),
      },
    });
  }

  // 4. Mapper Bons de Réception
  for (const r of receipts) {
    const totalReceiptValue = r.items.reduce((acc, it) => {
      const cost = it.unitCost ?? it.purchaseItem?.unitCost ?? it.product?.costPrice ?? 0;
      return acc + (it.quantity || 0) * cost;
    }, 0);

    docs.push({
      id: `receipt-${r.id}`,
      rawId: r.id,
      type: "receipt",
      typeLabel: "Bon de Réception Marchandises",
      reference: r.reference,
      date: r.receiptDate.toISOString(),
      partyName: r.purchase?.supplier?.name || "Fournisseur",
      partyType: "supplier",
      amount: totalReceiptValue,
      status: "received",
      statusLabel: "Réceptionné",
      notes: r.notes,
      receiptPayload: {
        id: r.id,
        reference: r.reference,
        receiptDate: r.receiptDate.toISOString(),
        notes: r.notes,
        items: r.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          quantity: it.quantity,
          unitCost: it.unitCost,
          product: it.product,
          location: it.location,
          purchaseItem: it.purchaseItem,
        })),
      },
      purchasePayload: {
        id: r.purchase.id,
        reference: r.purchase.reference,
        status: r.purchase.status,
        receiptStatus: r.purchase.receiptStatus,
        paymentStatus: r.purchase.paymentStatus,
        purchaseDate: r.purchase.purchaseDate.toISOString(),
        subtotal: r.purchase.subtotal,
        discount: r.purchase.discount,
        totalAmount: r.purchase.totalAmount,
        paidAmount: r.purchase.paidAmount,
        supplier: r.purchase.supplier,
      },
    });
  }

  // 5. Mapper Règlements (Clients et Fournisseurs)
  for (const py of payments) {
    if (py.saleId && py.sale) {
      docs.push({
        id: `payment-sale-${py.id}`,
        rawId: py.id,
        type: "payment_client",
        typeLabel: "Reçu de Versement Client",
        reference: py.reference || `REC-${py.id}`,
        date: py.paymentDate.toISOString(),
        partyName: py.sale.customer?.name || "Client Passager",
        partyType: "customer",
        amount: py.amount,
        status: py.status,
        statusLabel: "Encaissé",
        notes: py.notes,
        paymentPayload: {
          id: py.id,
          reference: py.reference,
          amount: py.amount,
          method: py.method,
          paymentDate: py.paymentDate.toISOString(),
          notes: py.notes,
        },
        salePayload: {
          id: py.sale.id,
          reference: py.sale.reference,
          status: py.sale.status,
          paymentStatus: py.sale.paymentStatus,
          saleDate: py.sale.saleDate.toISOString(),
          totalAmount: py.sale.totalAmount,
          paidAmount: py.sale.paidAmount,
          deliveryFee: py.sale.deliveryFee,
          customer: py.sale.customer,
        },
      });
    } else if (py.purchaseId && py.purchase) {
      docs.push({
        id: `payment-purchase-${py.id}`,
        rawId: py.id,
        type: "payment_supplier",
        typeLabel: "Reçu de Règlement Fournisseur",
        reference: py.reference || `PAYF-${py.id}`,
        date: py.paymentDate.toISOString(),
        partyName: py.purchase.supplier?.name || "Fournisseur",
        partyType: "supplier",
        amount: py.amount,
        status: py.status,
        statusLabel: "Réglé",
        notes: py.notes,
        supplierPaymentPayload: {
          id: py.id,
          reference: py.reference,
          amount: py.amount,
          method: py.method,
          paymentDate: py.paymentDate.toISOString(),
          notes: py.notes,
        },
        purchasePayload: {
          id: py.purchase.id,
          reference: py.purchase.reference,
          status: py.purchase.status,
          receiptStatus: py.purchase.receiptStatus,
          paymentStatus: py.purchase.paymentStatus,
          purchaseDate: py.purchase.purchaseDate.toISOString(),
          subtotal: py.purchase.subtotal,
          discount: py.purchase.discount,
          totalAmount: py.purchase.totalAmount,
          paidAmount: py.purchase.paidAmount,
          supplier: py.purchase.supplier,
        },
      });
    }
  }

  // 6. Mapper Clôtures de Caisse
  for (const cs of cashSessions) {
    docs.push({
      id: `cash-session-${cs.id}`,
      rawId: cs.id,
      type: "cash_session",
      typeLabel: "Fiche de Clôture de Caisse",
      reference: cs.reference,
      date: (cs.closedAt || cs.openedAt).toISOString(),
      partyName: `Session Caisse (${cs.status === "closed" ? "Clôturée" : "Ouverte"})`,
      partyType: "internal",
      amount: cs.closingAmount ?? cs.theoreticalAmount ?? cs.openingAmount,
      status: cs.status,
      statusLabel: cs.status === "closed" ? "Clôturée" : "En cours",
      notes: cs.closingNotes || cs.openingNotes,
      cashSessionPayload: {
        reference: cs.reference,
        openedAt: cs.openedAt.toISOString(),
        closedAt: cs.closedAt ? cs.closedAt.toISOString() : null,
        status: cs.status,
        openingAmount: cs.openingAmount,
        totalCashIn: cs.totalCashIn,
        totalCashOut: cs.totalCashOut,
        theoreticalAmount: cs.theoreticalAmount,
        closingAmount: cs.closingAmount,
        difference: cs.difference,
        openingNotes: cs.openingNotes,
        closingNotes: cs.closingNotes,
      },
    });
  }

  // 7. Mapper Dépenses de Caisse
  for (const ex of expenses) {
    docs.push({
      id: `expense-${ex.id}`,
      rawId: ex.id,
      type: "expense",
      typeLabel: ex.type === "income" ? "Reçu d'Encaissement Exceptionnel" : "Bon de Dépense de Caisse",
      reference: ex.reference,
      date: ex.date.toISOString(),
      partyName: ex.beneficiary || "Dépense générale",
      partyType: "internal",
      amount: ex.amount,
      status: "completed",
      statusLabel: "Comptabilisé",
      notes: ex.description,
      expensePayload: {
        reference: ex.reference,
        type: ex.type,
        category: ex.category,
        description: ex.description,
        amount: ex.amount,
        method: ex.method,
        beneficiary: ex.beneficiary,
        receiptNumber: ex.receiptNumber,
        notes: ex.notes,
        date: ex.date.toISOString(),
      },
    });
  }

  // 8. Mapper Transferts de Stock
  for (const tr of transfers) {
    const ref = tr.reference || `TRF-${tr.id}`;
    docs.push({
      id: `transfer-${tr.id}`,
      rawId: tr.id,
      type: "transfer",
      typeLabel: "Bon de Transfert Inter-Dépôts",
      reference: ref,
      date: tr.date.toISOString(),
      partyName: `${tr.fromLocation?.name || "Origine"} → ${tr.toLocation?.name || "Destination"}`,
      partyType: "internal",
      amount: tr.quantity,
      status: "completed",
      statusLabel: "Transféré",
      notes: tr.notes || tr.reason,
      transferPayload: {
        reference: ref,
        date: tr.date.toISOString(),
        fromLocation: tr.fromLocation,
        toLocation: tr.toLocation,
        items: [
          {
            product: tr.product,
            quantity: tr.quantity,
            unitCost: tr.unitCost,
          },
        ],
        notes: tr.notes,
        reason: tr.reason,
      },
    });
  }

  // Trier tous les documents par date décroissante
  docs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const stats = {
    totalDocuments: docs.length,
    invoicesCount: docs.filter((d) => d.type === "invoice" || d.type === "quote").length,
    purchasesCount: docs.filter((d) => d.type === "purchase").length,
    receiptsCount: docs.filter((d) => d.type === "receipt").length,
    paymentsCount: docs.filter((d) => d.type === "payment_client" || d.type === "payment_supplier").length,
    cashEventsCount: docs.filter((d) => d.type === "cash_session" || d.type === "expense").length,
    transfersCount: docs.filter((d) => d.type === "transfer").length,
  };

  return {
    documents: docs,
    settings,
    locations,
    stats,
  };
}

// ─── GÉNÉRATEUR DE FICHE D'INVENTAIRE PAR DÉPÔT ───────────────────────────────

export async function getInventorySheetData(locationId?: number): Promise<{
  locationName: string;
  locationCode?: string;
  isGlobal: boolean;
  locations: { id: number; name: string; code: string }[];
  items: PrintableInventoryItem[];
}> {
  let locationName = "Tous les dépôts / Magasin général";
  let locationCode = "GLOBAL";

  const [locList, products] = await Promise.all([
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
      select: { id: true, name: true, code: true },
    }),
    prisma.product.findMany({
      orderBy: { name: "asc" },
      include: {
        categoryRef: { select: { name: true } },
        stocks: {
          select: { locationId: true, quantity: true },
        },
      },
    }),
  ]);

  if (locationId) {
    const loc = locList.find((l) => l.id === locationId);
    if (loc) {
      locationName = loc.name;
      locationCode = loc.code;
    }
  }

  const items: PrintableInventoryItem[] = products.map((p) => {
    const locationStocks: Record<number, number> = {};
    for (const s of p.stocks) {
      locationStocks[s.locationId] = s.quantity;
    }

    let stockQty = p.stock;
    if (locationId) {
      stockQty = locationStocks[locationId] ?? 0;
    }

    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      category: p.categoryRef?.name || p.category,
      unit: p.unit,
      systemStock: stockQty,
      totalStock: p.stock,
      locationStocks,
    };
  });

  // Tri des articles groupés par catégorie (alphabétique), puis SKU / nom. Non catégorisés à la fin.
  items.sort((a, b) => {
    const catA = (a.category || "").trim();
    const catB = (b.category || "").trim();

    if (!catA && catB) return 1;
    if (catA && !catB) return -1;

    if (catA.toLowerCase() !== catB.toLowerCase()) {
      return catA.localeCompare(catB, "fr", { sensitivity: "base" });
    }

    const skuA = (a.sku || "").trim();
    const skuB = (b.sku || "").trim();
    if (skuA && skuB && skuA.toLowerCase() !== skuB.toLowerCase()) {
      return skuA.localeCompare(skuB, "fr", { numeric: true, sensitivity: "base" });
    }

    const nameA = (a.name || "").trim();
    const nameB = (b.name || "").trim();
    return nameA.localeCompare(nameB, "fr", { sensitivity: "base" });
  });

  return {
    locationName,
    locationCode,
    isGlobal: !locationId,
    locations: locList,
    items,
  };
}

// ─── GÉNÉRATEUR DE RELEVÉ DE COMPTE TIERS (CLIENT OU FOURNISSEUR) ─────────────

export async function getAccountStatementData(params: {
  type: "customer" | "supplier";
  partyId: number;
  startDate?: string;
  endDate?: string;
}): Promise<PrintableAccountStatementData | null> {
  const { type, partyId, startDate, endDate } = params;

  if (type === "customer") {
    const customer = await prisma.customer.findUnique({
      where: { id: partyId },
    });
    if (!customer) return null;

    const sales = await prisma.sales.findMany({
      where: {
        customerId: partyId,
        status: { in: ["confirmed", "draft"] },
        ...(startDate ? { saleDate: { gte: new Date(startDate) } } : {}),
        ...(endDate ? { saleDate: { lte: new Date(endDate) } } : {}),
      },
      orderBy: { saleDate: "asc" },
      include: {
        payments: true,
      },
    });

    const entries: StatementEntry[] = [];
    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    // Agréger factures et règlements chronologiquement
    for (const s of sales) {
      if (s.status === "confirmed") {
        runningBalance += s.totalAmount;
        totalDebit += s.totalAmount;
        entries.push({
          date: s.saleDate.toISOString(),
          reference: s.reference,
          label: `Facture de vente n° ${s.reference}`,
          debit: s.totalAmount,
          credit: 0,
          balance: runningBalance,
        });

        for (const p of s.payments) {
          runningBalance -= p.amount;
          totalCredit += p.amount;
          entries.push({
            date: p.paymentDate.toISOString(),
            reference: p.reference || `PAY-${p.id}`,
            label: `Règlement reçu (${p.method === "cash" ? "Espèces" : p.method})`,
            debit: 0,
            credit: p.amount,
            balance: runningBalance,
          });
        }
      }
    }

    return {
      type: "customer",
      party: customer,
      startDate,
      endDate,
      entries,
      totalDebit,
      totalCredit,
      finalBalance: runningBalance,
    };
  } else {
    const supplier = await prisma.supplier.findUnique({
      where: { id: partyId },
    });
    if (!supplier) return null;

    const purchases = await prisma.purchase.findMany({
      where: {
        supplierId: partyId,
        status: { not: "cancelled" },
        ...(startDate ? { purchaseDate: { gte: new Date(startDate) } } : {}),
        ...(endDate ? { purchaseDate: { lte: new Date(endDate) } } : {}),
      },
      orderBy: { purchaseDate: "asc" },
      include: {
        payments: true,
      },
    });

    const entries: StatementEntry[] = [];
    let runningBalance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    for (const p of purchases) {
      runningBalance += p.totalAmount;
      totalDebit += p.totalAmount;
      entries.push({
        date: p.purchaseDate.toISOString(),
        reference: p.reference,
        label: `Commande d'achat fournisseur n° ${p.reference}`,
        debit: p.totalAmount,
        credit: 0,
        balance: runningBalance,
      });

      for (const py of p.payments) {
        runningBalance -= py.amount;
        totalCredit += py.amount;
        entries.push({
          date: py.paymentDate.toISOString(),
          reference: py.reference || `PAYF-${py.id}`,
          label: `Paiement émis (${py.method})`,
          debit: 0,
          credit: py.amount,
          balance: runningBalance,
        });
      }
    }

    return {
      type: "supplier",
      party: supplier,
      startDate,
      endDate,
      entries,
      totalDebit,
      totalCredit,
      finalBalance: runningBalance,
    };
  }
}

export async function getPartiesForStatement(): Promise<{
  customers: Array<{ id: number; name: string; phone?: string | null }>;
  suppliers: Array<{ id: number; name: string; phone?: string | null }>;
}> {
  const [customers, suppliers] = await Promise.all([
    prisma.customer.findMany({
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true, phone: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { customers, suppliers };
}
