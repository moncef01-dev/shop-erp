"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PrintPortal } from "@/components/common/PrintPortal";
import {
  BookOpen,
  Calendar,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Printer,
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  ShieldCheck,
  Clock,
  Filter,
  Receipt,
  ShoppingBag,
  Truck,
  Coins,
  ArrowLeftRight,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  X,
} from "lucide-react";
import type { DailyCashJournalData, DailyCashJournalItem } from "../actions";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import { formatDA, formatDate, formatDateTime } from "@/components/cash/PrintableCashDocuments";

interface DailyJournalClientProps {
  initialData: DailyCashJournalData;
}

export function DailyJournalClient({ initialData }: DailyJournalClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "inflow" | "outflow" | "transfer">("all");
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const {
    selectedDate,
    formattedDate,
    isToday,
    caisseAccount,
    session,
    openingBalance,
    totalInflows,
    totalOutflows,
    operatingInflows,
    operatingOutflows,
    transfersIn,
    transfersOut,
    netTransfers,
    netOperatingFlow,
    theoreticalFinalBalance,
    items,
    availableDates,
  } = initialData;

  // Navigation par date
  const handleDateChange = (newDate: string) => {
    if (!newDate || newDate === selectedDate) return;
    startTransition(() => {
      router.push(`/cash/journal?date=${newDate}`);
    });
  };

  const handleGoToToday = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;
    handleDateChange(todayStr);
  };

  const handleStepDay = (delta: number) => {
    const cur = new Date(`${selectedDate}T12:00:00.000Z`);
    cur.setDate(cur.getDate() + delta);
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    handleDateChange(`${y}-${m}-${d}`);
  };

  // Filtrage local des opérations du tableau
  const filteredItems = items.filter((item) => {
    // Filtre type (tous, entrées d'exploitation, charges/dépenses, transferts de trésorerie)
    if (typeFilter === "inflow" && (item.inflow <= 0 || item.source === "transfer")) return false;
    if (typeFilter === "outflow" && (item.outflow <= 0 || item.source === "transfer")) return false;
    if (typeFilter === "transfer" && item.source !== "transfer") return false;

    // Filtre recherche textuelle
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchRef = item.reference.toLowerCase().includes(q);
      const matchDesc = item.description.toLowerCase().includes(q);
      const matchParty = item.partyName.toLowerCase().includes(q);
      const matchDoc = item.docReference ? item.docReference.toLowerCase().includes(q) : false;
      const matchOp = item.operationType.toLowerCase().includes(q);
      return matchRef || matchDesc || matchParty || matchDoc || matchOp;
    }

    return true;
  });

  const filteredInflows = filteredItems
    .filter((i) => i.source !== "transfer")
    .reduce((s, i) => s + i.inflow, 0);
  const filteredOutflows = filteredItems
    .filter((i) => i.source !== "transfer")
    .reduce((s, i) => s + i.outflow, 0);
  const filteredTransfers = filteredItems
    .filter((i) => i.source === "transfer")
    .reduce((s, i) => s + i.outflow, 0);

  // Fonction pour icône d'opération
  const getOpIcon = (source: DailyCashJournalItem["source"], opType: string) => {
    if (source === "sale") return <ShoppingBag className="h-3.5 w-3.5 text-emerald-600" />;
    if (source === "advance") return <Coins className="h-3.5 w-3.5 text-teal-600" />;
    if (source === "purchase") return <Truck className="h-3.5 w-3.5 text-rose-600" />;
    if (source === "transfer") return <ArrowLeftRight className="h-3.5 w-3.5 text-indigo-600" />;
    if (source === "income") return <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />;
    if (opType.includes("Salaire") || opType.includes("Exploitant"))
      return <UserCheck className="h-3.5 w-3.5 text-amber-600" />;
    return <Receipt className="h-3.5 w-3.5 text-slate-600" />;
  };

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Navigation commune trésorerie */}
      <TreasuryNavigationTabs />

      {/* 2. Header & Action buttons */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-amber-100 text-amber-800 rounded-xl">
              <BookOpen className="h-6 w-6 text-amber-700" />
            </span>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                  Journal Journalier de Caisse
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                  {caisseAccount.name} ({caisseAccount.code})
                </span>
                {session ? (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 border ${
                      session.status === "open"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-700 border-slate-300"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        session.status === "open" ? "bg-emerald-500 animate-pulse" : "bg-slate-400"
                      }`}
                    />
                    Session {session.reference} ({session.status === "open" ? "En cours" : "Clôturée"})
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    Hors session formalisée
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1 capitalize">
                {formattedDate} — Journal chronologique des flux réels de caisse physique
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
          >
            <Printer className="h-4 w-4 text-slate-600" />
            <span>Imprimer le Journal</span>
          </button>
          <Link
            href="/cash"
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <span>Situation globale</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* 3. Barre de sélection de la Date */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
            <button
              onClick={() => handleStepDay(-1)}
              title="Jour précédent"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 px-2.5 py-1">
              <Calendar className="h-4 w-4 text-amber-500 shrink-0" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => handleDateChange(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-transparent border-0 p-0 focus:outline-hidden focus:ring-0 cursor-pointer"
              />
            </div>
            <button
              onClick={() => handleStepDay(1)}
              title="Jour suivant"
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-md transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <button
            onClick={handleGoToToday}
            disabled={isToday}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors border shadow-xs ${
              isToday
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
            <span>Aujourd&apos;hui</span>
          </button>

          {isPending && (
            <span className="text-xs text-amber-600 animate-pulse font-medium flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
              Actualisation...
            </span>
          )}
        </div>

        {/* Pilules d'accès rapide aux dates ayant eu des opérations */}
        {availableDates.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-full sm:max-w-md">
            <span className="text-[11px] text-slate-400 font-medium shrink-0">Historique :</span>
            {availableDates.slice(0, 5).map((d) => (
              <button
                key={d}
                onClick={() => handleDateChange(d)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors shrink-0 ${
                  d === selectedDate
                    ? "bg-amber-500 text-slate-900 font-bold shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {d.split("-").reverse().slice(0, 2).join("/")}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. Cartes Récapitulatives (Solde initial, Entrées, Sorties/Charges, Transferts, Solde final) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Solde Initial */}
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-1.5">
            <span>Solde Initial</span>
            <Wallet className="h-4 w-4 text-slate-500" />
          </div>
          <div className="text-xl font-black text-slate-900 font-mono">
            {formatDA(openingBalance)}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {session
              ? `Fond d'ouverture (${formatDate(session.openedAt)})`
              : "Solde au début de journée"}
          </p>
        </div>

        {/* Entrées d'exploitation */}
        <div className="bg-white rounded-xl p-4 border border-emerald-200 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/40">
          <div className="flex items-center justify-between text-emerald-800 text-xs font-semibold uppercase tracking-wider mb-1.5">
            <span>Entrées Exploitation</span>
            <span className="p-1 bg-emerald-100 rounded-md">
              <ArrowDownLeft className="h-4 w-4 text-emerald-700" />
            </span>
          </div>
          <div className="text-xl font-black text-emerald-700 font-mono">
            +{formatDA(operatingInflows)}
          </div>
          <p className="text-[11px] text-emerald-600 mt-1 font-medium">
            {items.filter((i) => i.inflow > 0 && i.source !== "transfer").length} encaissement(s) ventes & recettes
          </p>
        </div>

        {/* Sorties d'exploitation (Charges & Dépenses) */}
        <div className="bg-white rounded-xl p-4 border border-rose-200 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-rose-50/40">
          <div className="flex items-center justify-between text-rose-800 text-xs font-semibold uppercase tracking-wider mb-1.5">
            <span>Sorties (Charges)</span>
            <span className="p-1 bg-rose-100 rounded-md">
              <ArrowUpRight className="h-4 w-4 text-rose-700" />
            </span>
          </div>
          <div className="text-xl font-black text-rose-700 font-mono">
            -{formatDA(operatingOutflows)}
          </div>
          <p className="text-[11px] text-rose-600 mt-1 font-medium">
            {items.filter((i) => i.outflow > 0 && i.source !== "transfer").length} charge(s) & dépenses décaissées
          </p>
        </div>

        {/* Transferts de Trésorerie (Hors charges) */}
        <div className="bg-white rounded-xl p-4 border border-purple-200 shadow-xs relative overflow-hidden bg-gradient-to-br from-white to-purple-50/40">
          <div className="flex items-center justify-between text-purple-800 text-xs font-semibold uppercase tracking-wider mb-1.5">
            <span>Transferts Internes</span>
            <span className="p-1 bg-purple-100 rounded-md">
              <ArrowLeftRight className="h-4 w-4 text-purple-700" />
            </span>
          </div>
          <div className="text-xl font-black text-purple-700 font-mono">
            {transfersOut > 0
              ? `-${formatDA(transfersOut)}`
              : transfersIn > 0
              ? `+${formatDA(transfersIn)}`
              : formatDA(0)}
          </div>
          <p className="text-[11px] text-purple-600 mt-1 font-medium">
            {items.filter((i) => i.source === "transfer").length} virement(s) (vers coffre/banque)
          </p>
        </div>

        {/* Solde Final Théorique */}
        <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
            <span>Solde Final Caisse</span>
            <ShieldCheck className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-xl font-black text-amber-400 font-mono">
            {formatDA(theoreticalFinalBalance)}
          </div>
          <div className="flex items-center justify-between mt-1 text-[11px] text-slate-400">
            <span>Espèces physiques</span>
            <span className="font-semibold text-slate-300 font-mono">
              Net : {netOperatingFlow >= 0 ? "+" : ""}
              {formatDA(netOperatingFlow)}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Filtres et Recherche au sein des opérations du jour */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Recherche */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par référence, tiers, motif, document..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-white"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Sélecteur de type d'opérations */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-semibold self-start sm:self-auto flex-wrap">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                typeFilter === "all"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Toutes ({items.length})
            </button>
            <button
              onClick={() => setTypeFilter("inflow")}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                typeFilter === "inflow"
                  ? "bg-white text-emerald-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-emerald-700"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Entrées ({items.filter((i) => i.inflow > 0 && i.source !== "transfer").length})
            </button>
            <button
              onClick={() => setTypeFilter("outflow")}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                typeFilter === "outflow"
                  ? "bg-white text-rose-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-rose-700"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
              Sorties (Charges) ({items.filter((i) => i.outflow > 0 && i.source !== "transfer").length})
            </button>
            <button
              onClick={() => setTypeFilter("transfer")}
              className={`px-3 py-1.5 rounded-md transition-all flex items-center gap-1 ${
                typeFilter === "transfer"
                  ? "bg-white text-purple-700 shadow-xs font-bold"
                  : "text-slate-600 hover:text-purple-700"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
              Transferts ({items.filter((i) => i.source === "transfer").length})
            </button>
          </div>
        </div>

        {/* Info barre filtre */}
        {(searchQuery || typeFilter !== "all") && (
          <div className="text-xs text-slate-500 flex items-center justify-between border-t border-slate-100 pt-2 flex-wrap gap-2">
            <span>
              Résultats affichés : <strong>{filteredItems.length}</strong> sur {items.length} opération(s).
            </span>
            <div className="flex items-center gap-4 text-xs font-mono font-semibold flex-wrap">
              <span className="text-emerald-700">Entrées : +{formatDA(filteredInflows)}</span>
              <span className="text-rose-700">Sorties (Charges) : -{formatDA(filteredOutflows)}</span>
              {filteredTransfers > 0 && (
                <span className="text-purple-700">Transferts : -{formatDA(filteredTransfers)}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 6. Tableau Chronologique des Opérations */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredItems.length === 0 ? (
          <div className="py-16 px-4 text-center">
            <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
              <Calendar className="h-6 w-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              {items.length === 0
                ? "Aucune opération de caisse enregistrée pour cette journée"
                : "Aucune opération ne correspond à vos filtres"}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {items.length === 0
                ? `Aucun encaissement ni décaissement physique en espèces n'a été enregistré le ${formattedDate}. Le solde de caisse demeure inchangé à ${formatDA(
                    openingBalance
                  )}.`
                : "Essayez de modifier votre terme de recherche ou d'afficher toutes les opérations."}
            </p>
            {items.length === 0 && !isToday && (
              <button
                onClick={handleGoToToday}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-amber-400 hover:bg-amber-500 rounded-lg shadow-xs transition-colors"
              >
                <RotateCcw className="h-4 w-4" />
                Retourner à aujourd&apos;hui
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-36">Date / Heure</th>
                  <th className="py-3 px-3 w-36">Référence</th>
                  <th className="py-3 px-3 w-40">Opération</th>
                  <th className="py-3 px-4 min-w-[220px]">Description & Tiers</th>
                  <th className="py-3 px-4 text-right w-36">Entrée (DA)</th>
                  <th className="py-3 px-4 text-right w-36">Sortie (DA)</th>
                  <th className="py-3 px-4 text-right w-44 bg-slate-100/50">
                    Solde après opération (DA)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* Ligne d'ouverture de caisse */}
                <tr className="bg-slate-50/40 text-slate-500 italic">
                  <td className="py-2.5 px-4 font-mono text-[11px]">Début journée</td>
                  <td className="py-2.5 px-3 font-mono text-[11px]">—</td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200/80 text-slate-700">
                      <Wallet className="h-3 w-3" />
                      Solde initial
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-[11px]">
                    {session
                      ? `Fond de caisse session ${session.reference}`
                      : "Report du solde précédent"}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono">—</td>
                  <td className="py-2.5 px-4 text-right font-mono">—</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800 bg-slate-100/30">
                    {formatDA(openingBalance)}
                  </td>
                </tr>

                {filteredItems.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-amber-50/30 transition-colors group"
                  >
                    {/* Date / Heure */}
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono text-[11px] flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{item.dateFormatted}</span>
                    </td>

                    {/* Référence */}
                    <td className="py-3 px-3 whitespace-nowrap font-mono font-bold text-slate-900">
                      <span>{item.reference}</span>
                      {item.docReference && item.docReference !== item.reference && (
                        <span className="block text-[10px] font-normal text-slate-400">
                          {item.docReference}
                        </span>
                      )}
                    </td>

                    {/* Opération Type */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold border ${item.operationBadgeClass}`}
                      >
                        {getOpIcon(item.source, item.operationType)}
                        <span>{item.operationType}</span>
                      </span>
                    </td>

                    {/* Description & Tiers */}
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 leading-snug">
                        {item.description}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Tiers : <span className="text-slate-700 font-medium">{item.partyName}</span>
                      </div>
                    </td>

                    {/* Entrée */}
                    <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                      {item.inflow > 0 ? (
                        item.source === "transfer" ? (
                          <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 inline-flex items-center gap-1" title="Alimentation caisse (Virement interne hors charges)">
                            <ArrowLeftRight className="h-3 w-3" />
                            +{formatDA(item.inflow)}
                          </span>
                        ) : (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100">
                            +{formatDA(item.inflow)}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Sortie */}
                    <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                      {item.outflow > 0 ? (
                        item.source === "transfer" ? (
                          <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200 inline-flex items-center gap-1" title="Virement interne vers coffre/banque (hors charges)">
                            <ArrowLeftRight className="h-3 w-3" />
                            -{formatDA(item.outflow)}
                          </span>
                        ) : (
                          <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                            -{formatDA(item.outflow)}
                          </span>
                        )
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Solde après opération (Running Balance) */}
                    <td className="py-3 px-4 text-right font-mono font-black text-slate-900 bg-slate-100/50 whitespace-nowrap text-xs">
                      {formatDA(item.runningBalance)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {/* Ligne Totaux du tableau */}
                <tr className="bg-slate-900 text-white font-semibold text-xs border-t-2 border-slate-950">
                  <td colSpan={4} className="py-3.5 px-4 font-bold text-slate-300 uppercase tracking-wider">
                    Total journée ({filteredItems.length} opérations affichées)
                    {filteredTransfers > 0 && (
                      <span className="block text-[11px] font-normal text-purple-300">
                        Dont transferts internes émis : -{formatDA(filteredTransfers)} (virements hors charges)
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-400 whitespace-nowrap">
                    +{formatDA(filteredInflows)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-400 whitespace-nowrap">
                    -{formatDA(filteredOutflows)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-black text-amber-400 whitespace-nowrap bg-slate-950 text-sm">
                    {formatDA(theoreticalFinalBalance)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* 7. Modal d'impression A4 format comptable */}
      {isPrintModalOpen && (
        <PrintPortal>
          <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center print:static print:inset-auto print:block print:p-0 print:bg-white print:w-full print:overflow-visible">
          <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl p-8 print:p-0 print:shadow-none print:w-full print:max-w-none print:rounded-none">
            {/* Barre de contrôle modal (masquée à l'impression) */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 print:hidden mb-6">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Aperçu avant impression — Journal de Caisse
                </h3>
                <p className="text-xs text-slate-500">
                  Document officiel A4 de caisse journalière pour pointage physique et archivage comptable.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors"
                >
                  <Printer className="h-4 w-4 text-amber-400" />
                  Imprimer
                </button>
                <button
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Contenu imprimable A4 */}
            <div className="space-y-6 print:text-black">
              {/* Header Société & Journal */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 print:border-black pb-4">
                <div>
                  <h2 className="text-xl font-black text-slate-900 print:text-black tracking-tight uppercase">
                    JOURNAL DE CAISSE JOURNALIÈRE
                  </h2>
                  <p className="text-xs text-slate-600 print:text-black mt-1 capitalize font-bold">
                    Date des opérations : {formattedDate}
                  </p>
                  <p className="text-xs text-slate-500 print:text-black font-semibold">
                    Compte : {caisseAccount.name} ({caisseAccount.code})
                  </p>
                </div>
                <div className="text-right text-xs">
                  <div className="font-mono text-slate-600 print:text-black font-medium">
                    Édité le {new Date().toLocaleDateString("fr-DZ")} à{" "}
                    {new Date().toLocaleTimeString("fr-DZ")}
                  </div>
                  {session && (
                    <div className="mt-1 font-bold text-slate-800 print:text-black">
                      Réf Session : {session.reference} ({session.status === "open" ? "En cours" : "Clôturée"})
                    </div>
                  )}
                </div>
              </div>

              {/* Synthèse Chiffrée */}
              <div className="grid grid-cols-5 gap-3 p-3 bg-slate-50 print:bg-white border border-slate-200 print:border-2 print:border-black rounded-lg text-xs">
                <div>
                  <span className="text-slate-500 print:text-black block text-[10px] uppercase font-bold">
                    Solde d&apos;Ouverture
                  </span>
                  <span className="font-mono font-black text-slate-900 print:text-black text-sm">
                    {formatDA(openingBalance)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 print:text-black block text-[10px] uppercase font-bold">
                    Entrées Exploitation (+)
                  </span>
                  <span className="font-mono font-black text-emerald-700 print:text-black text-sm">
                    +{formatDA(operatingInflows)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 print:text-black block text-[10px] uppercase font-bold">
                    Sorties Charges (−)
                  </span>
                  <span className="font-mono font-black text-rose-700 print:text-black text-sm">
                    -{formatDA(operatingOutflows)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 print:text-black block text-[10px] uppercase font-bold">
                    Transferts Internes (⇄)
                  </span>
                  <span className="font-mono font-black text-purple-700 print:text-black text-sm">
                    {transfersOut > 0
                      ? `-${formatDA(transfersOut)}`
                      : transfersIn > 0
                      ? `+${formatDA(transfersIn)}`
                      : formatDA(0)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 print:text-black block text-[10px] uppercase font-bold">
                    Solde Théorique Final
                  </span>
                  <span className="font-mono font-black text-slate-900 print:text-black text-sm">
                    {formatDA(theoreticalFinalBalance)}
                  </span>
                </div>
              </div>

              {/* Tableau imprimable */}
              <table className="w-full text-left text-xs border-collapse print:border-2 print:border-black">
                <thead>
                  <tr className="bg-slate-100 print:bg-white print:text-black print:border-b-2 print:border-black border-y border-slate-300 font-bold text-[11px]">
                    <th className="py-2 px-2 print:border-r print:border-black font-bold print:text-black">Heure</th>
                    <th className="py-2 px-2 print:border-r print:border-black font-bold print:text-black">Référence</th>
                    <th className="py-2 px-2 print:border-r print:border-black font-bold print:text-black">Opération</th>
                    <th className="py-2 px-2 print:border-r print:border-black font-bold print:text-black">Description / Tiers</th>
                    <th className="py-2 px-2 text-right print:border-r print:border-black font-bold print:text-black">Entrée (DA)</th>
                    <th className="py-2 px-2 text-right print:border-r print:border-black font-bold print:text-black">Sortie (DA)</th>
                    <th className="py-2 px-2 text-right font-bold print:text-black">Solde (DA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 print:divide-black">
                  <tr className="italic text-slate-500 print:text-black">
                    <td className="py-1.5 px-2 font-mono print:border-r print:border-black">00:00</td>
                    <td className="py-1.5 px-2 print:border-r print:border-black">—</td>
                    <td className="py-1.5 px-2 print:border-r print:border-black font-bold">Solde initial</td>
                    <td className="py-1.5 px-2 print:border-r print:border-black">Fond de caisse d&apos;ouverture</td>
                    <td className="py-1.5 px-2 text-right font-mono print:border-r print:border-black">—</td>
                    <td className="py-1.5 px-2 text-right font-mono print:border-r print:border-black">—</td>
                    <td className="py-1.5 px-2 text-right font-mono font-black text-slate-900 print:text-black">
                      {formatDA(openingBalance)}
                    </td>
                  </tr>
                  {items.map((i) => (
                    <tr key={i.id} className="text-[11px] print:border-b print:border-black">
                      <td className="py-1.5 px-2 font-mono whitespace-nowrap print:border-r print:border-black">
                        {i.dateFormatted.split(" ")[1] || "—"}
                      </td>
                      <td className="py-1.5 px-2 font-mono font-bold whitespace-nowrap print:border-r print:border-black">
                        {i.reference}
                      </td>
                      <td className="py-1.5 px-2 whitespace-nowrap print:border-r print:border-black font-semibold">{i.operationType}</td>
                      <td className="py-1.5 px-2 print:border-r print:border-black">
                        <span className="font-bold print:text-black">{i.description}</span>
                        {i.partyName && (
                          <span className="text-slate-500 print:text-black block text-[10px]">
                            {i.partyName}
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-700 print:text-black whitespace-nowrap print:border-r print:border-black">
                        {i.inflow > 0 ? `+${formatDA(i.inflow)}` : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-bold text-rose-700 print:text-black whitespace-nowrap print:border-r print:border-black">
                        {i.outflow > 0 ? `-${formatDA(i.outflow)}` : "—"}
                      </td>
                      <td className="py-1.5 px-2 text-right font-mono font-black text-slate-900 print:text-black whitespace-nowrap bg-slate-50 print:bg-white">
                        {formatDA(i.runningBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-900 print:border-t-2 print:border-b-2 print:border-black font-bold bg-slate-100 print:bg-white text-xs print:text-black">
                    <td colSpan={4} className="py-2.5 px-2 uppercase text-[11px] font-black">
                      Total ({items.length} opérations) — Entrées: +{formatDA(operatingInflows)} | Charges: -{formatDA(operatingOutflows)} | Transferts: {transfersOut > 0 ? `-${formatDA(transfersOut)}` : formatDA(0)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-emerald-700 print:text-black font-black print:border-r print:border-black">
                      +{formatDA(operatingInflows)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-rose-700 print:text-black font-black print:border-r print:border-black">
                      -{formatDA(operatingOutflows)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-sm font-black text-slate-900 print:text-black">
                      {formatDA(theoreticalFinalBalance)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Signatures */}
              <div className="grid grid-cols-2 gap-12 pt-8 text-xs border-t-2 border-slate-300 print:border-black mt-8">
                <div className="text-center">
                  <span className="block font-black text-slate-800 print:text-black uppercase text-[11px]">
                    Signature du Caissier
                  </span>
                  <div className="w-48 mx-auto border-b-2 border-dashed border-slate-400 print:border-black mt-12 mb-2" />
                  <span className="text-[10px] text-slate-400 print:text-black italic block">
                    Bon pour arrêté physique de caisse
                  </span>
                </div>
                <div className="text-center">
                  <span className="block font-black text-slate-800 print:text-black uppercase text-[11px]">
                    Visa du Responsable / Comptable
                  </span>
                  <div className="w-48 mx-auto border-b-2 border-dashed border-slate-400 print:border-black mt-12 mb-2" />
                  <span className="text-[10px] text-slate-400 print:text-black italic block">
                    Vérifié conforme au grand livre
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        </PrintPortal>
      )}
    </div>
  );
}
