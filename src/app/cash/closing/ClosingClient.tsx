"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Printer,
  Edit2,
  X,
  ArrowRight,
  ShieldCheck,
  History,
  TrendingDown,
  TrendingUp,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  openCashSessionAction,
  closeCashSessionAction,
  editClosedCashSessionAction,
  type CashDashboardData,
} from "../actions";

function formatClosingDateTime(dateStr?: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleDateString("fr-DZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
import type { TreasuryAccountData } from "../treasury-actions";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import {
  formatDA,
  PrintableCashClosingReport,
} from "@/components/cash/PrintableCashDocuments";

interface ClosingClientProps {
  data: CashDashboardData;
  treasuryAccounts: TreasuryAccountData[];
}

export function ClosingClient({ data, treasuryAccounts }: ClosingClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { activeSession, sessions } = data;

  // Modals state
  const [isOpeningModalOpen, setIsOpeningModalOpen] = useState(false);
  const [openingAmount, setOpeningAmount] = useState("0");
  const [openingNotes, setOpeningNotes] = useState("");

  const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);
  const [closingCountedAmount, setClosingCountedAmount] = useState("");
  const [closingTransferAmount, setClosingTransferAmount] = useState("");
  const [closingTransferDestId, setClosingTransferDestId] = useState<string>(
    treasuryAccounts.find((a) => a.type === "safe")?.id.toString() ||
      treasuryAccounts[1]?.id.toString() ||
      ""
  );
  const [closingNotes, setClosingNotes] = useState("");

  // Edit closed session modal
  const [editingSession, setEditingSession] = useState<(typeof sessions)[0] | null>(null);
  const [editCountedAmount, setEditCountedAmount] = useState("");
  const [editTransferAmount, setEditTransferAmount] = useState("");
  const [editTransferDestId, setEditTransferDestId] = useState<string>("");
  const [editNotes, setEditNotes] = useState("");
  const [editReason, setEditReason] = useState("");

  // Printing state
  const [printingSession, setPrintingSession] = useState<(typeof sessions)[0] | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);

  const toggleExpand = (id: number) => {
    setExpandedSessionId((prev) => (prev === id ? null : id));
  };

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  // Safe accounts for transfer destination
  const safeAccounts = treasuryAccounts.filter((a) => a.type === "safe" && a.isActive);

  const closedSessions = sessions.filter(
    (s) => s.status?.toLowerCase() === "closed" || (s.closedAt && s.status?.toLowerCase() !== "open")
  );

  // Opening session handler
  const handleOpenSession = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(openingAmount);
    if (isNaN(amountNum) || amountNum < 0) {
      showNotification("error", "Le fond de caisse initial doit être positif ou nul.");
      return;
    }

    startTransition(async () => {
      const res = await openCashSessionAction({
        openingAmount: amountNum,
        openingNotes,
      });

      if (res.success) {
        showNotification("success", res.message || "Session de caisse ouverte.");
        setIsOpeningModalOpen(false);
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de l'ouverture.");
      }
    });
  };

  // Closing session handler
  const handleCloseSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    const countedNum = parseFloat(closingCountedAmount);
    if (isNaN(countedNum) || countedNum < 0) {
      showNotification("error", "Veuillez saisir un montant physique compté valide.");
      return;
    }

    const transferNum = closingTransferAmount ? parseFloat(closingTransferAmount) : 0;
    if (transferNum > countedNum) {
      showNotification(
        "error",
        `Le montant à transférer (${formatDA(transferNum)}) ne peut excéder les espèces comptées (${formatDA(
          countedNum
        )}).`
      );
      return;
    }

    if (transferNum > 0 && !closingTransferDestId) {
      showNotification("error", "Veuillez sélectionner le compte de destination du transfert vers le coffre.");
      return;
    }

    startTransition(async () => {
      const res = await closeCashSessionAction({
        sessionId: activeSession.id,
        closingAmount: countedNum,
        closingNotes,
        transferAmount: transferNum,
        transferDestinationAccountId: transferNum > 0 ? parseInt(closingTransferDestId, 10) : undefined,
      });

      if (res.success) {
        showNotification("success", res.message || "Session clôturée avec succès.");
        setIsClosingModalOpen(false);
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de la clôture.");
      }
    });
  };

  // Open edit modal
  const handleOpenEdit = (s: (typeof sessions)[0]) => {
    setEditingSession(s);
    setEditCountedAmount((s.closingAmount ?? 0).toString());
    const existingTrf = s.transfers?.[0];
    setEditTransferAmount(existingTrf ? existingTrf.amount.toString() : "0");
    setEditTransferDestId(
      existingTrf ? existingTrf.toAccountId.toString() : safeAccounts[0]?.id.toString() || ""
    );
    setEditNotes(s.closingNotes || "");
    setEditReason("");
  };

  // Submit edit closed session
  const handleUpdateClosing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSession) return;
    const countedNum = parseFloat(editCountedAmount);
    if (isNaN(countedNum) || countedNum < 0) {
      showNotification("error", "Montant physique invalide.");
      return;
    }

    const transferNum = editTransferAmount ? parseFloat(editTransferAmount) : 0;
    if (transferNum > countedNum) {
      showNotification(
        "error",
        `Le montant transféré (${formatDA(transferNum)}) ne peut dépasser le montant physique (${formatDA(
          countedNum
        )}).`
      );
      return;
    }

    if (!editReason || editReason.trim().length < 3) {
      showNotification("error", "Le motif de la correction est obligatoire pour l'audit.");
      return;
    }

    startTransition(async () => {
      const res = await editClosedCashSessionAction({
        sessionId: editingSession.id,
        newClosingAmount: countedNum,
        newTransferAmount: transferNum,
        newTransferDestinationAccountId: transferNum > 0 ? parseInt(editTransferDestId, 10) : undefined,
        newClosingNotes: editNotes,
        reason: editReason,
      });

      if (res.success) {
        showNotification("success", res.message || "Clôture corrigée avec succès.");
        setEditingSession(null);
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de la correction.");
      }
    });
  };

  // Real-time calculations for closing modal
  const currentCountedNum = parseFloat(closingCountedAmount) || 0;
  const currentTheoretical = activeSession ? activeSession.currentTheoreticalCash : 0;
  const currentDiff = currentCountedNum - currentTheoretical;
  const currentTransferNum = parseFloat(closingTransferAmount) || 0;
  const currentRetained = Math.max(0, currentCountedNum - currentTransferNum);

  return (
    <div className="space-y-6 pb-12">
      {/* Toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border transition-all ${
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600" />
          )}
          <span className="text-sm font-semibold">{notification.text}</span>
        </div>
      )}

      {/* Navigation Trésorerie */}
      <TreasuryNavigationTabs />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Lock className="h-6 w-6 text-amber-500" />
            Clôture de Caisse & Comptage Fin de Journée
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestion des sessions quotidiennes, calcul des écarts, transfert manuel vers le coffre et historique audité.
          </p>
        </div>

        <div>
          {activeSession ? (
            <button
              onClick={() => {
                setClosingCountedAmount(activeSession.currentTheoreticalCash.toString());
                setClosingTransferAmount(
                  Math.max(0, activeSession.currentTheoreticalCash - 20000).toString()
                );
                setIsClosingModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition cursor-pointer"
            >
              <Lock className="h-4 w-4 text-amber-400" />
              Clôturer la Session Active ({activeSession.reference})
            </button>
          ) : (
            <button
              onClick={() => setIsOpeningModalOpen(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition cursor-pointer"
            >
              <Unlock className="h-4 w-4" />
              Ouvrir une Nouvelle Session de Caisse
            </button>
          )}
        </div>
      </div>

      {/* Statut de la Session Active */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        {activeSession ? (
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                <h2 className="text-sm font-bold text-slate-900">
                  Session de Caisse Active : {activeSession.reference}
                </h2>
                <span className="text-xs text-slate-400">
                  Ouverte le {new Date(activeSession.openedAt).toLocaleDateString("fr-DZ")} à{" "}
                  {new Date(activeSession.openedAt).toLocaleTimeString("fr-DZ", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                Session Ouverte
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 uppercase block mb-1">
                  Fond d&apos;ouverture
                </span>
                <span className="font-mono font-bold text-lg text-slate-900">
                  {formatDA(activeSession.openingAmount)}
                </span>
              </div>

              <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-100">
                <span className="text-[11px] font-semibold text-emerald-700 uppercase block mb-1">
                  Encaissements Session (+)
                </span>
                <span className="font-mono font-bold text-lg text-emerald-800">
                  +{formatDA(activeSession.currentCashIn)}
                </span>
              </div>

              <div className="p-3 bg-rose-50/60 rounded-xl border border-rose-100">
                <span className="text-[11px] font-semibold text-rose-700 uppercase block mb-1">
                  Décaissements Session (-)
                </span>
                <span className="font-mono font-bold text-lg text-rose-800">
                  -{formatDA(activeSession.currentCashOut)}
                </span>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <span className="text-[11px] font-semibold text-amber-800 uppercase block mb-1">
                  Solde Théorique en Caisse
                </span>
                <span className="font-mono font-black text-xl text-amber-950">
                  {formatDA(activeSession.currentTheoreticalCash)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center">
            <Unlock className="mx-auto h-8 w-8 text-slate-300 mb-2" />
            <h3 className="text-sm font-bold text-slate-700">Aucune session de caisse n&apos;est actuellement ouverte</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Ouvrez une session de caisse pour enregistrer les encaissements en espèces et effectuer le pointage de fin de journée.
            </p>
          </div>
        )}
      </div>

      {/* Historique audité de Clôture de Caisse & Comptage Fin de Journée */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <History className="h-5 w-5 text-slate-500" />
            Historique audité de Clôture de Caisse &amp; Comptage Fin de Journée
          </h2>
          <span className="text-xs text-slate-400">
            {closedSessions.length} clôture(s) enregistrée(s)
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Session & Horodatages</th>
                  <th className="py-3 px-4 text-right">Solde Ouverture</th>
                  <th className="py-3 px-4 text-right">Théorique Calculé</th>
                  <th className="py-3 px-4 text-right">Compté Réel (Physique)</th>
                  <th className="py-3 px-4 text-right">Écart Constaté</th>
                  <th className="py-3 px-4 text-right">Transféré Coffre</th>
                  <th className="py-3 px-4 text-right">Conservé Caisse</th>
                  <th className="py-3 px-4 text-center">Statut &amp; Opérateur</th>
                  <th className="py-3 px-4 text-center">Actions &amp; Audit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closedSessions.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-400 text-xs">
                      Aucune session de caisse clôturée pour le moment.
                    </td>
                  </tr>
                ) : (
                  closedSessions.map((s) => {
                    const diff = s.difference ?? 0;
                    const hasAudit = Boolean(s.closingEditAudit);
                    const transferItem = s.transfers?.[0];
                    const isExpanded = expandedSessionId === s.id;

                    let auditRecords: Array<{
                      editedAt: string;
                      reason: string;
                      previous?: { closingAmount?: number; difference?: number };
                      next?: { closingAmount?: number; difference?: number };
                    }> = [];
                    if (s.closingEditAudit) {
                      try {
                        const parsed = JSON.parse(s.closingEditAudit);
                        auditRecords = Array.isArray(parsed) ? parsed : [parsed];
                      } catch {
                        auditRecords = [];
                      }
                    }

                    return (
                      <React.Fragment key={s.id}>
                        <tr className={`hover:bg-slate-50/80 transition ${isExpanded ? "bg-slate-50/70" : ""}`}>
                          <td className="py-3.5 px-4">
                            <div className="flex items-start gap-2">
                              <button
                                onClick={() => toggleExpand(s.id)}
                                className="p-1 mt-0.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-900 transition"
                                title="Voir les détails du comptage et audit"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-amber-600" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-slate-400" />
                                )}
                              </button>
                              <div>
                                <span className="font-mono font-bold text-slate-900 text-xs block">
                                  {s.reference}
                                </span>
                                <span className="text-[11px] font-medium text-slate-700 block">
                                  Date : {new Date(s.openedAt).toLocaleDateString("fr-DZ")}
                                </span>
                                <div className="text-[10px] text-slate-400 space-y-0.5 mt-0.5">
                                  <div>Ouv : {formatClosingDateTime(s.openedAt)}</div>
                                  <div>Clôt : {s.closedAt ? formatClosingDateTime(s.closedAt) : "-"}</div>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-600">
                            {formatDA(s.openingAmount)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-900 font-medium">
                            {formatDA(s.theoreticalAmount ?? 0)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                            {formatDA(s.closingAmount ?? 0)}
                            {hasAudit && s.originalClosingAmount !== null && s.originalClosingAmount !== s.closingAmount && (
                              <span className="block text-[10px] text-slate-400 line-through">
                                Init : {formatDA(s.originalClosingAmount ?? 0)}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-xs">
                            {diff === 0 ? (
                              <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                0 DA (Équilibré)
                              </span>
                            ) : diff > 0 ? (
                              <span className="font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                                +{formatDA(diff)} (Excédent)
                              </span>
                            ) : (
                              <span className="font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full">
                                {formatDA(diff)} (Déficit)
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-xs text-indigo-700 font-semibold">
                            {transferItem ? (
                              <div>
                                <span>{formatDA(transferItem.amount)}</span>
                                <span className="block text-[10px] text-slate-400 font-normal">
                                  → {transferItem.toAccountName}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-xs font-semibold text-slate-900">
                            {s.retainedAmount !== null && s.retainedAmount !== undefined
                              ? formatDA(s.retainedAmount)
                              : formatDA((s.closingAmount ?? 0) - (transferItem?.amount ?? 0))}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {hasAudit ? (
                                <span
                                  title="Clôture corrigée après pointage initial (audit tracé)"
                                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                                >
                                  <ShieldCheck className="h-3 w-3" />
                                  Clôturée (Auditée)
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
                                  Clôturée
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400">
                                Opérateur : Caissier / Admin
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => toggleExpand(s.id)}
                                title="Afficher/masquer les détails du comptage et audit"
                                className={`p-1.5 rounded-md transition ${isExpanded ? "bg-amber-100 text-amber-900" : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"}`}
                              >
                                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </button>
                              <button
                                onClick={() => handleOpenEdit(s)}
                                title="Corriger les montants de cette clôture (avec audit trail)"
                                className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-md transition"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => setPrintingSession(s)}
                                title="Imprimer le rapport officiel de clôture"
                                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition"
                              >
                                <Printer className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-50/90 border-b border-slate-200">
                            <td colSpan={9} className="p-4">
                              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4 shadow-xs">
                                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                                    <ShieldCheck className="h-4 w-4 text-amber-500" />
                                    Détails du comptage de fin de journée &amp; Audit — {s.reference}
                                  </h4>
                                  <span className="text-xs text-slate-500">
                                    Exercice du {new Date(s.openedAt).toLocaleDateString("fr-DZ")}
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                                  <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
                                    <div className="font-bold text-slate-700">Horodatages de Session</div>
                                    <div className="text-slate-600">Ouverture : <span className="font-mono">{formatClosingDateTime(s.openedAt)}</span></div>
                                    <div className="text-slate-600">Clôture : <span className="font-mono">{s.closedAt ? formatClosingDateTime(s.closedAt) : "En cours"}</span></div>
                                    <div className="text-slate-600">Opérateur : <span className="font-medium">Responsable Caisse / Admin</span></div>
                                  </div>
                                  <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
                                    <div className="font-bold text-slate-700">Flux financiers de la session</div>
                                    <div className="text-slate-600">Fond d&apos;ouverture : <span className="font-mono font-bold">{formatDA(s.openingAmount)}</span></div>
                                    <div className="text-emerald-700">Total Encaissements : <span className="font-mono font-bold">+{formatDA(s.totalCashIn)}</span></div>
                                    <div className="text-rose-700">Total Décaissements : <span className="font-mono font-bold">-{formatDA(s.totalCashOut)}</span></div>
                                    <div className="text-slate-900 pt-1 border-t border-slate-200">
                                      Théorique : <span className="font-mono font-bold">{formatDA(s.theoreticalAmount ?? 0)}</span> | Compté : <span className="font-mono font-bold">{formatDA(s.closingAmount ?? 0)}</span>
                                    </div>
                                  </div>
                                  <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 border border-slate-100">
                                    <div className="font-bold text-slate-700">Ventilation de Clôture</div>
                                    <div className="text-slate-600">Transféré vers Coffre : <span className="font-mono font-bold text-indigo-700">{transferItem ? `${formatDA(transferItem.amount)} (${transferItem.toAccountName})` : "0 DA"}</span></div>
                                    <div className="text-slate-600">Conservé en Caisse : <span className="font-mono font-bold">{formatDA(s.retainedAmount ?? ((s.closingAmount ?? 0) - (transferItem?.amount ?? 0)))}</span></div>
                                    <div className="text-slate-600">Statut Écart : <span className="font-bold">{diff === 0 ? "Conforme (0 DA)" : `${diff > 0 ? "+" : ""}${formatDA(diff)}`}</span></div>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                                  <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                                    <span className="font-bold text-slate-700 block mb-1">Notes &amp; Observations de comptage :</span>
                                    <p className="text-slate-600 italic">
                                      {s.closingNotes ? s.closingNotes : "Aucune observation saisie lors du comptage de fin de journée."}
                                    </p>
                                    {s.openingNotes && (
                                      <p className="text-slate-500 text-[11px] mt-2">
                                        <span className="font-semibold">Note d&apos;ouverture :</span> {s.openingNotes}
                                      </p>
                                    )}
                                  </div>
                                  <div className="p-3 bg-slate-50/80 rounded-lg border border-slate-100">
                                    <span className="font-bold text-slate-700 block mb-1">Historique d&apos;Audit &amp; Traçabilité :</span>
                                    {auditRecords.length > 0 ? (
                                      <div className="space-y-1.5">
                                        {auditRecords.map((a, aIdx) => (
                                          <div key={aIdx} className="text-[11px] p-2 bg-amber-50 rounded border border-amber-200 text-amber-950">
                                            <span className="font-bold block">Correction le {formatClosingDateTime(a.editedAt)}</span>
                                            <span>Motif : {a.reason}</span>
                                            {a.previous?.closingAmount !== undefined && a.next?.closingAmount !== undefined && (
                                              <span className="block text-[10px] text-amber-800">
                                                Ancien comptage : {formatDA(a.previous.closingAmount)} → Nouveau comptage : {formatDA(a.next.closingAmount)}
                                              </span>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-slate-500 italic text-[11px]">
                                        Clôture originale validée lors du comptage initial. Aucune modification postérieure.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal : Ouvrir une session */}
      {isOpeningModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Unlock className="h-5 w-5 text-amber-500" />
                Ouverture de Caisse Quotidienne
              </h3>
              <button
                onClick={() => setIsOpeningModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleOpenSession} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fond de caisse initial (DA) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  required
                  placeholder="Ex: 20000"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observations d&apos;ouverture
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Reprise fond de caisse veille, monnaie d'appoint..."
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsOpeningModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Ouverture..." : "Ouvrir la Caisse"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Clôturer la Session Active */}
      {isClosingModalOpen && activeSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Lock className="h-5 w-5 text-amber-500" />
                Clôture de Session : {activeSession.reference}
              </h3>
              <button
                onClick={() => setIsClosingModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCloseSession} className="mt-4 space-y-4">
              {/* Pointage physique */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-600">Solde théorique calculé :</span>
                  <strong className="font-mono text-slate-900 text-sm">
                    {formatDA(activeSession.currentTheoreticalCash)}
                  </strong>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Espèces physiques comptées dans le tiroir (DA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={closingCountedAmount}
                    onChange={(e) => setClosingCountedAmount(e.target.value)}
                    className="w-full text-base font-mono font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200">
                  <span className="text-slate-600">Écart de caisse constaté :</span>
                  <span
                    className={`font-mono font-bold ${
                      currentDiff === 0
                        ? "text-emerald-700"
                        : currentDiff > 0
                        ? "text-blue-700"
                        : "text-rose-700"
                    }`}
                  >
                    {currentDiff === 0
                      ? "0 DA (Caisse exacte)"
                      : currentDiff > 0
                      ? `+${formatDA(currentDiff)} (Excédent)`
                      : `${formatDA(currentDiff)} (Déficit)`}
                  </span>
                </div>
              </div>

              {/* Transfert Fin de Journée */}
              <div className="p-3.5 bg-amber-50/60 border border-amber-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-amber-700" />
                  <span className="text-xs font-bold text-amber-950 uppercase tracking-wide">
                    Transfert Manuel de Sécurisation vers le Coffre
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Montant transféré (DA)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={currentCountedNum}
                      step="any"
                      value={closingTransferAmount}
                      onChange={(e) => setClosingTransferAmount(e.target.value)}
                      className="w-full text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Coffre Récepteur
                    </label>
                    <select
                      value={closingTransferDestId}
                      onChange={(e) => setClosingTransferDestId(e.target.value)}
                      className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-900"
                    >
                      {safeAccounts.map((a) => (
                        <option key={a.id} value={a.id.toString()}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-between items-center text-xs text-amber-900 pt-1 border-t border-amber-200/80">
                  <span>Espèces conservées en caisse (Fond pour demain) :</span>
                  <strong className="font-mono text-sm text-amber-950">
                    {formatDA(currentRetained)}
                  </strong>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observations de clôture
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes ou explications sur la journée..."
                  value={closingNotes}
                  onChange={(e) => setClosingNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsClosingModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Clôture en cours..." : "Valider la Clôture"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Correction Temporaire d'une Clôture */}
      {editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Edit2 className="h-5 w-5 text-amber-500" />
                  Corriger la Clôture : {editingSession.reference}
                </h3>
                <span className="text-xs text-slate-400">
                  Correction temporaire autorisée avec journal d&apos;audit complet.
                </span>
              </div>
              <button
                onClick={() => setEditingSession(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateClosing} className="mt-4 space-y-4">
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1 text-xs text-amber-950">
                <p>
                  Solde théorique : <strong>{formatDA(editingSession.theoreticalAmount ?? 0)}</strong>
                </p>
                <p>
                  Comptage original : <strong>{formatDA(editingSession.originalClosingAmount ?? editingSession.closingAmount ?? 0)}</strong>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Nouveau montant physique (DA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={editCountedAmount}
                    onChange={(e) => setEditCountedAmount(e.target.value)}
                    className="w-full text-sm font-mono font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nouveau montant transféré coffre (DA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={editTransferAmount}
                    onChange={(e) => setEditTransferAmount(e.target.value)}
                    className="w-full text-sm font-mono font-bold bg-white border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Coffre Destination
                </label>
                <select
                  value={editTransferDestId}
                  onChange={(e) => setEditTransferDestId(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-900"
                >
                  {safeAccounts.map((a) => (
                    <option key={a.id} value={a.id.toString()}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motif obligatoire de la correction (Audit) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Erreur de comptage initial constatée après réouverture du tiroir..."
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Correction..." : "Enregistrer la Correction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Closing Report */}
      {printingSession && (
        <PrintableCashClosingReport
          session={{
            id: printingSession.id,
            reference: printingSession.reference,
            openedAt: printingSession.openedAt,
            closedAt: printingSession.closedAt || null,
            status: printingSession.status || "closed",
            openingAmount: printingSession.openingAmount,
            totalCashIn: printingSession.totalCashIn,
            totalCashOut: printingSession.totalCashOut,
            theoreticalAmount: printingSession.theoreticalAmount ?? null,
            closingAmount: printingSession.closingAmount ?? null,
            difference: printingSession.difference ?? null,
            openingNotes: printingSession.openingNotes || null,
            closingNotes: printingSession.closingNotes || null,
          }}
          settings={data.settings}
          onClose={() => setPrintingSession(null)}
        />
      )}
    </div>
  );
}
