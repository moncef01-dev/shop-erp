"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MonthlyClosingDashboardData,
  MonthlyClosingSnapshotItem,
} from "./types";
import {
  markPeriodReadyForApprovalAction,
  revertPeriodToDraftAction,
  approveAndLockMonthlyClosingAction,
  reopenMonthlyClosingAction,
} from "./actions";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import { ChecklistSection } from "@/components/closing/ChecklistSection";
import { SnapshotManager } from "@/components/closing/SnapshotManager";
import { PrintableMonthlyReport } from "@/components/closing/PrintableMonthlyReport";
import {
  Calendar,
  CalendarCheck2,
  Printer,
  RotateCw,
  TrendingUp,
  CreditCard,
  Building2,
  Receipt,
  Package,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Landmark,
  ArrowLeftRight,
  Sparkles,
  Lock,
  Unlock,
  ShieldAlert,
  History,
  Check,
  X,
  XCircle,
  AlertCircle,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MonthlyClosingClientProps {
  initialData: MonthlyClosingDashboardData;
}

export function MonthlyClosingClient({ initialData }: MonthlyClosingClientProps) {
  const router = useRouter();
  const [data, setData] = useState<MonthlyClosingDashboardData>(initialData);
  const [activeTab, setActiveTab] = useState<
    "overview" | "checklist" | "treasury" | "stock" | "review" | "snapshots" | "audit"
  >("overview");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [printableSnapshot, setPrintableSnapshot] = useState<MonthlyClosingSnapshotItem | null>(null);
  const [isLivePrintOpen, setIsLivePrintOpen] = useState(false);

  // Workflow state
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [approverName, setApproverName] = useState("Direction / Gérant");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [backupConfirmed, setBackupConfirmed] = useState(false);
  const [reopenedBy, setReopenedBy] = useState("Direction / Gérant");
  const [reopenReason, setReopenReason] = useState("");
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const {
    month,
    monthLabel,
    periodStartStr,
    periodEndStr,
    isCurrentMonth,
    shopSettings,
    totals,
    checklist,
    snapshots,
    availableMonths,
    periodInfo,
    auditLogs,
  } = data;

  const blockers = periodInfo?.blockers || [];

  const currency = shopSettings.currency || "DA";

  const formatMoney = (val: number) => {
    return `${Math.round(val).toLocaleString("fr-DZ")} ${currency}`;
  };

  const handleMonthChange = (newMonth: string) => {
    if (newMonth && newMonth !== month) {
      router.push(`/closing/monthly?month=${newMonth}`);
    }
  };

  const handlePrevMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const prevDate = new Date(Date.UTC(y, m - 2, 1));
    const prevMonthStr = prevDate.toISOString().slice(0, 7);
    handleMonthChange(prevMonthStr);
  };

  const handleNextMonth = () => {
    const [y, m] = month.split("-").map(Number);
    const nextDate = new Date(Date.UTC(y, m, 1));
    const nextMonthStr = nextDate.toISOString().slice(0, 7);
    handleMonthChange(nextMonthStr);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    router.refresh();
    setTimeout(() => setIsRefreshing(false), 800);
  };

  const handleMarkReady = async () => {
    setWorkflowLoading(true);
    setWorkflowError(null);
    const res = await markPeriodReadyForApprovalAction(month);
    setWorkflowLoading(false);
    if (!res.success) {
      setWorkflowError(res.error || "Impossible de marquer prêt pour approbation");
    } else {
      router.refresh();
    }
  };

  const handleRevertDraft = async () => {
    setWorkflowLoading(true);
    setWorkflowError(null);
    const res = await revertPeriodToDraftAction(month);
    setWorkflowLoading(false);
    if (!res.success) {
      setWorkflowError(res.error || "Impossible de revenir en brouillon");
    } else {
      router.refresh();
    }
  };

  const handleApproveAndLock = async () => {
    if (!backupConfirmed) {
      setWorkflowError("Veuillez confirmer avoir vérifié une sauvegarde récente.");
      return;
    }
    if (!approverName.trim()) {
      setWorkflowError("Le nom de l'approbateur est obligatoire.");
      return;
    }
    setWorkflowLoading(true);
    setWorkflowError(null);
    const res = await approveAndLockMonthlyClosingAction(
      month,
      approverName.trim(),
      approvalNotes.trim() || undefined,
      backupConfirmed
    );
    setWorkflowLoading(false);
    if (!res.success) {
      setWorkflowError(res.error || "Erreur lors de l'approbation");
    } else {
      setIsApproveModalOpen(false);
      router.refresh();
    }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim() || reopenReason.trim().length < 10) {
      setWorkflowError("Le motif obligatoire de réouverture doit comporter au moins 10 caractères.");
      return;
    }
    setWorkflowLoading(true);
    setWorkflowError(null);
    const res = await reopenMonthlyClosingAction(
      month,
      reopenReason.trim(),
      reopenedBy.trim() || "Direction"
    );
    setWorkflowLoading(false);
    if (!res.success) {
      setWorkflowError(res.error || "Erreur lors de la réouverture");
    } else {
      setIsReopenModalOpen(false);
      setReopenReason("");
      router.refresh();
    }
  };

  const validatedCount = checklist.filter((c) => c.status === "VALIDATED").length;
  const discrepanciesCount = totals.review.discrepancies.length;

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans">
      {/* Navigation supérieure de la trésorerie */}
      <TreasuryNavigationTabs />

      {/* EN-TÊTE PRINCIPAL : TITRE & SÉLECTEUR DE MOIS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-xs">
                <CalendarCheck2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Clôture Mensuelle & Rapprochement
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Consolidation financière, pointage des flux et valorisation des inventaires
                </p>
              </div>
            </div>
          </div>

          {/* SÉLECTEUR DE MOIS & ACTIONS */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Contrôles de navigation dans les mois */}
            <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
              <button
                type="button"
                onClick={handlePrevMonth}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
                title="Mois précédent"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 px-3 py-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <select
                  value={month}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="bg-transparent text-xs font-bold text-slate-900 focus:outline-hidden cursor-pointer"
                >
                  {availableMonths.map((m) => (
                    <option key={m} value={m}>
                      {m} {m === month ? `(${monthLabel})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors"
                title="Mois suivant"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Bouton rafraîchir */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors border border-slate-200 shadow-xs"
              title="Rafraîchir les données"
            >
              <RotateCw className={cn("w-4 h-4", isRefreshing && "animate-spin text-amber-600")} />
            </button>

            {/* Bouton Imprimer rapport */}
            <button
              type="button"
              onClick={() => {
                if (periodInfo?.status === "FINAL" && snapshots.length > 0) {
                  const finalSnap = snapshots.find((s) => s.id === periodInfo.finalSnapshotId) || snapshots[0];
                  setPrintableSnapshot(finalSnap);
                } else {
                  setIsLivePrintOpen(true);
                }
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4 text-amber-400" />
              Imprimer PV de Clôture
            </button>
          </div>
        </div>

        {/* BANDEAU PÉRIODE & STATUT FORMEL */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-medium">
            <span
              className={cn(
                "inline-block w-2.5 h-2.5 rounded-full",
                periodInfo.isLocked
                  ? "bg-emerald-500 animate-pulse"
                  : periodInfo.status === "READY_FOR_APPROVAL"
                  ? "bg-blue-500"
                  : periodInfo.status === "REOPENED"
                  ? "bg-amber-500"
                  : "bg-slate-400"
              )}
            ></span>
            <span>
              Période arrêtée : <strong>Du {periodStartStr} au {periodEndStr}</strong> (Heure locale Algérie — UTC+1)
            </span>
          </div>

          <div className="flex items-center gap-2">
            {periodInfo.isLocked ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-300 shadow-xs">
                <Lock className="w-3.5 h-3.5 text-emerald-700" />
                CLÔTURÉ & VERROUILLÉ (FINAL)
              </span>
            ) : periodInfo.status === "READY_FOR_APPROVAL" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-blue-100 text-blue-900 border border-blue-300 shadow-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-700" />
                PRÊT POUR APPROBATION
              </span>
            ) : periodInfo.status === "REOPENED" ? (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-300 shadow-xs">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                PÉRIODE ROUVERTE (CORRECTIONS)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-300">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                BROUILLON / EN POINTAGE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* BANNIÈRE D'ERREUR WORKFLOW ÉVENTUELLE */}
      {workflowError && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl flex items-start justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-bold text-rose-900">Opération non autorisée</p>
              <p className="mt-0.5 text-rose-700">{workflowError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWorkflowError(null)}
            className="text-rose-500 hover:text-rose-700 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* CARTE DE CONTRÔLE DU WORKFLOW DE CLÔTURE & APPROBATION */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-extrabold text-slate-900">
                Workflow d&apos;Approbation & Verrouillage Périodique
              </h2>
              {periodInfo.isLocked ? (
                <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md text-[10px] font-bold">
                  Protégé en écriture
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md text-[10px] font-bold">
                  Période modifiable
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {periodInfo.isLocked
                ? `Période approuvée et verrouillée par ${periodInfo.approvedBy || "la direction"} le ${new Date(
                    periodInfo.approvedAt || Date.now()
                  ).toLocaleString("fr-DZ", { timeZone: "Africa/Algiers" })}. Toutes les transactions financières et mouvements de stock de ce mois sont protégés contre toute modification ou suppression.`
                : periodInfo.status === "READY_FOR_APPROVAL"
                ? "Tous les prérequis ont été validés. Le gérant ou l'administrateur peut maintenant procéder à l'approbation formelle et au verrouillage."
                : periodInfo.status === "REOPENED"
                ? "La période a été réouverte pour régularisation. Effectuez vos corrections, validez un nouvel instantané puis marquez le mois comme prêt pour re-validation."
                : "Pointage en cours. Complétez la checklist et résolvez les points bloquants ci-dessous pour débloquer l'approbation formelle."}
            </p>
          </div>

          {/* BOUTONS D'ACTION SELON LE STATUT */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {periodInfo.status === "DRAFT" && (
              <button
                type="button"
                onClick={handleMarkReady}
                disabled={workflowLoading || blockers.length > 0}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs",
                  blockers.length === 0
                    ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                    : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                )}
                title={blockers.length > 0 ? `${blockers.length} prérequis bloquant(s)` : "Prêt pour approbation"}
              >
                <Check className="w-4 h-4" />
                Marquer prêt pour approbation
                {blockers.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-slate-300 text-slate-700 rounded-full text-[10px]">
                    {blockers.length}
                  </span>
                )}
              </button>
            )}

            {periodInfo.status === "READY_FOR_APPROVAL" && (
              <>
                <button
                  type="button"
                  onClick={handleRevertDraft}
                  disabled={workflowLoading}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                >
                  Revenir en brouillon
                </button>
                <button
                  type="button"
                  onClick={() => setIsApproveModalOpen(true)}
                  disabled={workflowLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition-colors"
                >
                  <Lock className="w-4 h-4 text-emerald-200" />
                  Approuver et verrouiller la clôture
                </button>
              </>
            )}

            {periodInfo.status === "FINAL" && (
              <button
                type="button"
                onClick={() => setIsReopenModalOpen(true)}
                disabled={workflowLoading}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-colors"
              >
                <Unlock className="w-4 h-4 text-amber-600" />
                Demander la réouverture exceptionnelle
              </button>
            )}

            {periodInfo.status === "REOPENED" && (
              <button
                type="button"
                onClick={handleMarkReady}
                disabled={workflowLoading || blockers.length > 0}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs",
                  blockers.length === 0
                    ? "bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
                    : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                )}
              >
                <Check className="w-4 h-4" />
                Marquer prêt pour approbation
                {blockers.length > 0 && (
                  <span className="px-1.5 py-0.2 bg-slate-300 text-slate-700 rounded-full text-[10px]">
                    {blockers.length}
                  </span>
                )}
              </button>
            )}
          </div>
        </div>

        {/* PRÉCONDITIONS ET POINTS BLOQUANTS */}
        {!periodInfo.isLocked && blockers.length > 0 && (
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 space-y-2.5 text-xs">
            <div className="flex items-center gap-2 text-amber-900 font-bold">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Préconditions d&apos;approbation : {blockers.length} point(s) bloquant(s) identifié(s)
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
              {blockers.map((b) => (
                <div
                  key={b.code}
                  className="p-3 bg-white/80 rounded-lg border border-amber-200/80 space-y-1 text-slate-800"
                >
                  <p className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                    {b.title}
                  </p>
                  <p className="text-[11px] text-slate-600">{b.message}</p>
                  {b.actionHint && (
                    <p className="text-[10px] text-amber-700 font-semibold italic">💡 {b.actionHint}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 6 CARTES KPI PRINCIPALES */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* KPI 1 : Chiffre d'Affaires Facturé */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                1. Chiffre d&apos;Affaires Facturé Net
              </p>
              <p className="text-2xl font-black text-slate-900">
                {formatMoney(totals.sales.totalInvoiced)}
              </p>
              <p className="text-xs text-slate-500">
                {totals.sales.confirmedCount ?? totals.sales.count} facture(s) de vente confirmée(s)
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
            <div>
              <span className="text-slate-400">Sous-total : </span>
              <span className="font-semibold text-slate-800">{formatMoney(totals.sales.subtotal)}</span>
            </div>
            <div>
              <span className="text-slate-400">Livraison incluse : </span>
              <span className="font-semibold text-slate-800">+{formatMoney(totals.sales.deliveryFeesIncluded ?? totals.sales.deliveryFees)}</span>
            </div>
            <div>
              <span className="text-slate-400">Remises : </span>
              <span className="font-semibold text-slate-800">-{formatMoney(totals.sales.discounts)}</span>
            </div>
            <div>
              <span className="text-slate-400">Marge brute : </span>
              <span className="font-semibold text-emerald-700">{formatMoney(totals.sales.grossMarginEstimated)}</span>
            </div>
            {(totals.sales.draftQuotesCount ?? 0) > 0 && (
              <div className="col-span-2 pt-1.5 border-t border-slate-100 text-[10.5px] text-slate-500 flex justify-between">
                <span>Devis en cours ({totals.sales.draftQuotesCount}) : {formatMoney(totals.sales.draftQuotesTotal ?? 0)}</span>
                <span className="font-semibold text-slate-700">Total volume : {formatMoney(totals.sales.totalCommercialVolume ?? totals.sales.totalInvoiced)}</span>
              </div>
            )}
          </div>
        </div>

        {/* KPI 2 : Encaissements Réels */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                2. Encaissements Réels Perçus
              </p>
              <p className="text-2xl font-black text-emerald-700">
                {formatMoney(totals.collections.totalCollected)}
              </p>
              <p className="text-xs text-emerald-600/80 font-medium">
                Liquidités réellement perçues (distinct du CA)
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CreditCard className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
            <div>
              <span className="text-slate-400">Espèces : </span>
              <span className="font-semibold text-slate-800">{formatMoney(totals.collections.cash)}</span>
            </div>
            <div>
              <span className="text-slate-400">Chèques : </span>
              <span className="font-semibold text-slate-800">{formatMoney(totals.collections.check)}</span>
            </div>
            <div>
              <span className="text-slate-400">Virements/CIB : </span>
              <span className="font-semibold text-slate-800">{formatMoney(totals.collections.transfer + totals.collections.cib)}</span>
            </div>
            <div>
              <span className="text-slate-400">Acomptes reçus : </span>
              <span className="font-semibold text-slate-800">{formatMoney(totals.collections.customerAdvancesReceived)}</span>
            </div>
          </div>
        </div>

        {/* KPI 3 : Créances Clients en Fin de Mois */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                3. Créances Clients au {periodEndStr.slice(0, 10)}
              </p>
              <p className="text-2xl font-black text-slate-900">
                {formatMoney(totals.customerDebt.totalOutstanding)}
              </p>
              <p className="text-xs text-slate-500">
                {totals.customerDebt.debtorsCount} client(s) débiteur(s) (Factures confirmées)
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-100">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-400">Factures confirmées :</span>
              <span className="font-semibold text-slate-800">{formatMoney(totals.customerDebt.confirmedDebt ?? totals.customerDebt.totalOutstanding)}</span>
            </div>
            {(totals.customerDebt.draftQuotesRemaining ?? 0) > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Devis en cours (hors créances) :</span>
                <span className="font-semibold">{formatMoney(totals.customerDebt.draftQuotesRemaining ?? 0)}</span>
              </div>
            )}
            {totals.customerDebt.unallocatedAdvances > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Acomptes clients non alloués :</span>
                <span className="font-semibold">-{formatMoney(totals.customerDebt.unallocatedAdvances)}</span>
              </div>
            )}
          </div>
        </div>

        {/* KPI 4 : Achats & Fournisseurs */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                4. Achats & Dettes Fournisseurs
              </p>
              <p className="text-2xl font-black text-slate-900">
                {formatMoney(totals.purchases.totalInvoiced)}
              </p>
              <p className="text-xs text-slate-500">
                {totals.purchases.count} commande(s) d&apos;achat dans le mois
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-600 border border-purple-100">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-400">Règlements fournisseurs :</span>
              <span className="font-semibold text-amber-700">{formatMoney(totals.purchases.supplierPaymentsMade)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Retours marchandises :</span>
              <span className="font-semibold text-emerald-700">{formatMoney(totals.purchases.supplierReturnsAmount)} ({totals.purchases.supplierReturnsCount})</span>
            </div>
            <div className="flex justify-between font-bold text-rose-700">
              <span>Dette totale résiduelle :</span>
              <span>{formatMoney(totals.purchases.totalOutstandingDebtAtEnd)}</span>
            </div>
          </div>
        </div>

        {/* KPI 5 : Charges & Produits d'Exploitation */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                5. Charges & Produits Exceptionnels
              </p>
              <p className="text-2xl font-black text-rose-700">
                {formatMoney(totals.expenses.totalOperating)}
              </p>
              <p className="text-xs text-slate-500">
                Dépenses d&apos;exploitation documentées
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-100">
              <Receipt className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-400">Charges payées en espèces :</span>
              <span className="font-semibold text-slate-800">{formatMoney(totals.expenses.operatingCashPaid)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Produits / Apports exceptionnels :</span>
              <span className="font-semibold text-emerald-700">+{formatMoney(totals.expenses.exceptionalIncome)}</span>
            </div>
            <div className="text-[10px] text-slate-400 italic mt-1">
              Note : Les virements internes sont exclus des charges
            </div>
          </div>
        </div>

        {/* KPI 6 : Valorisation des Stocks */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs relative overflow-hidden">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                6. Valorisation Globale des Stocks
              </p>
              <p className="text-2xl font-black text-slate-900">
                {formatMoney(totals.stock.valuationCost)}
              </p>
              <p className="text-xs text-slate-500">
                Coût d&apos;achat ({totals.stock.totalQuantity} pièces réparties)
              </p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <Package className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 space-y-1 text-[11px] text-slate-600">
            <div className="flex justify-between">
              <span className="text-slate-400">Valeur au prix de vente :</span>
              <span className="font-semibold text-slate-800">{formatMoney(totals.stock.valuationSelling)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Marge brute théorique :</span>
              <span className="font-semibold text-emerald-700">{formatMoney(totals.stock.potentialMargin)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Dépôts actifs :</span>
              <span className="font-semibold text-slate-800">{totals.stock.warehouses.length} dépôt(s)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ONGLET DE NAVIGATION SECONDAIRE */}
      <div className="bg-white rounded-2xl border border-slate-200 p-1.5 shadow-xs overflow-x-auto no-scrollbar">
        <nav className="flex items-center gap-1 min-w-max">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === "overview"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Synthèse & Rapprochement
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("checklist")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === "checklist"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            Pointage & Contrôles (10)
            <span
              className={cn(
                "ml-1 px-1.5 py-0.5 rounded-full text-[10px]",
                validatedCount === 10
                  ? "bg-emerald-700 text-white"
                  : "bg-slate-200 text-slate-700"
              )}
            >
              {validatedCount}/10
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("treasury")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === "treasury"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Landmark className="w-3.5 h-3.5" />
            Trésorerie & Virements
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("stock")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === "stock"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Package className="w-3.5 h-3.5" />
            Stocks & Dépôts
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("review")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === "review"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Anomalies & Alertes
            {discrepanciesCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-rose-600 text-white font-bold">
                {discrepanciesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("snapshots")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === "snapshots"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Clock className="w-3.5 h-3.5" />
            Instantanés & Audit
            <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700">
              {snapshots.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("audit")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all",
              activeTab === "audit"
                ? "bg-amber-500 text-slate-950 shadow-xs"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <History className="w-3.5 h-3.5" />
            Journal d&apos;Audit & Historique
            {auditLogs && auditLogs.length > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-200 text-slate-700">
                {auditLogs.length}
              </span>
            )}
          </button>
        </nav>
      </div>

      {/* CONTENU DE L'ONGLET 1 : SYNTHÈSE & RAPPROCHEMENT */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Tableau comparatif Ventes facturées vs Encaissements réels */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Rapprochement Activité Commerciale : Facturation vs Flux de Trésorerie
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
                <h4 className="text-xs font-bold text-slate-700 uppercase">
                  Activité Facturée dans le Mois (Compte de résultat)
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">Sous-total articles vendus :</span>
                    <span className="font-mono font-bold text-slate-900">{formatMoney(totals.sales.subtotal)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">Frais de livraison facturés :</span>
                    <span className="font-mono font-bold text-slate-900">+{formatMoney(totals.sales.deliveryFees)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200">
                    <span className="text-slate-600">Remises commerciales :</span>
                    <span className="font-mono font-bold text-slate-900">-{formatMoney(totals.sales.discounts)}</span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-slate-900">
                    <span>Chiffre d&apos;affaires facturé net :</span>
                    <span className="font-mono text-base">{formatMoney(totals.sales.totalInvoiced)}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/40 border border-emerald-200/80 space-y-3">
                <h4 className="text-xs font-bold text-emerald-900 uppercase">
                  Encaissements Réels Perçus (Flux de trésorerie)
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-emerald-200/60">
                    <span className="text-slate-600">Règlements de ventes perçus :</span>
                    <span className="font-mono font-bold text-emerald-900">{formatMoney(totals.collections.salePaymentsCollected)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-200/60">
                    <span className="text-slate-600">Acomptes clients reçus :</span>
                    <span className="font-mono font-bold text-emerald-900">+{formatMoney(totals.collections.customerAdvancesReceived)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-emerald-200/60 text-slate-500 text-[11px]">
                    <span>Répartition espèces vs banques :</span>
                    <span>Espèces: {formatMoney(totals.collections.cash)} | Autres: {formatMoney(totals.collections.check + totals.collections.transfer + totals.collections.cib)}</span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-emerald-950">
                    <span>Total Liquidités Entrées :</span>
                    <span className="font-mono text-base text-emerald-700">{formatMoney(totals.collections.totalCollected)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sessions de caisse journalière & Charges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sessions de caisse journalière */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4 flex items-center justify-between">
                <span>Sessions de Caisse Journalière</span>
                <span className="text-xs text-slate-500 font-normal">
                  {totals.cashSessions.closedCount} fermée(s), {totals.cashSessions.openCount} ouverte(s)
                </span>
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Espèces théoriques cumulées :</span>
                  <span className="font-mono font-semibold text-slate-800">{formatMoney(totals.cashSessions.theoreticalTotal)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Espèces réelles comptées au tiroir :</span>
                  <span className="font-mono font-semibold text-slate-800">{formatMoney(totals.cashSessions.closingCountedTotal)}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600">Écart de caisse net cumulé :</span>
                  <span className="font-mono font-bold">
                    {totals.cashSessions.discrepancyTotal === 0 ? (
                      <span className="text-emerald-700">0 DA (Strictement conforme)</span>
                    ) : (
                      <span className="text-rose-700">{formatMoney(totals.cashSessions.discrepancyTotal)}</span>
                    )}
                  </span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-100 font-semibold text-slate-800">
                  <span>Transferts clôture vers coffres ({totals.cashSessions.transfersCount} virements) :</span>
                  <span className="font-mono">{formatMoney(totals.cashSessions.closingTransfersTotal)}</span>
                </div>
                {(totals.cashSessions.manualTransfersTotal ?? 0) > 0 && (
                  <div className="flex justify-between py-1 border-b border-slate-100 text-slate-500 text-[11px]">
                    <span>Transferts manuels ponctuels hors session :</span>
                    <span className="font-mono font-medium text-slate-700">+{formatMoney(totals.cashSessions.manualTransfersTotal ?? 0)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1.5 font-bold text-slate-900">
                  <span>Total virements inter-comptes :</span>
                  <span className="font-mono text-emerald-800">{formatMoney(totals.treasury.totalTransfersVolume)}</span>
                </div>
              </div>
            </div>

            {/* Ventilation des charges par catégorie */}
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">
                Ventilation des Charges d&apos;Exploitation ({totals.expenses.categories.length} catégories)
              </h3>

              {totals.expenses.categories.length === 0 ? (
                <p className="text-xs text-slate-400 italic">Aucune charge enregistrée pour ce mois.</p>
              ) : (
                <div className="space-y-2 text-xs">
                  {totals.expenses.categories.slice(0, 5).map((cat) => (
                    <div key={cat.category} className="flex justify-between items-center py-1 border-b border-slate-100">
                      <span className="text-slate-600 font-medium">{cat.label} ({cat.count})</span>
                      <span className="font-mono font-bold text-slate-900">{formatMoney(cat.total)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 font-bold text-rose-700">
                    <span>Total Charges d&apos;Exploitation :</span>
                    <span className="font-mono">{formatMoney(totals.expenses.totalOperating)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONTENU DE L'ONGLET 2 : CHECKLIST & POINTAGE */}
      {activeTab === "checklist" && (
        <ChecklistSection month={month} checklist={checklist} onRefresh={handleRefresh} />
      )}

      {/* CONTENU DE L'ONGLET 3 : TRÉSORERIE & VIREMENTS */}
      {activeTab === "treasury" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-amber-500" />
                  Situation Détaillée des Comptes de Trésorerie
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Rapprochement entre soldes au 1er du mois, flux du mois et soldes de clôture
                </p>
              </div>

              <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-amber-600" />
                <span>Virements internes : {formatMoney(totals.treasury.totalTransfersVolume)} (Strictement neutres)</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-bold">
                    <th className="p-3">Compte</th>
                    <th className="p-3">Type</th>
                    <th className="p-3 text-right">Solde Début</th>
                    <th className="p-3 text-right text-emerald-700">Virements Reçus (+)</th>
                    <th className="p-3 text-right text-rose-700">Virements Émis (-)</th>
                    <th className="p-3 text-right text-emerald-700">Autres Entrées</th>
                    <th className="p-3 text-right text-rose-700">Autres Sorties</th>
                    <th className="p-3 text-right">Solde Fin de Mois</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {totals.treasury.accounts.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-bold text-slate-900">{acc.name}</td>
                      <td className="p-3 text-slate-500 uppercase text-[10px] font-semibold">{acc.type}</td>
                      <td className="p-3 text-right font-mono font-medium">{formatMoney(acc.openingBalance)}</td>
                      <td className="p-3 text-right font-mono text-emerald-700">
                        {acc.transfersIn > 0 ? `+${formatMoney(acc.transfersIn)}` : "0 DA"}
                      </td>
                      <td className="p-3 text-right font-mono text-rose-700">
                        {acc.transfersOut > 0 ? `-${formatMoney(acc.transfersOut)}` : "0 DA"}
                      </td>
                      <td className="p-3 text-right font-mono text-emerald-700">
                        {acc.otherInflows > 0 ? `+${formatMoney(acc.otherInflows)}` : "0 DA"}
                      </td>
                      <td className="p-3 text-right font-mono text-rose-700">
                        {acc.otherOutflows > 0 ? `-${formatMoney(acc.otherOutflows)}` : "0 DA"}
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">
                        {formatMoney(acc.closingBalance)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-100/70 font-bold border-t-2 border-slate-300">
                    <td colSpan={2} className="p-3 text-slate-900">Total Trésorerie Consolidée</td>
                    <td className="p-3 text-right font-mono">{formatMoney(totals.treasury.totalOpening)}</td>
                    <td className="p-3 text-right font-mono text-emerald-700">+{formatMoney(totals.treasury.totalTransfersVolume)}</td>
                    <td className="p-3 text-right font-mono text-rose-700">-{formatMoney(totals.treasury.totalTransfersVolume)}</td>
                    <td colSpan={2} className="p-3 text-right font-mono text-slate-700">
                      Variation nette : {totals.treasury.netVariation >= 0 ? `+${formatMoney(totals.treasury.netVariation)}` : formatMoney(totals.treasury.netVariation)}
                    </td>
                    <td className="p-3 text-right font-mono font-black text-slate-950 text-sm">
                      {formatMoney(totals.treasury.totalClosing)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* CONTENU DE L'ONGLET 4 : STOCKS & DÉPÔTS */}
      {activeTab === "stock" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Valorisation des Stocks par Dépôt / Magasin
              </h3>
              <div className="flex items-center gap-2">
                <span className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-semibold",
                  totals.stock.valuationBasis === "SNAPSHOT"
                    ? "bg-purple-100 text-purple-800 border border-purple-200"
                    : totals.stock.valuationBasis === "UNAVAILABLE"
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-blue-50 text-blue-800 border border-blue-200"
                )}>
                  {totals.stock.valuationBasis === "SNAPSHOT"
                    ? "Inventaire Figé Snapshot"
                    : totals.stock.valuationBasis === "UNAVAILABLE"
                    ? "Historique Non Reconstitué"
                    : "Inventaire Temps Réel"}
                </span>
              </div>
            </div>

            {totals.stock.valuationNotice && (
              <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
                <span>{totals.stock.valuationNotice}</span>
                {totals.stock.valuationTimestamp && (
                  <span className="font-mono text-slate-400 text-[11px]">
                    Relevé : {new Date(totals.stock.valuationTimestamp).toLocaleDateString("fr-FR")}
                  </span>
                )}
              </div>
            )}

            {totals.stock.valuationBasis === "UNAVAILABLE" ? (
              <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <p className="text-sm font-semibold text-slate-700">Valorisation historique indisponible</p>
                <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
                  Les mouvements de stock et coûts d&apos;achat historiques ne permettent pas une reconstitution rétroactive fiable pour ce mois. Aucun snapshot figé n&apos;a été archivé lors de la clôture de ce mois.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {totals.stock.warehouses.map((wh) => (
                  <div key={wh.locationId} className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">{wh.locationName}</h4>
                      <p className="text-[11px] text-slate-500 font-mono">{wh.locationCode}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full bg-slate-200 text-slate-800 text-xs font-bold font-mono">
                      {wh.totalQuantity} pcs
                    </span>
                  </div>

                  <div className="space-y-1 text-xs pt-2 border-t border-slate-200">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Coût d&apos;achat :</span>
                      <span className="font-mono font-bold text-slate-900">{formatMoney(wh.valuationCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Prix de vente :</span>
                      <span className="font-mono font-semibold text-slate-700">{formatMoney(wh.valuationSelling)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Marge potentielle :</span>
                      <span className="font-mono">{formatMoney(wh.valuationSelling - wh.valuationCost)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      )}

      {/* CONTENU DE L'ONGLET 5 : ANOMALIES & ÉCARTS */}
      {activeTab === "review" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Anomalies Détectées & Rapprochements à Vérifier ({totals.review.discrepancies.length})
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Ces éléments n&apos;empêchent pas la réconciliation mais doivent être justifiés ou arbitrés avant la clôture définitive.
            </p>

            {totals.review.discrepancies.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-500" />
                <p className="text-sm font-semibold text-slate-800">Aucune anomalie bloquante détectée</p>
                <p className="text-xs text-slate-500 mt-1">Toutes les vérifications automatisées sont conformes.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {totals.review.discrepancies.map((d) => (
                  <div key={d.id} className="py-4 flex items-start gap-3">
                    <div
                      className={cn(
                        "p-2 rounded-lg shrink-0 mt-0.5",
                        d.severity === "error"
                          ? "bg-rose-50 text-rose-600 border border-rose-200"
                          : "bg-amber-50 text-amber-600 border border-amber-200"
                      )}
                    >
                      <AlertTriangle className="w-4 h-4" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-slate-900">{d.title}</h4>
                      <p className="text-xs text-slate-600 leading-relaxed">{d.details}</p>
                      {d.reference && (
                        <p className="text-[11px] font-mono text-slate-400">Référence : {d.reference}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* CONTENU DE L'ONGLET 6 : INSTANTANÉS & AUDIT */}
      {activeTab === "snapshots" && (
        <SnapshotManager
          month={month}
          monthLabel={monthLabel}
          snapshots={snapshots}
          currentTotals={totals}
          currentChecklist={checklist}
          onViewSnapshot={(snap) => setPrintableSnapshot(snap)}
          onRefresh={handleRefresh}
        />
      )}

      {/* CONTENU DE L'ONGLET 7 : JOURNAL D'AUDIT & HISTORIQUE */}
      {activeTab === "audit" && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-500" />
                  Journal d&apos;Audit Comptable & Historique ({auditLogs?.length || 0})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Traçabilité immuable des transitions d&apos;état, des approbations formelles et des réouvertures exceptionnelles.
                </p>
              </div>
            </div>

            {(!auditLogs || auditLogs.length === 0) ? (
              <div className="p-8 text-center text-slate-400">
                <Clock className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700">Aucun événement d&apos;audit pour ce mois</p>
                <p className="text-xs text-slate-500 mt-1">
                  Les approbations, réouvertures et modifications de statut apparaîtront ici de manière permanente.
                </p>
              </div>
            ) : (
              <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                {auditLogs.map((log) => {
                  const dateStr = new Date(log.createdAt).toLocaleString("fr-DZ", {
                    timeZone: "Africa/Algiers",
                  });
                  const isFinal = log.toStatus === "FINAL" || log.action === "APPROVED";
                  const isReopened = log.toStatus === "REOPENED" || log.action === "REOPENED";
                  const isReady = log.toStatus === "READY_FOR_APPROVAL";

                  return (
                    <div key={log.id} className="relative group">
                      <span
                        className={cn(
                          "absolute -left-6 top-1 w-3.5 h-3.5 rounded-full border-2 border-white shadow-xs",
                          isFinal
                            ? "bg-emerald-600"
                            : isReopened
                            ? "bg-amber-500"
                            : isReady
                            ? "bg-blue-500"
                            : "bg-slate-400"
                        )}
                      />
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-md text-[10px] font-bold uppercase",
                                isFinal
                                  ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                  : isReopened
                                  ? "bg-amber-100 text-amber-900 border border-amber-200"
                                  : isReady
                                  ? "bg-blue-100 text-blue-900 border border-blue-200"
                                  : "bg-slate-200 text-slate-800"
                              )}
                            >
                              {log.action}
                            </span>
                            {log.fromStatus && (
                              <span className="text-[11px] text-slate-500 flex items-center gap-1 font-mono">
                                <span>{log.fromStatus}</span>
                                <span>&rarr;</span>
                                <span className="font-bold text-slate-800">{log.toStatus}</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">{dateStr}</span>
                        </div>

                        {log.reason && (
                          <div className="p-2.5 bg-white rounded-lg border border-slate-200 text-xs text-slate-800">
                            <span className="font-semibold text-slate-600">Justification / Motif : </span>
                            <span>{log.reason}</span>
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-slate-500 border-t border-slate-100">
                          <span>
                            Opérateur / Approbateur : <strong>{log.operator || "Système"}</strong>
                          </span>
                          {log.snapshotRef && (
                            <span className="font-mono text-slate-600">
                              Instantané : {log.snapshotRef}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL APPROBATION & VERROUILLAGE */}
      {isApproveModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 space-y-5 border border-slate-200">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Approbation & Verrouillage Définitif
                  </h3>
                  <p className="text-xs text-slate-500">Mois : {monthLabel} ({month})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                Conséquences du verrouillage de période
              </p>
              <p className="text-amber-800 leading-relaxed">
                Après cette confirmation, toutes les opérations financières (ventes, paiements, achats, règlements, caisses, virements et stocks) affectant la période du <strong>{periodStartStr}</strong> au <strong>{periodEndStr}</strong> seront strictement verrouillées côté serveur. Aucune modification ou antidatage ne sera permise sans réouverture formelle.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Nom ou fonction de l&apos;approbateur *
                </label>
                <input
                  type="text"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  placeholder="Ex: Direction Générale / Moncef"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Observations / Notes d&apos;approbation (facultatif)
                </label>
                <textarea
                  rows={2}
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Ex: Clôture mensuelle validée après inventaire physique complet."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-slate-50 border border-slate-200 rounded-xl hover:bg-slate-100/80 transition-colors">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(e) => setBackupConfirmed(e.target.checked)}
                    className="mt-0.5 rounded-sm border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-slate-800 font-semibold leading-relaxed">
                    Je confirme avoir vérifié ou effectué une sauvegarde récente de la base de données SQLite avant verrouillage. *
                  </span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                disabled={workflowLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleApproveAndLock}
                disabled={workflowLoading || !backupConfirmed || !approverName.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Lock className="w-4 h-4 text-emerald-200" />
                {workflowLoading ? "Verrouillage en cours..." : "Confirmer le verrouillage définitif"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL RÉOUVERTURE EXCEPTIONNELLE */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 space-y-5 border border-slate-200">
            <div className="flex items-start justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                  <Unlock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Réouverture Exceptionnelle du Mois Clôturé
                  </h3>
                  <p className="text-xs text-slate-500">Mois : {monthLabel} ({month})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReopenModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-1">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                Procédure d&apos;audit stricte
              </p>
              <p className="text-rose-800 leading-relaxed">
                La réouverture déverrouille temporairement les écritures de cette période. L&apos;instantané originalement finalisé reste conservé intact et un enregistrement permanent sera ajouté au journal d&apos;audit avec votre motif et identité.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Opérateur effectuant la réouverture *
                </label>
                <input
                  type="text"
                  value={reopenedBy}
                  onChange={(e) => setReopenedBy(e.target.value)}
                  placeholder="Ex: Direction Générale / Responsable Comptable"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-800 mb-1">
                  Motif obligatoire et détaillé de réouverture * (min. 10 caractères)
                </label>
                <textarea
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Ex: Régularisation facture fournisseur oubliée BC-202610-0004 avant clôture fiscale définitive."
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {reopenReason.length}/10 caractères minimum
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsReopenModalOpen(false)}
                disabled={workflowLoading}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleReopen}
                disabled={workflowLoading || reopenReason.trim().length < 10 || !reopenedBy.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black rounded-xl text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Unlock className="w-4 h-4 text-amber-200" />
                {workflowLoading ? "Réouverture..." : "Confirmer la réouverture"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL IMPRESSION : DONNÉES EN DIRECT OU SNAPSHOT */}
      {isLivePrintOpen && (
        <PrintableMonthlyReport
          monthLabel={monthLabel}
          periodStartStr={periodStartStr}
          periodEndStr={periodEndStr}
          status={periodInfo.status}
          isLocked={periodInfo.isLocked}
          approvedBy={periodInfo.approvedBy}
          approvedAt={periodInfo.approvedAt}
          reopenedBy={auditLogs?.find((l) => l.action === "REOPENED")?.operator}
          reopenedAt={auditLogs?.find((l) => l.action === "REOPENED")?.createdAt}
          reopenReason={auditLogs?.find((l) => l.action === "REOPENED")?.reason}
          shopSettings={shopSettings}
          totals={totals}
          checklist={checklist}
          discrepancies={totals.review.discrepancies}
          onClose={() => setIsLivePrintOpen(false)}
        />
      )}

      {printableSnapshot && (
        <PrintableMonthlyReport
          monthLabel={monthLabel}
          periodStartStr={periodStartStr}
          periodEndStr={periodEndStr}
          reference={printableSnapshot.reference}
          version={printableSnapshot.version}
          status={printableSnapshot.status}
          isLocked={periodInfo.isLocked}
          approvedBy={periodInfo.approvedBy}
          approvedAt={periodInfo.approvedAt}
          reopenedBy={auditLogs?.find((l) => l.action === "REOPENED")?.operator}
          reopenedAt={auditLogs?.find((l) => l.action === "REOPENED")?.createdAt}
          reopenReason={auditLogs?.find((l) => l.action === "REOPENED")?.reason}
          notes={printableSnapshot.notes}
          generatedAt={printableSnapshot.generatedAt}
          generatedBy={printableSnapshot.generatedBy}
          shopSettings={shopSettings}
          totals={printableSnapshot.totals}
          checklist={printableSnapshot.checklist}
          discrepancies={printableSnapshot.discrepancies}
          onClose={() => setPrintableSnapshot(null)}
        />
      )}
    </div>
  );
}
