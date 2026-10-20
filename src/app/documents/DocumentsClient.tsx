"use client";

import React, { useState, useMemo } from "react";
import {
  FileText,
  Search,
  Printer,
  Truck,
  ShoppingCart,
  Package,
  ArrowRightLeft,
  Wallet,
  Receipt,
  ClipboardList,
  UserCheck,
  Building2,
  Calendar,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type {
  DocumentsDashboardData,
  UnifiedDocumentItem,
  DocumentTypeFilter,
} from "./actions";
import {
  getInventorySheetData,
  getAccountStatementData,
  getPartiesForStatement,
} from "./actions";
import { downloadInventoryPdf } from "@/lib/pdf/inventoryPdf";
import {
  PrintableInvoice,
  PrintablePaymentReceipt,
  type PrintableSale,
  type PrintablePayment,
} from "@/components/sales/PrintableInvoice";
import {
  PrintablePurchaseOrder,
  PrintableGoodsReceipt,
  PrintableSupplierPaymentReceipt,
  type PrintablePurchase,
  type PrintablePurchaseReceipt,
  type PrintableSupplierPayment,
} from "@/components/purchases/PrintablePurchaseDocuments";
import {
  PrintableCashClosingReport,
  PrintableExpenseVoucher,
} from "@/components/cash/PrintableCashDocuments";
import {
  PrintableStockTransfer,
  PrintableInventorySheet,
  PrintableAccountStatement,
  type PrintableTransferData,
  type PrintableInventoryItem,
  type PrintableAccountStatementData,
} from "@/components/documents/PrintableNewDocuments";

export function DocumentsClient({ initialData }: { initialData: DocumentsDashboardData }) {
  const [data] = useState(initialData);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<DocumentTypeFilter>("all");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "week" | "month">("all");

  // Modal print targets
  const [activeSaleModal, setActiveSaleModal] = useState<PrintableSale | null>(null);
  const [activePurchaseModal, setActivePurchaseModal] = useState<PrintablePurchase | null>(null);
  const [activeReceiptModal, setActiveReceiptModal] = useState<{
    receipt: PrintablePurchaseReceipt;
    purchase: PrintablePurchase;
  } | null>(null);
  const [activeClientPaymentModal, setActiveClientPaymentModal] = useState<{
    payment: PrintablePayment;
    sale: PrintableSale;
  } | null>(null);
  const [activeSupplierPaymentModal, setActiveSupplierPaymentModal] = useState<{
    payment: PrintableSupplierPayment;
    purchase: PrintablePurchase;
  } | null>(null);
  const [activeCashSessionModal, setActiveCashSessionModal] = useState<UnifiedDocumentItem["cashSessionPayload"] | null>(null);
  const [activeExpenseModal, setActiveExpenseModal] = useState<UnifiedDocumentItem["expensePayload"] | null>(null);
  const [activeTransferModal, setActiveTransferModal] = useState<PrintableTransferData | null>(null);

  // Special on-demand modal generators
  const [isInventoryModalOpen, setIsInventoryModalOpen] = useState(false);
  const [inventoryLocationId, setInventoryLocationId] = useState<number | undefined>(undefined);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfSuccessMessage, setPdfSuccessMessage] = useState<string | null>(null);
  const [activeInventorySheet, setActiveInventorySheet] = useState<{
    locationName: string;
    locationCode?: string;
    isGlobal?: boolean;
    locations?: { id: number; name: string; code: string }[];
    items: PrintableInventoryItem[];
  } | null>(null);

  const [isStatementModalOpen, setIsStatementModalOpen] = useState(false);
  const [statementType, setStatementType] = useState<"customer" | "supplier">("customer");
  const [statementPartyId, setStatementPartyId] = useState<number | "">("");
  const [partiesList, setPartiesList] = useState<{
    customers: Array<{ id: number; name: string; phone?: string | null }>;
    suppliers: Array<{ id: number; name: string; phone?: string | null }>;
  } | null>(null);
  const [activeStatementSheet, setActiveStatementSheet] = useState<PrintableAccountStatementData | null>(null);

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    let result = data.documents;

    // 1. Tab filter
    if (activeTab !== "all") {
      if (activeTab === "invoice") {
        result = result.filter((d) => d.type === "invoice" || d.type === "quote");
      } else {
        result = result.filter((d) => d.type === activeTab);
      }
    }

    // 2. Date filter
    if (dateFilter !== "all") {
      const now = new Date();
      now.setHours(23, 59, 59, 999);

      const cutoff = new Date();
      if (dateFilter === "today") {
        cutoff.setHours(0, 0, 0, 0);
      } else if (dateFilter === "week") {
        cutoff.setDate(cutoff.getDate() - 7);
        cutoff.setHours(0, 0, 0, 0);
      } else if (dateFilter === "month") {
        cutoff.setDate(cutoff.getDate() - 30);
        cutoff.setHours(0, 0, 0, 0);
      }

      result = result.filter((d) => new Date(d.date) >= cutoff);
    }

    // 3. Search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(
        (d) =>
          d.reference.toLowerCase().includes(q) ||
          d.partyName.toLowerCase().includes(q) ||
          d.typeLabel.toLowerCase().includes(q) ||
          (d.notes && d.notes.toLowerCase().includes(q))
      );
    }

    return result;
  }, [data.documents, activeTab, dateFilter, search]);

  // Handler to open print modal based on doc type
  const handleOpenPrint = (doc: UnifiedDocumentItem) => {
    switch (doc.type) {
      case "invoice":
      case "quote":
        if (doc.salePayload) setActiveSaleModal(doc.salePayload);
        break;
      case "purchase":
        if (doc.purchasePayload) setActivePurchaseModal(doc.purchasePayload);
        break;
      case "receipt":
        if (doc.receiptPayload && doc.purchasePayload) {
          setActiveReceiptModal({
            receipt: doc.receiptPayload,
            purchase: doc.purchasePayload,
          });
        }
        break;
      case "payment_client":
        if (doc.paymentPayload && doc.salePayload) {
          setActiveClientPaymentModal({
            payment: doc.paymentPayload,
            sale: doc.salePayload,
          });
        }
        break;
      case "payment_supplier":
        if (doc.supplierPaymentPayload && doc.purchasePayload) {
          setActiveSupplierPaymentModal({
            payment: doc.supplierPaymentPayload,
            purchase: doc.purchasePayload,
          });
        }
        break;
      case "cash_session":
        if (doc.cashSessionPayload) setActiveCashSessionModal(doc.cashSessionPayload);
        break;
      case "expense":
        if (doc.expensePayload) setActiveExpenseModal(doc.expensePayload);
        break;
      case "transfer":
        if (doc.transferPayload) setActiveTransferModal(doc.transferPayload);
        break;
      default:
        break;
    }
  };

  // Generate Inventory Sheet (Aperçu)
  const handleGenerateInventory = async () => {
    const sheetData = await getInventorySheetData(inventoryLocationId);
    setActiveInventorySheet(sheetData);
    setIsInventoryModalOpen(false);
  };

  // Download Genuine Inventory PDF (Téléchargement direct)
  const handleDownloadInventoryPdf = async () => {
    try {
      setIsDownloadingPdf(true);
      setPdfError(null);
      const sheetData = await getInventorySheetData(inventoryLocationId);
      const fileName = await downloadInventoryPdf({
        data: sheetData,
        settings: data.settings,
      });
      setPdfSuccessMessage(`Fiche d'inventaire téléchargée avec succès (${fileName}).`);
      setTimeout(() => setPdfSuccessMessage(null), 5000);
      setIsInventoryModalOpen(false);
    } catch (err) {
      console.error("Erreur lors de l'exportation PDF de la fiche d'inventaire:", err);
      setPdfError("Une erreur est survenue lors de la génération du fichier PDF. Veuillez réessayer.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  // Open statement modal & fetch party list
  const handleOpenStatementModal = async () => {
    setIsStatementModalOpen(true);
    if (!partiesList) {
      const p = await getPartiesForStatement();
      setPartiesList(p);
      if (p.customers.length > 0) {
        setStatementPartyId(p.customers[0].id);
      }
    }
  };

  // Generate Account Statement
  const handleGenerateStatement = async () => {
    if (!statementPartyId) return;
    const stmt = await getAccountStatementData({
      type: statementType,
      partyId: Number(statementPartyId),
    });
    if (stmt) {
      setActiveStatementSheet(stmt);
      setIsStatementModalOpen(false);
    }
  };

  // Type Badge configuration
  const getTypeBadge = (type: DocumentTypeFilter) => {
    switch (type) {
      case "invoice":
        return {
          bg: "bg-blue-50 text-blue-700 border-blue-200",
          icon: ShoppingCart,
          label: "Facture",
        };
      case "quote":
        return {
          bg: "bg-amber-50 text-amber-700 border-amber-200",
          icon: FileText,
          label: "Devis",
        };
      case "purchase":
        return {
          bg: "bg-indigo-50 text-indigo-700 border-indigo-200",
          icon: Building2,
          label: "Achat Fournisseur",
        };
      case "receipt":
        return {
          bg: "bg-teal-50 text-teal-700 border-teal-200",
          icon: Package,
          label: "Réception Stock",
        };
      case "payment_client":
        return {
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          icon: Receipt,
          label: "Versement Client",
        };
      case "payment_supplier":
        return {
          bg: "bg-emerald-50 text-emerald-800 border-emerald-300",
          icon: Receipt,
          label: "Règlement Fournisseur",
        };
      case "cash_session":
        return {
          bg: "bg-slate-100 text-slate-800 border-slate-300",
          icon: Wallet,
          label: "Clôture Caisse",
        };
      case "expense":
        return {
          bg: "bg-rose-50 text-rose-700 border-rose-200",
          icon: Wallet,
          label: "Pièce de Dépense",
        };
      case "transfer":
        return {
          bg: "bg-cyan-50 text-cyan-700 border-cyan-200",
          icon: ArrowRightLeft,
          label: "Transfert Dépôt",
        };
      default:
        return {
          bg: "bg-slate-50 text-slate-700 border-slate-200",
          icon: FileText,
          label: "Document",
        };
    }
  };

  return (
    <div className="space-y-6">
      {pdfSuccessMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5">
            <Download className="h-4 w-4 text-emerald-600 shrink-0" />
            <span>{pdfSuccessMessage}</span>
          </div>
          <button
            onClick={() => setPdfSuccessMessage(null)}
            className="text-emerald-500 hover:text-emerald-700 font-bold p-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  Archives &amp; Documents Commerciaux
                </h1>
                <p className="text-xs text-slate-500">
                  Hub centralisé de recherche, consultation et réimpression de toutes les pièces ERP
                </p>
              </div>
            </div>
          </div>

          {/* Quick On-demand Document Generators */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsInventoryModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <ClipboardList className="h-4 w-4 text-amber-400" />
              Fiche d&apos;Inventaire A4
            </button>
            <button
              onClick={handleOpenStatementModal}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <UserCheck className="h-4 w-4 text-indigo-300" />
              Relevé de Compte Tiers
            </button>
          </div>
        </div>

        {/* Quick KPI stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-6 pt-6 border-t border-slate-100 text-center">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
            <p className="text-[11px] text-slate-500">Total Pièces</p>
            <p className="text-lg font-bold text-slate-900 font-mono mt-0.5">
              {data.stats.totalDocuments}
            </p>
          </div>
          <div className="bg-blue-50/60 p-2.5 rounded-lg border border-blue-100">
            <p className="text-[11px] text-blue-700">Factures / Devis</p>
            <p className="text-lg font-bold text-blue-900 font-mono mt-0.5">
              {data.stats.invoicesCount}
            </p>
          </div>
          <div className="bg-indigo-50/60 p-2.5 rounded-lg border border-indigo-100">
            <p className="text-[11px] text-indigo-700">Commandes Achats</p>
            <p className="text-lg font-bold text-indigo-900 font-mono mt-0.5">
              {data.stats.purchasesCount}
            </p>
          </div>
          <div className="bg-teal-50/60 p-2.5 rounded-lg border border-teal-100">
            <p className="text-[11px] text-teal-700">Bons Réception</p>
            <p className="text-lg font-bold text-teal-900 font-mono mt-0.5">
              {data.stats.receiptsCount}
            </p>
          </div>
          <div className="bg-emerald-50/60 p-2.5 rounded-lg border border-emerald-100">
            <p className="text-[11px] text-emerald-700">Règlements</p>
            <p className="text-lg font-bold text-emerald-900 font-mono mt-0.5">
              {data.stats.paymentsCount}
            </p>
          </div>
          <div className="bg-cyan-50/60 p-2.5 rounded-lg border border-cyan-100">
            <p className="text-[11px] text-cyan-700">Transferts</p>
            <p className="text-lg font-bold text-cyan-900 font-mono mt-0.5">
              {data.stats.transfersCount}
            </p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par référence, client, fournisseur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-2 text-sm focus:border-amber-500 focus:outline-hidden"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Date Quick Filter */}
          <div className="flex items-center gap-1.5 text-sm text-slate-500 w-full md:w-auto justify-end">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold mr-1">Période :</span>
            {(
              [
                { id: "all", label: "Toutes" },
                { id: "today", label: "Aujourd'hui" },
                { id: "week", label: "7 jours" },
                { id: "month", label: "30 jours" },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                onClick={() => setDateFilter(f.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                  dateFilter === f.id
                    ? "bg-amber-500 text-white"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Document Type Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
          {(
            [
              { id: "all", label: "Tous" },
              { id: "invoice", label: "Factures & Devis" },
              { id: "purchase", label: "Commandes Achats" },
              { id: "receipt", label: "Bons de Réception" },
              { id: "payment_client", label: "Versements Clients" },
              { id: "payment_supplier", label: "Règlements Fournisseurs" },
              { id: "cash_session", label: "Clôtures Caisse" },
              { id: "expense", label: "Dépenses Caisse" },
              { id: "transfer", label: "Transferts Dépôt" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === t.id
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-600"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Document Table */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-sm font-semibold">
                <th className="py-3 px-4">Type de Pièce</th>
                <th className="py-3 px-4">Référence</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Tiers / Responsable</th>
                <th className="py-3 px-4 text-right">Montant / Volume</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDocuments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">Aucun document ne correspond à vos filtres.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Essayez d&apos;élargir la période ou d&apos;effacer votre recherche.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredDocuments.map((doc) => {
                  const badge = getTypeBadge(doc.type);
                  const Icon = badge.icon;
                  const isTransfer = doc.type === "transfer";

                  return (
                    <tr key={doc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${badge.bg}`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {doc.typeLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-sm text-slate-900">
                        {doc.reference}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {new Date(doc.date).toLocaleDateString("fr-DZ", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-900 block">{doc.partyName}</span>
                        {doc.notes && (
                          <span className="text-[11px] text-slate-400 truncate max-w-xs block">
                            {doc.notes}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        {isTransfer
                          ? `${doc.amount} pcs`
                          : `${doc.amount.toLocaleString("fr-DZ")} DA`}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                          {doc.statusLabel}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleOpenPrint(doc)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                        >
                          <Printer className="h-3.5 w-3.5 text-slate-600" />
                          Imprimer
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── MODALES DE RÉIMPRESSION RÉACTIVES ─────────────────────────────── */}

      {/* 1. Facture / Devis */}
      {activeSaleModal && (
        <PrintableInvoice
          sale={activeSaleModal}
          settings={data.settings}
          onClose={() => setActiveSaleModal(null)}
        />
      )}



      {/* 3. Commande Fournisseur */}
      {activePurchaseModal && (
        <PrintablePurchaseOrder
          purchase={activePurchaseModal}
          settings={data.settings}
          onClose={() => setActivePurchaseModal(null)}
        />
      )}

      {/* 4. Bon de Réception */}
      {activeReceiptModal && (
        <PrintableGoodsReceipt
          receipt={activeReceiptModal.receipt}
          purchase={activeReceiptModal.purchase}
          settings={data.settings}
          onClose={() => setActiveReceiptModal(null)}
        />
      )}

      {/* 5. Versement Client */}
      {activeClientPaymentModal && (
        <PrintablePaymentReceipt
          payment={activeClientPaymentModal.payment}
          sale={activeClientPaymentModal.sale}
          settings={data.settings}
          onClose={() => setActiveClientPaymentModal(null)}
        />
      )}

      {/* 6. Règlement Fournisseur */}
      {activeSupplierPaymentModal && (
        <PrintableSupplierPaymentReceipt
          payment={activeSupplierPaymentModal.payment}
          purchase={activeSupplierPaymentModal.purchase}
          settings={data.settings}
          onClose={() => setActiveSupplierPaymentModal(null)}
        />
      )}

      {/* 7. Clôture de Caisse */}
      {activeCashSessionModal && (
        <PrintableCashClosingReport
          session={activeCashSessionModal}
          settings={data.settings}
          onClose={() => setActiveCashSessionModal(null)}
        />
      )}

      {/* 8. Bon de Dépense */}
      {activeExpenseModal && (
        <PrintableExpenseVoucher
          expense={activeExpenseModal}
          settings={data.settings}
          onClose={() => setActiveExpenseModal(null)}
        />
      )}

      {/* 9. Transfert Inter-Dépôts */}
      {activeTransferModal && (
        <PrintableStockTransfer
          transfer={activeTransferModal}
          settings={data.settings}
          onClose={() => setActiveTransferModal(null)}
        />
      )}

      {/* 10. Fiche d'Inventaire générée */}
      {activeInventorySheet && (
        <PrintableInventorySheet
          locationName={activeInventorySheet.locationName}
          locationCode={activeInventorySheet.locationCode}
          items={activeInventorySheet.items}
          settings={data.settings}
          onClose={() => setActiveInventorySheet(null)}
        />
      )}

      {/* 11. Relevé de Compte généré */}
      {activeStatementSheet && (
        <PrintableAccountStatement
          statement={activeStatementSheet}
          settings={data.settings}
          onClose={() => setActiveStatementSheet(null)}
        />
      )}

      {/* ─── MODALE CHOIX DÉPÔT POUR FICHE D'INVENTAIRE ────────────────────── */}
      {isInventoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6 text-slate-900">
            <h3 className="text-base font-bold text-slate-900 mb-1 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-500" />
              Exporter la Fiche d&apos;Inventaire A4 (PDF)
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Sélectionnez le dépôt à auditer pour générer et télécharger immédiatement le fichier PDF de la fiche de comptage officiel.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Emplacement / Dépôt :
                </label>
                <select
                  value={inventoryLocationId || ""}
                  onChange={(e) => {
                    setInventoryLocationId(e.target.value ? Number(e.target.value) : undefined);
                    setPdfError(null);
                  }}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:border-amber-500 focus:outline-hidden font-medium"
                >
                  <option value="">Tous les dépôts (Inventaire Général)</option>
                  {data.locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </option>
                  ))}
                </select>
              </div>

              {pdfError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
                  <span>{pdfError}</span>
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleGenerateInventory}
                  disabled={isDownloadingPdf}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                  title="Afficher l'aperçu à l'écran avant impression"
                >
                  Aperçu à l&apos;écran
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsInventoryModalOpen(false);
                      setPdfError(null);
                    }}
                    disabled={isDownloadingPdf}
                    className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadInventoryPdf}
                    disabled={isDownloadingPdf}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer transition-colors"
                  >
                    {isDownloadingPdf ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Génération...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        Télécharger le PDF
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODALE CHOIX RELEVÉ DE COMPTE ─────────────────────────────────── */}
      {isStatementModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-6 text-slate-900">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Générer un Relevé de Compte Tiers
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Sélectionnez le type et le compte tiers pour imprimer l&apos;historique chronologique des débits, crédits et solde restant.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Type de tiers :
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setStatementType("customer");
                      if (partiesList?.customers.length) {
                        setStatementPartyId(partiesList.customers[0].id);
                      }
                    }}
                    className={`py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      statementType === "customer"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Client
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStatementType("supplier");
                      if (partiesList?.suppliers.length) {
                        setStatementPartyId(partiesList.suppliers[0].id);
                      }
                    }}
                    className={`py-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                      statementType === "supplier"
                        ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Fournisseur
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Sélectionner le {statementType === "customer" ? "Client" : "Fournisseur"} :
                </label>
                <select
                  value={statementPartyId}
                  onChange={(e) => setStatementPartyId(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-indigo-500 focus:outline-hidden"
                >
                  {statementType === "customer"
                    ? partiesList?.customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ""}
                        </option>
                      ))
                    : partiesList?.suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.phone ? `(${s.phone})` : ""}
                        </option>
                      ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setIsStatementModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleGenerateStatement}
                  className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer"
                >
                  Générer le Relevé
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
