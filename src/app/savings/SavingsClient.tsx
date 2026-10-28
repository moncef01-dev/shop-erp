"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import {
  Coins,
  ArrowDownToLine,
  ArrowUpFromLine,
  ShoppingCart,
  Search,
  Plus,
  Printer,
  FileText,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  History,
  Users,
  Eye,
  Filter,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type CustomerSavingsAccountSummary,
  type CustomerSavingsTransactionView,
  recordSavingsDepositAction,
  recordSavingsRefundAction,
  allocateSavingsToInvoiceAction,
  getCustomerSavingsDetailsAction,
  getSavingsReceiptDataAction,
  getSavingsStatementDataAction,
  type PrintableSavingsReceiptData,
  type PrintableSavingsStatementData,
} from "./actions";
import type { ShopSettingsData } from "@/app/settings/actions";
import { PrintableSavingsDepositReceipt } from "@/components/savings/PrintableSavingsDepositReceipt";
import { PrintableSavingsRefundReceipt } from "@/components/savings/PrintableSavingsRefundReceipt";
import { PrintableSavingsStatement } from "@/components/savings/PrintableSavingsStatement";

interface SavingsClientProps {
  initialData: {
    metrics: {
      totalAvailableSavings: number;
      totalDeposited: number;
      totalUsed: number;
      totalRefunded: number;
      activeAccountsCount: number;
      totalAccountsCount: number;
    };
    accounts: CustomerSavingsAccountSummary[];
    recentTransactions: CustomerSavingsTransactionView[];
    customers: Array<{
      id: number;
      code: string | null;
      name: string;
      phone: string | null;
      phone2: string | null;
    }>;
    activeCashSession: { id: number; reference: string } | null;
    settings: ShopSettingsData | null;
  };
  initialCustomerId?: number;
}

export function SavingsClient({ initialData, initialCustomerId }: SavingsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"accounts" | "transactions">("accounts");
  const [balanceFilter, setBalanceFilter] = useState<"all" | "positive" | "zero">("all");

  // Notifications
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 6000);
  };

  // Modals state
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [isAllocateModalOpen, setIsAllocateModalOpen] = useState(false);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

  // Form states - Deposit
  const [depositCustomerId, setDepositCustomerId] = useState<number | "">("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState("cash");
  const [depositDate, setDepositDate] = useState(new Date().toISOString().slice(0, 10));
  const [depositNotes, setDepositNotes] = useState("");

  // Form states - Refund
  const [refundCustomerId, setRefundCustomerId] = useState<number | "">("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState("cash");
  const [refundDate, setRefundDate] = useState(new Date().toISOString().slice(0, 10));
  const [refundReason, setRefundReason] = useState("");

  // Form states - Allocate
  const [allocateCustomerId, setAllocateCustomerId] = useState<number | "">("");
  const [allocateSaleId, setAllocateSaleId] = useState<number | "">("");
  const [allocateAmount, setAllocateAmount] = useState("");
  const [allocateNotes, setAllocateNotes] = useState("");
  const [customerUnpaidSales, setCustomerUnpaidSales] = useState<Array<{
    id: number;
    reference: string;
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    paymentStatus: string;
    saleDate: string;
  }>>([]);

  // Customer Details modal state
  const [selectedCustomerDetails, setSelectedCustomerDetails] = useState<Awaited<ReturnType<typeof getCustomerSavingsDetailsAction>>>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  // Printable document states
  const [printingDepositReceipt, setPrintingDepositReceipt] = useState<PrintableSavingsReceiptData | null>(null);
  const [printingRefundReceipt, setPrintingRefundReceipt] = useState<PrintableSavingsReceiptData | null>(null);
  const [printingStatement, setPrintingStatement] = useState<PrintableSavingsStatementData | null>(null);

  // Filtered accounts
  const filteredAccounts = useMemo(() => {
    let list = initialData.accounts;

    if (balanceFilter === "positive") {
      list = list.filter((a) => a.balance > 0);
    } else if (balanceFilter === "zero") {
      list = list.filter((a) => a.balance === 0);
    }

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(
      (a) =>
        a.customerName.toLowerCase().includes(q) ||
        (a.customerCode && a.customerCode.toLowerCase().includes(q)) ||
        (a.customerPhone && a.customerPhone.includes(q)) ||
        (a.customerPhone2 && a.customerPhone2.includes(q))
    );
  }, [initialData.accounts, balanceFilter, searchQuery]);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    if (!searchQuery.trim()) return initialData.recentTransactions;
    const q = searchQuery.toLowerCase();
    return initialData.recentTransactions.filter(
      (t) =>
        t.customerName.toLowerCase().includes(q) ||
        t.reference.toLowerCase().includes(q) ||
        (t.saleReference && t.saleReference.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }, [initialData.recentTransactions, searchQuery]);

  // Selected customer for deposit balance preview
  const selectedDepositAccount = useMemo(() => {
    if (!depositCustomerId) return null;
    return initialData.accounts.find((a) => a.customerId === Number(depositCustomerId));
  }, [depositCustomerId, initialData.accounts]);

  // Selected customer for refund balance preview
  const selectedRefundAccount = useMemo(() => {
    if (!refundCustomerId) return null;
    return initialData.accounts.find((a) => a.customerId === Number(refundCustomerId));
  }, [refundCustomerId, initialData.accounts]);

  // Selected customer for allocate balance preview
  const selectedAllocateAccount = useMemo(() => {
    if (!allocateCustomerId) return null;
    return initialData.accounts.find((a) => a.customerId === Number(allocateCustomerId));
  }, [allocateCustomerId, initialData.accounts]);

  // Open details modal
  const handleOpenCustomerDetails = async (customerId: number) => {
    try {
      setIsLoadingDetails(true);
      setIsDetailsModalOpen(true);
      const details = await getCustomerSavingsDetailsAction(customerId);
      setSelectedCustomerDetails(details);
    } catch {
      showNotification("error", "Impossible de charger les détails du compte.");
    } finally {
      setIsLoadingDetails(false);
    }
  };

  useEffect(() => {
    if (initialCustomerId) {
      handleOpenCustomerDetails(initialCustomerId);
    }
  }, [initialCustomerId]);

  // Open allocate modal for a customer
  const handleOpenAllocateModal = async (customerId: number) => {
    setAllocateCustomerId(customerId);
    setAllocateSaleId("");
    setAllocateAmount("");
    setAllocateNotes("");
    setIsAllocateModalOpen(true);

    try {
      const details = await getCustomerSavingsDetailsAction(customerId);
      if (details) {
        setCustomerUnpaidSales(details.unpaidSales);
      }
    } catch {
      setCustomerUnpaidSales([]);
    }
  };

  // Submit Deposit
  const handleSubmitDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!depositCustomerId) {
      showNotification("error", "Veuillez sélectionner un client.");
      return;
    }
    const amt = parseFloat(depositAmount);
    if (isNaN(amt) || amt <= 0) {
      showNotification("error", "Veuillez saisir un montant valide strictement supérieur à 0 DA.");
      return;
    }

    startTransition(async () => {
      const res = await recordSavingsDepositAction({
        customerId: Number(depositCustomerId),
        amount: amt,
        paymentMethod: depositMethod,
        date: depositDate,
        notes: depositNotes || undefined,
      });

      if (res.success && res.data) {
        showNotification("success", res.message || "Dépôt enregistré avec succès.");
        setIsDepositModalOpen(false);
        setDepositCustomerId("");
        setDepositAmount("");
        setDepositNotes("");

        // Prompt to print receipt
        const receiptData = await getSavingsReceiptDataAction(res.data.transaction.id);
        if (receiptData) {
          setPrintingDepositReceipt(receiptData);
        }
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de l'enregistrement du dépôt.");
      }
    });
  };

  // Submit Refund
  const handleSubmitRefund = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundCustomerId) {
      showNotification("error", "Veuillez sélectionner un client.");
      return;
    }
    const amt = parseFloat(refundAmount);
    if (isNaN(amt) || amt <= 0) {
      showNotification("error", "Veuillez saisir un montant valide strictement supérieur à 0 DA.");
      return;
    }
    if (!refundReason.trim()) {
      showNotification("error", "Veuillez préciser le motif du remboursement.");
      return;
    }

    startTransition(async () => {
      const res = await recordSavingsRefundAction({
        customerId: Number(refundCustomerId),
        amount: amt,
        paymentMethod: refundMethod,
        date: refundDate,
        reason: refundReason,
      });

      if (res.success && res.data) {
        showNotification("success", res.message || "Remboursement validé avec succès.");
        setIsRefundModalOpen(false);
        setRefundCustomerId("");
        setRefundAmount("");
        setRefundReason("");

        // Prompt to print receipt
        const receiptData = await getSavingsReceiptDataAction(res.data.transaction.id);
        if (receiptData) {
          setPrintingRefundReceipt(receiptData);
        }
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors du remboursement.");
      }
    });
  };

  // Submit Allocate
  const handleSubmitAllocate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocateCustomerId || !allocateSaleId) {
      showNotification("error", "Veuillez sélectionner un client et une facture.");
      return;
    }
    const amt = parseFloat(allocateAmount);
    if (isNaN(amt) || amt <= 0) {
      showNotification("error", "Veuillez saisir un montant valide à déduire.");
      return;
    }

    startTransition(async () => {
      const res = await allocateSavingsToInvoiceAction({
        customerId: Number(allocateCustomerId),
        saleId: Number(allocateSaleId),
        amount: amt,
        notes: allocateNotes || undefined,
      });

      if (res.success) {
        showNotification("success", res.message || "Épargne appliquée à la facture.");
        setIsAllocateModalOpen(false);
        setAllocateCustomerId("");
        setAllocateSaleId("");
        setAllocateAmount("");
        setAllocateNotes("");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de l'affectation de l'épargne.");
      }
    });
  };

  // Print Statement for customer
  const handlePrintCustomerStatement = async (customerId: number) => {
    try {
      const statement = await getSavingsStatementDataAction({ customerId });
      if (statement) {
        setPrintingStatement(statement);
      } else {
        showNotification("error", "Impossible de générer le relevé.");
      }
    } catch {
      showNotification("error", "Erreur lors de la génération du relevé.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-semibold transition-all ${
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : "bg-rose-50 border-rose-300 text-rose-900"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0" />
          )}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header & Quick Action Buttons */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 flex items-center gap-2.5">
            <Coins className="h-7 w-7 text-amber-500" />
            Épargne Client &amp; Avoirs
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestion sécurisée des dépôts libres sans achat, déductions sur factures et remboursements de soldes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setDepositCustomerId("");
              setDepositAmount("");
              setDepositNotes("");
              setIsDepositModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-3.5 py-2 rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nouveau Dépôt d&apos;Épargne
          </button>

          <button
            type="button"
            onClick={() => {
              setRefundCustomerId("");
              setRefundAmount("");
              setRefundReason("");
              setIsRefundModalOpen(true);
            }}
            className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300 font-bold px-3.5 py-2 rounded-lg text-xs transition-colors cursor-pointer"
          >
            <ArrowUpFromLine className="h-4 w-4 text-rose-600" />
            Rembourser Épargne
          </button>
        </div>
      </div>

      {/* Key Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Available */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Épargne Disponible
            </span>
            <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
              <Coins className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-mono font-black text-slate-900 mt-2">
            {initialData.metrics.totalAvailableSavings.toLocaleString("fr-DZ")} DA
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {initialData.metrics.activeAccountsCount} client(s) avec solde actif
          </p>
        </div>

        {/* Total Deposited */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Dépôts Encaissés
            </span>
            <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
              <ArrowDownToLine className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-mono font-black text-emerald-700 mt-2">
            +{initialData.metrics.totalDeposited.toLocaleString("fr-DZ")} DA
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Total des versements reçus</p>
        </div>

        {/* Total Used on Purchases */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Utilisé sur Ventes
            </span>
            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
              <ShoppingCart className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-mono font-black text-indigo-700 mt-2">
            {initialData.metrics.totalUsed.toLocaleString("fr-DZ")} DA
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Consommé pour régler des factures</p>
        </div>

        {/* Total Refunded */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Restitué / Remboursé
            </span>
            <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
              <ArrowUpFromLine className="h-5 w-5" />
            </div>
          </div>
          <p className="text-2xl font-mono font-black text-rose-700 mt-2">
            {initialData.metrics.totalRefunded.toLocaleString("fr-DZ")} DA
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Restitué aux clients sur demande</p>
        </div>
      </div>

      {/* Main Container: Controls & Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Sub-header controls */}
        <div className="p-4 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50">
          {/* Tabs */}
          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-100 text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab("accounts")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeTab === "accounts"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Comptes Clients ({filteredAccounts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("transactions")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                activeTab === "transactions"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              Grand Livre des Mouvements ({filteredTransactions.length})
            </button>
          </div>

          {/* Search & Filter */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher un client, réf, tél..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg w-56 focus:outline-none focus:border-amber-500"
              />
            </div>

            {activeTab === "accounts" && (
              <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 text-xs">
                <Filter className="h-3 w-3 text-slate-400 ml-1.5" />
                <button
                  type="button"
                  onClick={() => setBalanceFilter("all")}
                  className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                    balanceFilter === "all" ? "bg-slate-900 text-white" : "text-slate-600"
                  }`}
                >
                  Tous
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceFilter("positive")}
                  className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                    balanceFilter === "positive" ? "bg-amber-500 text-slate-900" : "text-slate-600"
                  }`}
                >
                  Avec Solde (&gt; 0)
                </button>
                <button
                  type="button"
                  onClick={() => setBalanceFilter("zero")}
                  className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                    balanceFilter === "zero" ? "bg-slate-200 text-slate-900" : "text-slate-600"
                  }`}
                >
                  Soldés (0 DA)
                </button>
              </div>
            )}
          </div>
        </div>

        {/* TAB 1: ACCOUNTS LIST */}
        {activeTab === "accounts" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600">
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Téléphone</th>
                  <th className="py-3 px-4 text-right">Dépôts Reçus</th>
                  <th className="py-3 px-4 text-right">Consommé Ventes</th>
                  <th className="py-3 px-4 text-right">Remboursé</th>
                  <th className="py-3 px-4 text-right">Solde Disponible</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400 italic">
                      Aucun compte d&apos;épargne trouvé pour cette recherche.
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          onClick={() => handleOpenCustomerDetails(acc.customerId)}
                          className="font-bold text-slate-900 hover:text-amber-600 text-left cursor-pointer"
                        >
                          {acc.customerName}
                        </button>
                        <p className="text-[11px] text-slate-500 font-mono">
                          {acc.customerCode || `CLI-${acc.customerId}`}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono font-medium text-slate-600">
                        {acc.customerPhone || "—"}
                        {acc.customerPhone2 && (
                          <span className="block text-[10px] text-slate-400">{acc.customerPhone2}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-700 font-bold">
                        +{acc.totalDeposited.toLocaleString("fr-DZ")} DA
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-600 font-medium">
                        {acc.totalUsed > 0 ? `-${acc.totalUsed.toLocaleString("fr-DZ")} DA` : "0 DA"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-rose-700 font-medium">
                        {acc.totalRefunded > 0 ? `-${acc.totalRefunded.toLocaleString("fr-DZ")} DA` : "0 DA"}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`inline-block px-2.5 py-1 rounded font-mono font-bold text-xs ${
                            acc.balance > 0
                              ? "bg-amber-100 text-amber-900 border border-amber-300 font-black"
                              : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {acc.balance.toLocaleString("fr-DZ")} DA
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenCustomerDetails(acc.customerId)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                            title="Historique & Détails du compte"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDepositCustomerId(acc.customerId);
                              setDepositAmount("");
                              setDepositNotes("");
                              setIsDepositModalOpen(true);
                            }}
                            className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                            title="Encaisser un nouveau dépôt"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                          {acc.balance > 0 && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleOpenAllocateModal(acc.customerId)}
                                className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                                title="Affecter à une facture"
                              >
                                <ShoppingCart className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setRefundCustomerId(acc.customerId);
                                  setRefundAmount(String(acc.balance));
                                  setRefundReason("");
                                  setIsRefundModalOpen(true);
                                }}
                                className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                title="Rembourser tout ou partie de l'épargne"
                              >
                                <ArrowUpFromLine className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => handlePrintCustomerStatement(acc.customerId)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                            title="Imprimer le relevé d'épargne"
                          >
                            <FileText className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* TAB 2: TRANSACTIONS GRAND LIVRE */}
        {activeTab === "transactions" && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-black uppercase text-slate-600">
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Référence</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Mode</th>
                  <th className="py-3 px-4 text-right">Montant</th>
                  <th className="py-3 px-4 text-right">Nouveau Solde</th>
                  <th className="py-3 px-4">Description / Pièce</th>
                  <th className="py-3 px-4 text-center">Reçu</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTransactions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-400 italic">
                      Aucune transaction d&apos;épargne enregistrée.
                    </td>
                  </tr>
                ) : (
                  filteredTransactions.map((tx) => {
                    const isIncome = tx.direction === "IN";
                    const isDeposit = tx.type === "DEPOSIT";
                    const isUsage = tx.type === "USAGE";
                    const isRefund = tx.type === "REFUND";
                    const isReversal = tx.type === "REVERSAL";

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 text-slate-600 font-medium">
                          {new Date(tx.date).toLocaleDateString("fr-DZ", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {tx.reference}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {tx.customerName}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isDeposit
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : isUsage
                                ? "bg-indigo-100 text-indigo-800 border border-indigo-300"
                                : isRefund
                                ? "bg-rose-100 text-rose-800 border border-rose-300"
                                : "bg-amber-100 text-amber-800 border border-amber-300"
                            }`}
                          >
                            {isDeposit
                              ? "Dépôt"
                              : isUsage
                              ? "Déduction Vente"
                              : isRefund
                              ? "Remboursement"
                              : "Rétablissement"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-600 font-semibold uppercase text-[11px]">
                          {tx.paymentMethod === "cash"
                            ? "Espèces"
                            : tx.paymentMethod === "cib"
                            ? "CIB"
                            : tx.paymentMethod === "check"
                            ? "Chèque"
                            : tx.paymentMethod === "transfer"
                            ? "Virement"
                            : tx.paymentMethod}
                        </td>
                        <td
                          className={`py-3 px-4 text-right font-mono font-bold ${
                            isIncome ? "text-emerald-700" : "text-rose-700"
                          }`}
                        >
                          {isIncome ? `+${tx.amount.toLocaleString("fr-DZ")}` : `-${tx.amount.toLocaleString("fr-DZ")}`} DA
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                          {tx.balanceAfter.toLocaleString("fr-DZ")} DA
                        </td>
                        <td className="py-3 px-4 text-slate-600 text-xs max-w-xs truncate">
                          {tx.description}
                          {tx.saleReference && (
                            <span className="font-mono text-slate-900 ml-1 font-bold">
                              [{tx.saleReference}]
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {(isDeposit || isRefund) && (
                            <button
                              type="button"
                              onClick={async () => {
                                const receiptData = await getSavingsReceiptDataAction(tx.id);
                                if (receiptData) {
                                  if (isDeposit) setPrintingDepositReceipt(receiptData);
                                  else setPrintingRefundReceipt(receiptData);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                              title="Réimprimer le reçu"
                            >
                              <Printer className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── MODAL 1: NOUVEAU DÉPÔT D'ÉPARGNE ─────────────────────────────────── */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
                Nouveau Dépôt d&apos;Épargne Client
              </h2>
              <button
                type="button"
                onClick={() => setIsDepositModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Client Déposant *
                </label>
                <select
                  value={depositCustomerId}
                  onChange={(e) => setDepositCustomerId(Number(e.target.value))}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">-- Sélectionnez un client --</option>
                  {initialData.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.code ? `(${c.code})` : ""} {c.phone ? `— Tél: ${c.phone}` : ""}
                    </option>
                  ))}
                </select>
                {selectedDepositAccount && (
                  <p className="text-[11px] text-amber-700 mt-1 font-semibold">
                    Solde d&apos;épargne actuel : {selectedDepositAccount.balance.toLocaleString("fr-DZ")} DA
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Montant du Dépôt (DA) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Ex: 50000"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-lg text-emerald-700 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Mode d&apos;Encaissement *
                  </label>
                  <select
                    value={depositMethod}
                    onChange={(e) => setDepositMethod(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-amber-500"
                  >
                    <option value="cash">Espèces (Caisse)</option>
                    <option value="cib">Carte CIB / Edahabia</option>
                    <option value="check">Chèque bancaire</option>
                    <option value="transfer">Virement bancaire</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Date Réelle de Perception
                </label>
                <input
                  type="date"
                  value={depositDate}
                  onChange={(e) => setDepositDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Note ou Motif Optionnel
                </label>
                <input
                  type="text"
                  placeholder="Ex : Versement en prévision d'achat d'une chambre à coucher"
                  value={depositNotes}
                  onChange={(e) => setDepositNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900 leading-relaxed">
                <span className="font-bold">Confirmation Trésorerie :</span> Ce versement sera immédiatement crédité
                sur l&apos;épargne du client et enregistré en trésorerie sans créer de facture ni de dette commerciale.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Enregistrement..." : "Confirmer le Dépôt"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 2: REMBOURSEMENT D'ÉPARGNE ─────────────────────────────────── */}
      {isRefundModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowUpFromLine className="h-5 w-5 text-rose-600" />
                Remboursement d&apos;Épargne Client
              </h2>
              <button
                type="button"
                onClick={() => setIsRefundModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitRefund} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Client Bénéficiaire *
                </label>
                <select
                  value={refundCustomerId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setRefundCustomerId(id);
                    const acc = initialData.accounts.find((a) => a.customerId === id);
                    if (acc) {
                      setRefundAmount(String(acc.balance));
                    }
                  }}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-rose-500"
                >
                  <option value="">-- Sélectionnez un client avec solde --</option>
                  {initialData.accounts
                    .filter((a) => a.balance > 0)
                    .map((a) => (
                      <option key={a.customerId} value={a.customerId}>
                        {a.customerName} — Solde disponible: {a.balance.toLocaleString("fr-DZ")} DA
                      </option>
                    ))}
                </select>
              </div>

              {selectedRefundAccount && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center text-xs">
                  <span className="text-slate-600 font-medium">Solde d&apos;épargne disponible :</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {selectedRefundAccount.balance.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Montant à Restituer (DA) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    max={selectedRefundAccount ? selectedRefundAccount.balance : undefined}
                    placeholder="Montant en DA"
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-lg text-rose-700 focus:outline-none focus:border-rose-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Mode de Restitution *
                  </label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:border-rose-500"
                  >
                    <option value="cash">Espèces (Décaissement Caisse)</option>
                    <option value="transfer">Virement bancaire</option>
                    <option value="check">Chèque bancaire</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Motif de Remboursement *
                </label>
                <input
                  type="text"
                  placeholder="Ex : Restitution sur demande du client suite abandon du projet"
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Date Réelle de Décaissement
                </label>
                <input
                  type="date"
                  value={refundDate}
                  onChange={(e) => setRefundDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-900 leading-relaxed">
                <span className="font-bold">Avertissement Contrôle :</span> Le montant sera déduit du solde d&apos;épargne
                et créera un décaissement officiel de trésorerie daté du jour.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsRefundModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-bold bg-rose-700 hover:bg-rose-800 text-white rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Traitement..." : "Confirmer le Remboursement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 3: AFFECTATION À UNE FACTURE EXISTANTE ────────────────────── */}
      {isAllocateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-indigo-600" />
                Affecter l&apos;Épargne à une Facture Client
              </h2>
              <button
                type="button"
                onClick={() => setIsAllocateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitAllocate} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Client Titulaire
                </label>
                <p className="text-sm font-bold text-slate-900">
                  {selectedAllocateAccount?.customerName}
                </p>
                <p className="text-xs text-amber-700 font-semibold font-mono mt-0.5">
                  Solde d&apos;épargne disponible : {selectedAllocateAccount?.balance.toLocaleString("fr-DZ")} DA
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Facture à Régler *
                </label>
                {customerUnpaidSales.length === 0 ? (
                  <p className="text-xs text-slate-500 italic p-3 bg-slate-50 rounded border">
                    Ce client n&apos;a aucune facture impayée ou partielle en cours.
                  </p>
                ) : (
                  <select
                    value={allocateSaleId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setAllocateSaleId(id);
                      const s = customerUnpaidSales.find((item) => item.id === id);
                      if (s && selectedAllocateAccount) {
                        const maxVal = Math.min(s.remainingAmount, selectedAllocateAccount.balance);
                        setAllocateAmount(String(maxVal));
                      }
                    }}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Sélectionnez la facture --</option>
                    {customerUnpaidSales.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.reference} — Reste dû : {s.remainingAmount.toLocaleString("fr-DZ")} DA (Total: {s.totalAmount.toLocaleString("fr-DZ")} DA)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Montant à Déduire de l&apos;Épargne (DA) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={allocateAmount}
                  onChange={(e) => setAllocateAmount(e.target.value)}
                  required
                  placeholder="Montant en DA"
                  className="w-full px-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-lg text-indigo-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Notes / Observations
                </label>
                <input
                  type="text"
                  placeholder="Ex : Règlement partiel commande salon"
                  value={allocateNotes}
                  onChange={(e) => setAllocateNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-[11px] text-indigo-900 leading-relaxed">
                <span className="font-bold">Règle de Trésorerie :</span> Ce montant déduira l&apos;épargne du client
                et soldera la facture sans créer de nouvel encaissement physique en caisse.
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAllocateModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending || customerUnpaidSales.length === 0}
                  className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Affectation..." : "Valider le Règlement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL 4: DÉTAILS & HISTORIQUE DU COMPTE CLIENT ──────────────────── */}
      {isDetailsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl p-6 max-h-[90vh] flex flex-col space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Coins className="h-5 w-5 text-amber-500" />
                  Compte d&apos;Épargne — {selectedCustomerDetails?.customer.name}
                </h2>
                <p className="text-xs text-slate-500 font-mono">
                  {selectedCustomerDetails?.customer.code} • Tél: {selectedCustomerDetails?.customer.phone || "—"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {selectedCustomerDetails && (
                  <button
                    type="button"
                    onClick={() => handlePrintCustomerStatement(selectedCustomerDetails.customer.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5 text-slate-600" />
                    Imprimer Relevé
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsDetailsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1.5 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {isLoadingDetails ? (
              <div className="py-12 text-center text-slate-500 italic">
                Chargement des mouvements d&apos;épargne...
              </div>
            ) : selectedCustomerDetails ? (
              <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                {/* Summary mini cards */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 border rounded-lg text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Dépôts</p>
                    <p className="text-sm font-mono font-bold text-emerald-700">
                      +{selectedCustomerDetails.account.totalDeposited.toLocaleString("fr-DZ")} DA
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 border rounded-lg text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Utilisé</p>
                    <p className="text-sm font-mono font-bold text-indigo-700">
                      -{selectedCustomerDetails.account.totalUsed.toLocaleString("fr-DZ")} DA
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 border rounded-lg text-center">
                    <p className="text-[10px] uppercase font-bold text-slate-500">Remboursé</p>
                    <p className="text-sm font-mono font-bold text-rose-700">
                      -{selectedCustomerDetails.account.totalRefunded.toLocaleString("fr-DZ")} DA
                    </p>
                  </div>
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-center">
                    <p className="text-[10px] uppercase font-black text-amber-900">Solde Restant</p>
                    <p className="text-base font-mono font-black text-amber-900">
                      {selectedCustomerDetails.account.balance.toLocaleString("fr-DZ")} DA
                    </p>
                  </div>
                </div>

                {/* Table of all customer transactions */}
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-[11px] font-black uppercase text-slate-600">
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Réf</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3 text-right">Montant</th>
                        <th className="py-2.5 px-3 text-right">Solde Après</th>
                        <th className="py-2.5 px-3">Pièce / Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedCustomerDetails.transactions.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-400 italic">
                            Aucun mouvement enregistré.
                          </td>
                        </tr>
                      ) : (
                        selectedCustomerDetails.transactions.map((tx) => (
                          <tr key={tx.id} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 text-slate-600">
                              {new Date(tx.date).toLocaleDateString("fr-DZ")}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold">{tx.reference}</td>
                            <td className="py-2 px-3">
                              <span
                                className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  tx.type === "DEPOSIT"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : tx.type === "USAGE"
                                    ? "bg-indigo-100 text-indigo-800"
                                    : tx.type === "REFUND"
                                    ? "bg-rose-100 text-rose-800"
                                    : "bg-amber-100 text-amber-800"
                                }`}
                              >
                                {tx.type === "DEPOSIT"
                                  ? "Dépôt"
                                  : tx.type === "USAGE"
                                  ? "Utilisation"
                                  : tx.type === "REFUND"
                                  ? "Remboursement"
                                  : "Rétablissement"}
                              </span>
                            </td>
                            <td
                              className={`py-2 px-3 text-right font-mono font-bold ${
                                tx.direction === "IN" ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {tx.direction === "IN" ? `+${tx.amount.toLocaleString("fr-DZ")}` : `-${tx.amount.toLocaleString("fr-DZ")}`} DA
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                              {tx.balanceAfter.toLocaleString("fr-DZ")} DA
                            </td>
                            <td className="py-2 px-3 text-slate-600 truncate max-w-xs">
                              {tx.description}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ── PRINT MODALS ────────────────────────────────────────────────────── */}
      {printingDepositReceipt && (
        <PrintableSavingsDepositReceipt
          data={printingDepositReceipt}
          onClose={() => setPrintingDepositReceipt(null)}
          autoPrint={true}
        />
      )}

      {printingRefundReceipt && (
        <PrintableSavingsRefundReceipt
          data={printingRefundReceipt}
          onClose={() => setPrintingRefundReceipt(null)}
          autoPrint={true}
        />
      )}

      {printingStatement && (
        <PrintableSavingsStatement
          data={printingStatement}
          onClose={() => setPrintingStatement(null)}
          autoPrint={true}
        />
      )}
    </div>
  );
}

