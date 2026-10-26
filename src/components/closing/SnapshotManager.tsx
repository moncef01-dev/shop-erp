"use client";

import React, { useState, useTransition } from "react";
import {
  MonthlyClosingSnapshotItem,
  MonthlyClosingTotals,
  MonthlyClosingChecklistItem,
} from "@/app/closing/monthly/types";
import {
  createMonthlyClosingSnapshotAction,
  updateSnapshotStatusAction,
} from "@/app/closing/monthly/actions";
import {
  Camera,
  Archive,
  FileCheck,
  FileClock,
  Printer,
  ShieldAlert,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SnapshotManagerProps {
  month: string;
  monthLabel: string;
  snapshots: MonthlyClosingSnapshotItem[];
  currentTotals: MonthlyClosingTotals;
  currentChecklist: MonthlyClosingChecklistItem[];
  onViewSnapshot: (snapshot: MonthlyClosingSnapshotItem) => void;
  onRefresh: () => void;
}

export function SnapshotManager({
  month,
  monthLabel,
  snapshots,
  onViewSnapshot,
  onRefresh,
}: SnapshotManagerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [snapshotStatus, setSnapshotStatus] = useState<"DRAFT" | "FINAL">("DRAFT");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [operatorName, setOperatorName] = useState("Opérateur");
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCreateSnapshot = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await createMonthlyClosingSnapshotAction(
        month,
        snapshotStatus,
        title || undefined,
        notes || undefined,
        operatorName || "Opérateur"
      );

      if (res.success) {
        setSuccessMsg(`Instantané ${res.reference} sauvegardé avec succès.`);
        setIsModalOpen(false);
        setTitle("");
        setNotes("");
        onRefresh();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setError(res.error || "Erreur lors de la création de l'instantané.");
      }
    });
  };

  const handleStatusChange = (snapshotId: number, newStatus: "DRAFT" | "FINAL" | "ARCHIVED") => {
    startTransition(async () => {
      const res = await updateSnapshotStatusAction(snapshotId, newStatus);
      if (res.success) {
        onRefresh();
      } else {
        alert(res.error || "Erreur");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Bandeau d'action et explications */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-amber-500" />
            <h3 className="text-base font-bold text-slate-900">
              Instantanés de Clôture Figés & Piste d&apos;Audit
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Un instantané enregistre une copie immuable de l&apos;état financier, de l&apos;inventaire et de la checklist.
            Les futures écritures n&apos;affecteront jamais un instantané enregistré.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-sm shadow-xs transition-colors shrink-0"
        >
          <Camera className="w-4 h-4" />
          Figer un Instantané ({monthLabel})
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Liste des instantanés existants */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between">
          <h4 className="text-sm font-bold text-slate-800">
            Historique des Instantanés — {monthLabel} ({snapshots.length})
          </h4>
          <span className="text-[11px] text-slate-500">Immuabilité garantie</span>
        </div>

        {snapshots.length === 0 ? (
          <div className="p-10 text-center text-slate-400">
            <Camera className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">Aucun instantané enregistré pour ce mois</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Vous pouvez figer un premier instantané à tout moment pour archiver la situation sans modifier les transactions.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {snapshots.map((snap) => {
              const validatedInSnap = snap.checklist.filter((c) => c.status === "VALIDATED").length;
              const dateFormatted = new Date(snap.generatedAt).toLocaleString("fr-DZ", {
                timeZone: "Africa/Algiers",
              });

              return (
                <div key={snap.id} className="p-5 hover:bg-slate-50/50 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-bold text-sm text-slate-900">{snap.reference}</span>
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase",
                          snap.status === "FINAL"
                            ? "bg-emerald-100 text-emerald-800"
                            : snap.status === "ARCHIVED"
                            ? "bg-slate-200 text-slate-700"
                            : "bg-amber-100 text-amber-900"
                        )}
                      >
                        {snap.status === "FINAL" ? "Définitif" : snap.status === "ARCHIVED" ? "Archivé" : "Provisoire"}
                      </span>
                      <span className="text-xs text-slate-400">Version {snap.version}</span>
                    </div>

                    <p className="text-xs font-medium text-slate-800">{snap.title}</p>
                    <p className="text-[11px] text-slate-500">
                      Généré le {dateFormatted} par <span className="font-semibold">{snap.generatedBy || "Opérateur"}</span> | Pointage : {validatedInSnap}/10 contrôles validés
                    </p>
                    {snap.notes && (
                      <p className="text-[11px] text-slate-600 italic bg-slate-50 p-1.5 rounded-md border border-slate-100 mt-1">
                        &quot;{snap.notes}&quot;
                      </p>
                    )}
                  </div>

                  {/* Actions sur l'instantané */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onViewSnapshot(snap)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold rounded-lg text-xs transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      Visualiser & Imprimer
                    </button>

                    {snap.status === "DRAFT" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleStatusChange(snap.id, "FINAL")}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition-colors"
                        title="Marquer comme définitif"
                      >
                        <FileCheck className="w-3.5 h-3.5" />
                        Passer en Définitif
                      </button>
                    )}

                    {snap.status === "FINAL" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleStatusChange(snap.id, "ARCHIVED")}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors"
                        title="Archiver"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Archiver
                      </button>
                    )}

                    {snap.status === "ARCHIVED" && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleStatusChange(snap.id, "FINAL")}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-colors"
                        title="Restaurer le statut définitif"
                      >
                        <FileClock className="w-3.5 h-3.5" />
                        Restaurer Définitif
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DE CRÉATION DE SNAPSHOT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Générer un Instantané de Clôture
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSnapshot} className="p-6 space-y-4">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p>
                  <strong>Phase 1 (Revue seule) :</strong> La génération d&apos;un instantané ne verrouille pas le mois,
                  ne bloque aucune opération et ne modifie aucune écriture financière ou stock.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Mois sélectionné
                </label>
                <input
                  type="text"
                  disabled
                  value={`${monthLabel} (${month})`}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Statut de l&apos;instantané
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSnapshotStatus("DRAFT")}
                    className={cn(
                      "px-3 py-2 text-xs font-bold rounded-lg border text-center transition-all",
                      snapshotStatus === "DRAFT"
                        ? "bg-amber-500 text-slate-950 border-amber-600 shadow-xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    Provisoire (Brouillon)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSnapshotStatus("FINAL")}
                    className={cn(
                      "px-3 py-2 text-xs font-bold rounded-lg border text-center transition-all",
                      snapshotStatus === "FINAL"
                        ? "bg-emerald-600 text-white border-emerald-700 shadow-xs"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    Définitif (Arrêté)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Intitulé de l&apos;instantané (facultatif)
                </label>
                <input
                  type="text"
                  placeholder={`Clôture Mensuelle ${monthLabel}`}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nom de l&apos;opérateur / gestionnaire
                </label>
                <input
                  type="text"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notes ou observations de synthèse (facultatif)
                </label>
                <textarea
                  rows={3}
                  placeholder="Observations sur les écarts, inventaire ou décisions de gestion..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                />
              </div>

              {error && (
                <p className="text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                  {error}
                </p>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs shadow-xs transition-colors"
                >
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Figer l&apos;instantané
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
