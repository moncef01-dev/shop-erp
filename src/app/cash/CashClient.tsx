"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Wallet,
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  Lock,
  Unlock,
  Printer,
  FileSpreadsheet,
  Search,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  Receipt,
  Trash2,
} from "lucide-react";
import {
  openCashSessionAction,
  closeCashSessionAction,
  createExpenseAction,
  deleteExpenseAction,
  type CashDashboardData,
  type CashLedgerItem,
} from "./actions";
import {
  PrintableDailyCashJournal,
  PrintableCashClosingReport,
  PrintableExpenseVoucher,
  formatDA,
  formatDate,
  formatDateTime,
  formatMethodLabel,
} from "@/components/cash/PrintableCashDocuments";

interface CashClientProps {
  initialData: CashDashboardData;
}

export function CashClient({ initialData }: CashClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"dashboard" | "ledger" | "expenses" | "sessions" | "treasury">("dashboard");
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Filters for ledger
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modals state
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [openingAmountInput, setOpeningAmountInput] = useState("");
  const [openingNotesInput, setOpeningNotesInput] = useState("");

  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingAmountInput, setClosingAmountInput] = useState("");
  const [closingNotesInput, setClosingNotesInput] = useState("");

  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseType, setExpenseType] = useState<"expense" | "income">("expense");
  const [expenseCategory, setExpenseCategory] = useState("transport");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseMethod, setExpenseMethod] = useState("cash");
  const [expenseBeneficiary, setExpenseBeneficiary] = useState("");
  const [expenseReceiptNumber, setExpenseReceiptNumber] = useState("");
  const [expenseNotes, setExpenseNotes] = useState("");

  // Print Modals State
  const [printingDailyJournal, setPrintingDailyJournal] = useState<{
    sessionRef?: string;
    date: string;
    openingAmount: number;
    items: CashLedgerItem[];
  } | null>(null);

  const [printingClosingSession, setPrintingClosingSession] = useState<{
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
  } | null>(null);

  const [printingExpense, setPrintingExpense] = useState<{
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
  } | null>(null);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  const { activeSession, sessions, ledger, metrics } = initialData;

  // ─── ACTIONS OUVERTURE ET CLÔTURE ──────────────────────────────────────────

  const handleOpenSession = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(openingAmountInput.replace(/\s/g, ""));
    if (isNaN(amount) || amount < 0) {
      showNotification("error", "Le solde d'ouverture doit être un nombre positif ou nul.");
      return;
    }

    startTransition(async () => {
      const res = await openCashSessionAction({
        openingAmount: amount,
        openingNotes: openingNotesInput,
      });

      if (res.success) {
        showNotification("success", res.message || "Session de caisse ouverte.");
        setIsOpeningModalOpen(false);
        setOpeningAmountInput("");
        setOpeningNotesInput("");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de l'ouverture.");
      }
    });
  };

  const handleCloseSession = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;

    const amount = parseFloat(closingAmountInput.replace(/\s/g, ""));
    if (isNaN(amount) || amount < 0) {
      showNotification("error", "Veuillez saisir le montant physique compté en caisse (positif ou nul).");
      return;
    }

    startTransition(async () => {
      const res = await closeCashSessionAction({
        sessionId: activeSession.id,
        closingAmount: amount,
        closingNotes: closingNotesInput,
      });

      if (res.success) {
        showNotification("success", res.message || "Session de caisse clôturée.");
        setIsClosingModalOpen(false);
        setClosingAmountInput("");
        setClosingNotesInput("");
        router.refresh();
        if (res.data) {
          setPrintingClosingSession(res.data as unknown as NonNullable<typeof printingClosingSession>);
        }
      } else {
        showNotification("error", res.error || "Erreur lors de la clôture.");
      }
    });
  };

  // ─── ACTION NOUVELLE DÉPENSE / ENCAISSEMENT ────────────────────────────────

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(expenseAmount.replace(/\s/g, ""));
    if (isNaN(amount) || amount <= 0) {
      showNotification("error", "Le montant doit être un nombre strictement supérieur à 0.");
      return;
    }

    if (!expenseDescription.trim()) {
      showNotification("error", "Le motif / description de la dépense est obligatoire.");
      return;
    }

    const fd = new FormData();
    fd.set("type", expenseType);
    fd.set("category", expenseCategory);
    fd.set("description", expenseDescription);
    fd.set("amount", amount.toString());
    fd.set("method", expenseMethod);
    fd.set("beneficiary", expenseBeneficiary);
    fd.set("receiptNumber", expenseReceiptNumber);
    fd.set("notes", expenseNotes);

    startTransition(async () => {
      const res = await createExpenseAction(fd);
      if (res.success) {
        showNotification("success", res.message || "Opération enregistrée.");
        setIsExpenseModalOpen(false);
        setExpenseDescription("");
        setExpenseAmount("");
        setExpenseBeneficiary("");
        setExpenseReceiptNumber("");
        setExpenseNotes("");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de l'enregistrement.");
      }
    });
  };

  const handleDeleteExpense = (id: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette pièce de dépense ?")) return;

    startTransition(async () => {
      const res = await deleteExpenseAction(id);
      if (res.success) {
        showNotification("success", res.message || "Dépense supprimée.");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de la suppression.");
      }
    });
  };

  // ─── EXPORT CSV COMPATIBLE EXCEL FRANÇAIS ──────────────────────────────────

  const handleExportCSV = () => {
    const headers = [
      "Date",
      "Heure",
      "Reference",
      "Type",
      "Categorie",
      "Description",
      "Tiers / Beneficiaire",
      "Ref Document",
      "Mode de Reglement",
      "Impact Caisse Physique",
      "Montant (DA)",
    ];

    const rows = filteredLedger.map((item) => {
      const d = new Date(item.date);
      const datePart = d.toLocaleDateString("fr-DZ");
      const timePart = d.toLocaleTimeString("fr-DZ", { hour: "2-digit", minute: "2-digit" });
      return [
        `"${datePart}"`,
        `"${timePart}"`,
        `"${item.reference}"`,
        `"${item.type === "encaissement" ? "Encaissement (Entrée)" : "Décaissement (Sortie)"}"`,
        `"${item.category}"`,
        `"${item.description.replace(/"/g, '""')}"`,
        `"${(item.partyName || "").replace(/"/g, '""')}"`,
        `"${item.docReference || ""}"`,
        `"${formatMethodLabel(item.method)}"`,
        `"${item.affectsCash ? "Oui (Espèces)" : "Non (Bancaire)"}"`,
        item.amount,
      ].join(";");
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `journal_caisse_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ─── FILTRAGE DU GRAND LIVRE ────────────────────────────────────────────────

  const filteredLedger = ledger.filter((item) => {
    if (methodFilter !== "all" && item.method !== methodFilter) return false;
    if (typeFilter !== "all" && item.type !== typeFilter) return false;
    if (startDate) {
      const s = new Date(startDate).setHours(0, 0, 0, 0);
      if (new Date(item.date).getTime() < s) return false;
    }
    if (endDate) {
      const e = new Date(endDate).setHours(23, 59, 59, 999);
      if (new Date(item.date).getTime() > e) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match =
        item.reference.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.partyName.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.docReference && item.docReference.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const totalFilteredInflows = filteredLedger
    .filter((i) => i.type === "encaissement")
    .reduce((acc, i) => acc + i.amount, 0);

  const totalFilteredOutflows = filteredLedger
    .filter((i) => i.type === "decaissement")
    .reduce((acc, i) => acc + i.amount, 0);

  return (
    <div className="space-y-6">
      {/* ─── EN-TÊTE PRINCIPAL & NOTIFICATION ───────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Wallet className="h-7 w-7 text-amber-600" />
            Caisse &amp; Trésorerie
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestion du tiroir-caisse physique, suivi des recettes, décaissements et réconciliation bancaire.
          </p>
        </div>

        {/* Boutons d'actions rapides */}
        <div className="flex flex-wrap items-center gap-2">
          {activeSession ? (
            <button
              onClick={() => {
                setClosingAmountInput(activeSession.currentTheoreticalCash.toString());
                setIsClosingModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg shadow-sm transition"
            >
              <Lock className="h-4 w-4" />
              Clôturer la Caisse
            </button>
          ) : (
            <button
              onClick={() => setIsOpeningModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm transition"
            >
              <Unlock className="h-4 w-4" />
              Ouvrir une Session
            </button>
          )}

          <button
            onClick={() => {
              setExpenseType("expense");
              setIsExpenseModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-sm transition"
          >
            <Plus className="h-4 w-4 text-rose-600" />
            Enregistrer une Dépense
          </button>

          <button
            onClick={() => {
              setPrintingDailyJournal({
                sessionRef: activeSession?.reference,
                date: new Date().toISOString(),
                openingAmount: activeSession ? activeSession.openingAmount : 0,
                items: filteredLedger,
              });
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg shadow-sm transition"
          >
            <Printer className="h-4 w-4 text-slate-500" />
            Imprimer Journal
          </button>
        </div>
      </div>

      {notification && (
        <div
          className={`p-3.5 rounded-lg flex items-center justify-between text-xs font-medium ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
              : "bg-rose-50 text-rose-900 border border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{notification.text}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── BANNIÈRE D'ÉTAT DE SESSION DE CAISSE ────────────────────────────── */}
      {activeSession ? (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-300 rounded-xl p-4 shadow-xs">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500 text-white flex items-center justify-center shadow-xs">
                <Unlock className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-sm">
                    Session de Caisse Active : <span className="font-mono">{activeSession.reference}</span>
                  </span>
                  <span className="px-2.5 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 uppercase tracking-wide">
                    En service
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-0.5">
                  Ouverte le {formatDateTime(activeSession.openedAt)} &bull; Fond initial :{" "}
                  <span className="font-mono font-bold text-slate-900">{formatDA(activeSession.openingAmount)}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-xs uppercase font-bold text-slate-500 block">
                  Solde Théorique Tiroir
                </span>
                <span className="font-mono font-black text-xl text-amber-900">
                  {formatDA(activeSession.currentTheoreticalCash)}
                </span>
              </div>
              <button
                onClick={() => {
                  setClosingAmountInput(activeSession.currentTheoreticalCash.toString());
                  setIsClosingModalOpen(true);
                }}
                className="px-3 py-1.5 text-xs font-bold bg-amber-700 hover:bg-amber-800 text-white rounded-lg shadow-xs transition"
              >
                Clôturer
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-slate-200 text-slate-600 flex items-center justify-center">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <p className="font-bold text-slate-800 text-xs">Aucune session de caisse n&apos;est actuellement ouverte.</p>
              <p className="text-slate-500 text-[11px]">
                Pour enregistrer des mouvements physiques en espèces et effectuer le pointage du tiroir-caisse, ouvrez une session.
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsOpeningModalOpen(true)}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition shrink-0"
          >
            Ouvrir une Session
          </button>
        </div>
      )}

      {/* ─── ONGLETS DE NAVIGATION DU MODULE ────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`py-2.5 px-4 text-xs font-bold rounded-t-lg transition border-b-2 ${
              activeTab === "dashboard"
                ? "border-amber-600 text-amber-700 bg-amber-50/40"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Tableau de Caisse
          </button>
          <button
            onClick={() => setActiveTab("ledger")}
            className={`py-2.5 px-4 text-xs font-bold rounded-t-lg transition border-b-2 ${
              activeTab === "ledger"
                ? "border-amber-600 text-amber-700 bg-amber-50/40"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Journal des Mouvements ({ledger.length})
          </button>
          <button
            onClick={() => setActiveTab("expenses")}
            className={`py-2.5 px-4 text-xs font-bold rounded-t-lg transition border-b-2 ${
              activeTab === "expenses"
                ? "border-amber-600 text-amber-700 bg-amber-50/40"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Dépenses &amp; Charges ({initialData.expensesCount})
          </button>
          <button
            onClick={() => setActiveTab("sessions")}
            className={`py-2.5 px-4 text-xs font-bold rounded-t-lg transition border-b-2 ${
              activeTab === "sessions"
                ? "border-amber-600 text-amber-700 bg-amber-50/40"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Historique des Clôtures ({sessions.length})
          </button>
          <button
            onClick={() => setActiveTab("treasury")}
            className={`py-2.5 px-4 text-xs font-bold rounded-t-lg transition border-b-2 ${
              activeTab === "treasury"
                ? "border-amber-600 text-amber-700 bg-amber-50/40"
                : "border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            }`}
          >
            Trésorerie &amp; Canaux
          </button>
        </nav>
      </div>

      {/* ─── ONGLET 1: TABLEAU DE CAISSE ───────────────────────────────────── */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Grille des Cartes KPI */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                Fond de Caisse (Ouverture)
              </span>
              <p className="text-2xl font-black font-mono text-slate-900 mt-2">
                {formatDA(metrics.physicalOpening)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {activeSession ? "Session active en cours" : "Dernier fond enregistré"}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                  Encaissements Espèces
                </span>
                <ArrowDownRight className="h-4 w-4 text-emerald-600" />
              </div>
              <p className="text-2xl font-black font-mono text-emerald-700 mt-2">
                +{formatDA(metrics.physicalInflows)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Recettes physiques en espèces</p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">
                  Décaissements Espèces
                </span>
                <ArrowUpRight className="h-4 w-4 text-rose-600" />
              </div>
              <p className="text-2xl font-black font-mono text-rose-700 mt-2">
                -{formatDA(metrics.physicalOutflows)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">Achats fournisseurs &amp; frais en espèces</p>
            </div>

            <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-300 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-amber-900 uppercase tracking-wider block">
                  Solde Théorique Caisse
                </span>
                <Wallet className="h-4 w-4 text-amber-700" />
              </div>
              <p className="text-2xl font-black font-mono text-amber-950 mt-2">
                {formatDA(metrics.physicalTheoretical)}
              </p>
              <p className="text-[11px] text-amber-800 mt-1 font-medium">
                Solde attendu dans le tiroir physique
              </p>
            </div>
          </div>

          {/* Synthèse comparative des canaux financiers */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-slate-500" />
              Décomposition des Flux par Canal de Paiement
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {Object.values(metrics.channels).map((ch) => (
                <div
                  key={ch.method}
                  className={`p-4 rounded-lg border ${
                    ch.method === "cash"
                      ? "bg-amber-50/40 border-amber-200"
                      : "bg-slate-50 border-slate-200"
                  }`}
                >
                  <span className="text-xs font-bold text-slate-900 block">{ch.label}</span>
                  <div className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between text-emerald-700">
                      <span>Entrées :</span>
                      <span className="font-mono font-semibold">+{formatDA(ch.inflows)}</span>
                    </div>
                    <div className="flex justify-between text-rose-700">
                      <span>Sorties :</span>
                      <span className="font-mono font-semibold">-{formatDA(ch.outflows)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200">
                      <span>Solde Net :</span>
                      <span className="font-mono">{formatDA(ch.net)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-700">Règle de séparation stricte :</span> Les encaissements par virement, chèque ou CIB n&apos;augmentent pas le tiroir-caisse physique.
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-600 block">Total Trésorerie Globale (Tous canaux) :</span>
                <span className="font-mono font-black text-lg text-slate-900">
                  {formatDA(metrics.globalNet)}
                </span>
              </div>
            </div>
          </div>

          {/* 5 Derniers mouvements du journal */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900">Derniers Mouvements du Journal</h3>
              <button
                onClick={() => setActiveTab("ledger")}
                className="text-xs font-bold text-amber-700 hover:text-amber-800"
              >
                Voir tout le grand livre &rarr;
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {ledger.slice(0, 5).map((item) => (
                <div key={item.id} className="p-3.5 flex items-center justify-between text-xs hover:bg-slate-50">
                  <div className="flex items-center gap-3">
                    <span
                      className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs ${
                        item.type === "encaissement"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {item.type === "encaissement" ? "+" : "-"}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{item.description}</span>
                        <span className="font-mono text-[11px] text-slate-400">({item.reference})</span>
                      </div>
                      <span className="text-slate-500 text-[11px]">
                        {formatDateTime(item.date)} &bull; {item.category} &bull; {formatMethodLabel(item.method)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`font-mono font-bold text-sm ${
                        item.type === "encaissement" ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {item.type === "encaissement" ? `+${formatDA(item.amount)}` : `-${formatDA(item.amount)}`}
                    </span>
                    {item.affectsCash && (
                      <span className="block text-xs text-amber-800 font-semibold uppercase">
                        Caisse physique
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── ONGLET 2: GRAND LIVRE DES MOUVEMENTS ──────────────────────────── */}
      {activeTab === "ledger" && (
        <div className="space-y-4">
          {/* Barre de filtrage & Recherche */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Réf, Tiers, Motif..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <select
                  value={methodFilter}
                  onChange={(e) => setMethodFilter(e.target.value)}
                  className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">Tous les modes de règlement</option>
                  <option value="cash">Espèces (Tiroir-caisse)</option>
                  <option value="transfer">Virement bancaire</option>
                  <option value="check">Chèque bancaire</option>
                  <option value="cib">Carte CIB / Edahabia</option>
                </select>
              </div>

              <div>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">Tous les flux (Entrées &amp; Sorties)</option>
                  <option value="encaissement">Encaissements uniquement</option>
                  <option value="decaissement">Décaissements uniquement</option>
                </select>
              </div>

              <div>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  title="Date début"
                />
              </div>

              <div>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  title="Date fin"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pt-2 border-t border-slate-100 gap-2">
              <span className="text-xs text-slate-500">
                {filteredLedger.length} mouvement(s) trouvé(s) &bull; Entrées :{" "}
                <span className="font-mono font-bold text-emerald-700">+{formatDA(totalFilteredInflows)}</span> &bull; Sorties :{" "}
                <span className="font-mono font-bold text-rose-700">-{formatDA(totalFilteredOutflows)}</span>
              </span>

              <div className="flex items-center gap-2">
                {(searchQuery || methodFilter !== "all" || typeFilter !== "all" || startDate || endDate) && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setMethodFilter("all");
                      setTypeFilter("all");
                      setStartDate("");
                      setEndDate("");
                    }}
                    className="text-xs text-slate-500 hover:text-slate-800 underline"
                  >
                    Réinitialiser filtres
                  </button>
                )}
                <button
                  onClick={handleExportCSV}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" />
                  Exporter Excel (CSV)
                </button>
              </div>
            </div>
          </div>

          {/* Tableau Grand Livre */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">Date &amp; Heure</th>
                    <th className="py-2.5 px-3">Réf. Pièce</th>
                    <th className="py-2.5 px-3">Nature / Catégorie</th>
                    <th className="py-2.5 px-3">Description &amp; Document</th>
                    <th className="py-2.5 px-3">Tiers / Bénéficiaire</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3 text-right">Montant (DA)</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLedger.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                        Aucun mouvement financier ne correspond aux critères sélectionnés.
                      </td>
                    </tr>
                  ) : (
                    filteredLedger.map((item) => {
                      const isIncome = item.type === "encaissement";
                      return (
                        <tr key={item.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-2.5 px-3 font-mono text-slate-600">
                            {formatDateTime(item.date)}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {item.reference}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-bold uppercase mr-1.5 ${
                                isIncome ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {isIncome ? "Entrée" : "Sortie"}
                            </span>
                            <span className="text-slate-700 font-medium">{item.category}</span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-900 block">{item.description}</span>
                            {item.docReference && (
                              <span className="text-slate-500 font-mono text-xs block">
                                Réf doc: {item.docReference}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-medium">
                            {item.partyName}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`font-medium ${
                                item.affectsCash ? "text-amber-800 font-semibold" : "text-blue-700"
                              }`}
                            >
                              {formatMethodLabel(item.method)}
                            </span>
                            {item.affectsCash && (
                              <span className="block text-[9px] text-amber-700 uppercase font-bold">
                                Tiroir physique
                              </span>
                            )}
                          </td>
                          <td
                            className={`py-2.5 px-3 text-right font-mono font-bold text-sm ${
                              isIncome ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {isIncome ? `+${formatDA(item.amount)}` : `-${formatDA(item.amount)}`}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {(item.source === "expense" || item.source === "income") && (
                              <button
                                onClick={() =>
                                  setPrintingExpense({
                                    reference: item.reference,
                                    type: item.type === "encaissement" ? "income" : "expense",
                                    category: item.category,
                                    description: item.description,
                                    amount: item.amount,
                                    method: item.method,
                                    beneficiary: item.partyName,
                                    receiptNumber: item.docReference,
                                    notes: item.notes,
                                    date: item.date,
                                  })
                                }
                                title="Imprimer le bon de pièce de caisse"
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition"
                              >
                                <Printer className="h-3.5 w-3.5" />
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
          </div>
        </div>
      )}

      {/* ─── ONGLET 3: DÉPENSES & CHARGES D'EXPLOITATION ────────────────────── */}
      {activeTab === "expenses" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Charges &amp; Dépenses Justifiées</h2>
              <p className="text-xs text-slate-500">
                Frais d&apos;exploitation (Transport, Loyer, Électricité, Maintenance, Salaires) imputés à la caisse.
              </p>
            </div>
            <button
              onClick={() => {
                setExpenseType("expense");
                setIsExpenseModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition"
            >
              <Plus className="h-4 w-4" />
              Nouvelle Dépense
            </button>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Réf.</th>
                    <th className="py-2.5 px-3">Catégorie</th>
                    <th className="py-2.5 px-3">Motif / Description</th>
                    <th className="py-2.5 px-3">Bénéficiaire</th>
                    <th className="py-2.5 px-3">Mode</th>
                    <th className="py-2.5 px-3 text-right">Montant</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ledger.filter((i) => i.source === "expense" || i.source === "income").length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 italic">
                        Aucune dépense ni mouvement manuel enregistré pour le moment.
                      </td>
                    </tr>
                  ) : (
                    ledger
                      .filter((i) => i.source === "expense" || i.source === "income")
                      .map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono text-slate-600">{formatDate(item.date)}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.reference}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">{item.category}</td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-900 block">{item.description}</span>
                            {item.docReference && (
                              <span className="text-slate-400 text-[11px] font-mono">
                                Justif: {item.docReference}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{item.partyName}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-700">{formatMethodLabel(item.method)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-sm text-slate-900">
                            {formatDA(item.amount)}
                          </td>
                          <td className="py-2.5 px-3 text-center space-x-1">
                            <button
                              onClick={() =>
                                setPrintingExpense({
                                  reference: item.reference,
                                  type: item.type === "encaissement" ? "income" : "expense",
                                  category: item.category,
                                  description: item.description,
                                  amount: item.amount,
                                  method: item.method,
                                  beneficiary: item.partyName,
                                  receiptNumber: item.docReference,
                                  notes: item.notes,
                                  date: item.date,
                                })
                              }
                              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded transition"
                              title="Imprimer le bon"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(item.rawId)}
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded transition"
                              title="Supprimer la dépense"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── ONGLET 4: HISTORIQUE DES CLÔTURES DE CAISSE ────────────────────── */}
      {activeTab === "sessions" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex justify-between items-center">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Procès-Verbaux de Clôture &amp; Pointage</h2>
              <p className="text-xs text-slate-500">
                Historique immuable des ouvertures, pointages physiques et réconciliations de tiroir-caisse.
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-2.5 px-3">Réf. Session</th>
                    <th className="py-2.5 px-3">Ouverture</th>
                    <th className="py-2.5 px-3">Clôture</th>
                    <th className="py-2.5 px-3">Statut</th>
                    <th className="py-2.5 px-3 text-right">Fond Initial</th>
                    <th className="py-2.5 px-3 text-right">Encaissements</th>
                    <th className="py-2.5 px-3 text-right">Décaissements</th>
                    <th className="py-2.5 px-3 text-right">Théorique</th>
                    <th className="py-2.5 px-3 text-right">Compté Réel</th>
                    <th className="py-2.5 px-3 text-right">Écart</th>
                    <th className="py-2.5 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sessions.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-slate-400 italic">
                        Aucune session de caisse n&apos;a encore été enregistrée.
                      </td>
                    </tr>
                  ) : (
                    sessions.map((s) => {
                      const diff = s.difference ?? 0;
                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{s.reference}</td>
                          <td className="py-2.5 px-3 text-slate-600">{formatDateTime(s.openedAt)}</td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {s.closedAt ? formatDateTime(s.closedAt) : "—"}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2.5 py-1 rounded text-xs font-bold uppercase ${
                                s.status === "open"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-800"
                              }`}
                            >
                              {s.status === "open" ? "Active" : "Clôturée"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono">{formatDA(s.openingAmount)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-700">+{formatDA(s.totalCashIn)}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-rose-700">-{formatDA(s.totalCashOut)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {formatDA(s.theoreticalAmount ?? s.openingAmount + s.totalCashIn - s.totalCashOut)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {s.closingAmount !== null && s.closingAmount !== undefined
                              ? formatDA(s.closingAmount)
                              : "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold">
                            {s.status === "closed" ? (
                              diff === 0 ? (
                                <span className="text-emerald-700">0 DA (Exact)</span>
                              ) : diff > 0 ? (
                                <span className="text-blue-700">+{formatDA(diff)}</span>
                              ) : (
                                <span className="text-rose-700">{formatDA(diff)}</span>
                              )
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {s.status === "closed" && (
                              <button
                                onClick={() => setPrintingClosingSession(s)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition"
                              >
                                <Printer className="h-3 w-3 text-slate-500" />
                                Fiche (A4)
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
          </div>
        </div>
      )}

      {/* ─── ONGLET 5: TRÉSORERIE & RAPPORTS COMPLETS ───────────────────────── */}
      {activeTab === "treasury" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-amber-600" />
                Caisse Physique vs Trésorerie Dématérialisée
              </h3>
              <div className="space-y-4 text-xs">
                <div className="p-3 bg-amber-50/60 border border-amber-200 rounded-lg">
                  <span className="font-bold text-amber-950 block">Liquidités Physiques (Espèces)</span>
                  <div className="mt-2 flex justify-between items-center text-sm font-mono font-bold">
                    <span className="text-slate-600">Solde théorique tiroir :</span>
                    <span className="text-amber-950 text-base">{formatDA(metrics.physicalTheoretical)}</span>
                  </div>
                </div>

                <div className="p-3 bg-blue-50/60 border border-blue-200 rounded-lg">
                  <span className="font-bold text-blue-950 block">Canaux Bancaires &amp; Électroniques</span>
                  <div className="mt-2 flex justify-between items-center text-sm font-mono font-bold">
                    <span className="text-slate-600">Solde net non-espèces :</span>
                    <span className="text-blue-950 text-base">
                      {formatDA(metrics.globalNet - (metrics.channels.cash.net))}
                    </span>
                  </div>
                </div>

                <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg">
                  <span className="font-bold text-slate-900 block">Trésorerie Nette Totale (Entreprise)</span>
                  <div className="mt-2 flex justify-between items-center text-base font-mono font-black text-slate-900">
                    <span>TOTAL :</span>
                    <span>{formatDA(metrics.globalNet)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-slate-500" />
                Répartition des Recettes par Mode de Règlement
              </h3>
              <div className="space-y-3 text-xs">
                {Object.values(metrics.channels).map((ch) => {
                  const percent = metrics.globalInflows > 0 ? (ch.inflows / metrics.globalInflows) * 100 : 0;
                  return (
                    <div key={ch.method} className="space-y-1">
                      <div className="flex justify-between font-medium">
                        <span className="text-slate-700">{ch.label}</span>
                        <span className="font-mono font-semibold text-slate-900">
                          {formatDA(ch.inflows)} ({percent.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full ${
                            ch.method === "cash"
                              ? "bg-amber-500"
                              : ch.method === "cib"
                              ? "bg-emerald-500"
                              : ch.method === "check"
                              ? "bg-purple-500"
                              : "bg-blue-500"
                          }`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL OUVERTURE DE SESSION ─────────────────────────────────────── */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Unlock className="h-5 w-5 text-emerald-600" />
                Ouvrir une Session de Caisse
              </h3>
              <button
                onClick={() => setIsOpeningModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleOpenSession} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Fond de Caisse Initial (DA) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  placeholder="Ex: 20000"
                  value={openingAmountInput}
                  onChange={(e) => setOpeningAmountInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Montant physique disponible dans le tiroir au démarrage du service.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Note d&apos;Ouverture (Optionnelle)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Fond recompté par Moncef..."
                  value={openingNotesInput}
                  onChange={(e) => setOpeningNotesInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsOpeningModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isPending ? "Ouverture en cours..." : "Confirmer l'Ouverture"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL CLÔTURE DE SESSION ───────────────────────────────────────── */}
      {isClosingModalOpen && activeSession && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Lock className="h-5 w-5 text-rose-600" />
                Clôture de Caisse &bull; {activeSession.reference}
              </h3>
              <button
                onClick={() => setIsClosingModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCloseSession} className="mt-4 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-600">Fond de caisse initial :</span>
                  <span className="font-mono font-bold text-slate-900">{formatDA(activeSession.openingAmount)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Encaissements espèces réalisés :</span>
                  <span className="font-mono font-bold">+{formatDA(activeSession.currentCashIn)}</span>
                </div>
                <div className="flex justify-between text-rose-700">
                  <span>Décaissements espèces réalisés :</span>
                  <span className="font-mono font-bold">-{formatDA(activeSession.currentCashOut)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-slate-900 text-sm">
                  <span>Solde Théorique Attendu :</span>
                  <span className="font-mono text-amber-900">{formatDA(activeSession.currentTheoreticalCash)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Montant Réellement Compté dans le Tiroir (DA) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  placeholder="Comptez les billets et pièces..."
                  value={closingAmountInput}
                  onChange={(e) => setClosingAmountInput(e.target.value)}
                  className="w-full px-3 py-2 text-base font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {/* Écart en temps réel */}
              {closingAmountInput && !isNaN(parseFloat(closingAmountInput)) && (
                (() => {
                  const counted = parseFloat(closingAmountInput);
                  const diff = counted - activeSession.currentTheoreticalCash;
                  return (
                    <div
                      className={`p-3 rounded-lg text-xs font-semibold flex justify-between items-center ${
                        diff === 0
                          ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                          : diff > 0
                          ? "bg-blue-50 text-blue-900 border border-blue-200"
                          : "bg-rose-50 text-rose-900 border border-rose-200"
                      }`}
                    >
                      <span>
                        {diff === 0
                          ? "Caisse parfaitement équilibrée"
                          : diff > 0
                          ? "Excédent de caisse :"
                          : "Déficit / Manquant de caisse :"}
                      </span>
                      <span className="font-mono font-bold text-sm">
                        {diff > 0 ? `+${formatDA(diff)}` : formatDA(diff)}
                      </span>
                    </div>
                  );
                })()
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Justification / Observations de Clôture
                </label>
                <textarea
                  rows={2}
                  placeholder="Commentaire ou explication de l'écart..."
                  value={closingNotesInput}
                  onChange={(e) => setClosingNotesInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsClosingModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isPending ? "Clôture en cours..." : "Valider la Clôture Définitive"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL NOUVELLE DÉPENSE / ENCAISSEMENT ───────────────────────────── */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-amber-600" />
                {expenseType === "expense" ? "Enregistrer une Dépense" : "Enregistrer un Encaissement Exceptionnel"}
              </h3>
              <button
                onClick={() => setIsExpenseModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="mt-4 space-y-3.5">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setExpenseType("expense");
                    setExpenseCategory("transport");
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${
                    expenseType === "expense"
                      ? "bg-rose-100 text-rose-800 border-rose-300 shadow-xs"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  Dépense (Décaissement)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExpenseType("income");
                    setExpenseCategory("capital");
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${
                    expenseType === "income"
                      ? "bg-emerald-100 text-emerald-800 border-emerald-300 shadow-xs"
                      : "bg-slate-50 text-slate-600 border-slate-200"
                  }`}
                >
                  Recette Diverse (Encaissement)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Catégorie *
                  </label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                    className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {expenseType === "expense" ? (
                      <>
                        <option value="transport">Transport &amp; Livraison</option>
                        <option value="utilities">Électricité, Gaz &amp; Eau</option>
                        <option value="rent">Loyer &amp; Charges</option>
                        <option value="maintenance">Entretien &amp; Réparation</option>
                        <option value="supplies">Fournitures de bureau</option>
                        <option value="salary">Salaires &amp; Avances</option>
                        <option value="other">Autre charge d&apos;exploitation</option>
                      </>
                    ) : (
                      <>
                        <option value="capital">Apport personnel exploitant</option>
                        <option value="refund">Remboursement reçu</option>
                        <option value="misc_income">Recette diverse</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Mode de Règlement *
                  </label>
                  <select
                    value={expenseMethod}
                    onChange={(e) => setExpenseMethod(e.target.value)}
                    className="w-full py-2 px-3 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="cash">Espèces (Tiroir-caisse)</option>
                    <option value="transfer">Virement bancaire</option>
                    <option value="check">Chèque bancaire</option>
                    <option value="cib">Carte CIB / Edahabia</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Montant (DA) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="Ex: 5000"
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Motif &amp; Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Carburant camionnette livraison..."
                  value={expenseDescription}
                  onChange={(e) => setExpenseDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Bénéficiaire / Tiers
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Chauffeur Samir..."
                    value={expenseBeneficiary}
                    onChange={(e) => setExpenseBeneficiary(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    N° Pièce Justificative
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Facture Naftal N°..."
                    value={expenseReceiptNumber}
                    onChange={(e) => setExpenseReceiptNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Notes Complémentaires (Optionnel)
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes de contrôle..."
                  value={expenseNotes}
                  onChange={(e) => setExpenseNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm disabled:opacity-50"
                >
                  {isPending ? "Enregistrement..." : "Enregistrer la Pièce"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODALS D'IMPRESSION A4 DOCUMENTS CAISSE ────────────────────────── */}
      {printingDailyJournal && (
        <PrintableDailyCashJournal
          sessionRef={printingDailyJournal.sessionRef}
          date={printingDailyJournal.date}
          openingAmount={printingDailyJournal.openingAmount}
          items={printingDailyJournal.items}
          settings={initialData.settings}
          onClose={() => setPrintingDailyJournal(null)}
        />
      )}

      {printingClosingSession && (
        <PrintableCashClosingReport
          session={printingClosingSession}
          settings={initialData.settings}
          onClose={() => setPrintingClosingSession(null)}
        />
      )}

      {printingExpense && (
        <PrintableExpenseVoucher
          expense={printingExpense}
          settings={initialData.settings}
          onClose={() => setPrintingExpense(null)}
        />
      )}
    </div>
  );
}
