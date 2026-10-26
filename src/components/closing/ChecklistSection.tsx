"use client";

import React, { useState, useTransition } from "react";
import {
  MonthlyClosingChecklistItem,
  ChecklistStatus,
} from "@/app/closing/monthly/types";
import { updateChecklistItemAction } from "@/app/closing/monthly/actions";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  MinusCircle,
  Save,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ChecklistSectionProps {
  month: string;
  checklist: MonthlyClosingChecklistItem[];
  onRefresh?: () => void;
}

export function ChecklistSection({ month, checklist: initialChecklist }: ChecklistSectionProps) {
  const [items, setItems] = useState<MonthlyClosingChecklistItem[]>(initialChecklist);
  const [editingNotes, setEditingNotes] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    initialChecklist.forEach((i) => {
      map[i.key] = i.note || "";
    });
    return map;
  });
  const [isPending, startTransition] = useTransition();
  const [activeItemKey, setActiveItemKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ key: string; msg: string; err?: boolean } | null>(null);

  const total = items.length;
  const validated = items.filter((i) => i.status === "VALIDATED").length;
  const discrepancies = items.filter((i) => i.status === "DISCREPANCY").length;
  const pending = items.filter((i) => i.status === "PENDING").length;
  const notApplicable = items.filter((i) => i.status === "NOT_APPLICABLE").length;

  const percent = total > 0 ? Math.round(((validated + notApplicable) / total) * 100) : 0;

  const handleStatusChange = (key: string, newStatus: ChecklistStatus) => {
    setActiveItemKey(key);
    const note = editingNotes[key] || "";

    startTransition(async () => {
      const res = await updateChecklistItemAction(month, key, newStatus, note, "Opérateur");
      if (res.success) {
        setItems((prev) =>
          prev.map((it) =>
            it.key === key
              ? {
                  ...it,
                  status: newStatus,
                  note: note.trim() || null,
                  checkedBy: "Opérateur",
                  checkedAt: new Date().toISOString(),
                }
              : it
          )
        );
        setFeedback({ key, msg: "Statut enregistré" });
      } else {
        setFeedback({ key, msg: res.error || "Erreur", err: true });
      }
      setTimeout(() => setFeedback(null), 3000);
      setActiveItemKey(null);
    });
  };

  const handleSaveNote = (key: string) => {
    setActiveItemKey(key);
    const item = items.find((i) => i.key === key);
    const currentStatus = item?.status || "PENDING";
    const note = editingNotes[key] || "";

    startTransition(async () => {
      const res = await updateChecklistItemAction(month, key, currentStatus, note, "Opérateur");
      if (res.success) {
        setItems((prev) =>
          prev.map((it) =>
            it.key === key ? { ...it, note: note.trim() || null } : it
          )
        );
        setFeedback({ key, msg: "Note enregistrée" });
      } else {
        setFeedback({ key, msg: res.error || "Erreur", err: true });
      }
      setTimeout(() => setFeedback(null), 3000);
      setActiveItemKey(null);
    });
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
      {/* En-tête de la checklist avec indicateurs de progression */}
      <div className="p-6 border-b border-slate-200 bg-linear-to-r from-slate-50 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-amber-500" />
              <h3 className="text-lg font-bold text-slate-900">
                Grille de Pointage & Réconciliation Mensuelle
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Les 10 contrôles obligatoires de fin de mois. La validation doit être explicite par l&apos;opérateur.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-2xl font-black text-slate-900">{percent}%</span>
              <p className="text-[11px] text-slate-500 font-medium">Contrôles achevés</p>
            </div>
            <div className="w-24 bg-slate-200 h-2.5 rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  percent === 100
                    ? "bg-emerald-500"
                    : discrepancies > 0
                    ? "bg-rose-500"
                    : "bg-amber-500"
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Badges de comptage */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200/60">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-emerald-900">{validated} Validé(s)</p>
              <p className="text-[10px] text-emerald-700">Contrôles conformes</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200/60">
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-900">{pending} À vérifier</p>
              <p className="text-[10px] text-amber-700">En attente de pointage</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200/60">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <div>
              <p className="text-xs font-bold text-rose-900">{discrepancies} Écart(s)</p>
              <p className="text-[10px] text-rose-700">Divergences à justifier</p>
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200">
            <MinusCircle className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-slate-700">{notApplicable} Non applicable</p>
              <p className="text-[10px] text-slate-500">Hors périmètre</p>
            </div>
          </div>
        </div>
      </div>

      {/* Liste des 10 contrôles */}
      <div className="divide-y divide-slate-100">
        {items.map((item, index) => {
          const isItemActive = isPending && activeItemKey === item.key;
          const currentNote = editingNotes[item.key] ?? "";
          const hasUnsavedNote = currentNote.trim() !== (item.note || "").trim();

          return (
            <div
              key={item.key}
              className={cn(
                "p-5 sm:p-6 transition-colors",
                item.status === "VALIDATED" && "bg-emerald-50/15",
                item.status === "DISCREPANCY" && "bg-rose-50/20",
                item.status === "PENDING" && "hover:bg-slate-50/60"
              )}
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                {/* Description du contrôle */}
                <div className="space-y-1 max-w-2xl">
                  <div className="flex items-center gap-2.5">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
                      {index + 1}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">{item.label}</h4>
                  </div>
                  <p className="text-xs text-slate-600 pl-8 leading-relaxed">
                    {item.description}
                  </p>
                  {item.checkedAt && (
                    <p className="text-[11px] text-slate-400 pl-8">
                      Dernier pointage par <span className="font-semibold text-slate-600">{item.checkedBy || "Opérateur"}</span> le{" "}
                      {new Date(item.checkedAt).toLocaleString("fr-DZ")}
                    </p>
                  )}
                </div>

                {/* Sélecteur de statut à 4 options */}
                <div className="flex flex-wrap items-center gap-1.5 shrink-0 pl-8 lg:pl-0">
                  <button
                    type="button"
                    disabled={isItemActive}
                    onClick={() => handleStatusChange(item.key, "PENDING")}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                      item.status === "PENDING"
                        ? "bg-amber-500 text-slate-950 border-amber-600 shadow-xs font-bold"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    À vérifier
                  </button>

                  <button
                    type="button"
                    disabled={isItemActive}
                    onClick={() => handleStatusChange(item.key, "VALIDATED")}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1",
                      item.status === "VALIDATED"
                        ? "bg-emerald-600 text-white border-emerald-700 shadow-xs font-bold"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300"
                    )}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Validé
                  </button>

                  <button
                    type="button"
                    disabled={isItemActive}
                    onClick={() => handleStatusChange(item.key, "DISCREPANCY")}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border flex items-center gap-1",
                      item.status === "DISCREPANCY"
                        ? "bg-rose-600 text-white border-rose-700 shadow-xs font-bold"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-300"
                    )}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Écart à résoudre
                  </button>

                  <button
                    type="button"
                    disabled={isItemActive}
                    onClick={() => handleStatusChange(item.key, "NOT_APPLICABLE")}
                    className={cn(
                      "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                      item.status === "NOT_APPLICABLE"
                        ? "bg-slate-700 text-white border-slate-800 shadow-xs font-bold"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    Non applicable
                  </button>
                </div>
              </div>

              {/* Zone d'observation / Note facultative */}
              <div className="mt-3 pl-8">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                      <MessageSquare className="w-3.5 h-3.5" />
                    </div>
                    <input
                      type="text"
                      value={currentNote}
                      placeholder="Observation, justificatif ou note de rapprochement (facultatif)..."
                      onChange={(e) =>
                        setEditingNotes((prev) => ({
                          ...prev,
                          [item.key]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSaveNote(item.key);
                        }
                      }}
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-amber-500 focus:border-amber-500 text-slate-800 placeholder:text-slate-400"
                    />
                  </div>

                  {hasUnsavedNote && (
                    <button
                      type="button"
                      disabled={isItemActive}
                      onClick={() => handleSaveNote(item.key)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors shrink-0"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Enregistrer note
                    </button>
                  )}

                  {feedback?.key === item.key && (
                    <span
                      className={cn(
                        "text-xs font-semibold",
                        feedback.err ? "text-rose-600" : "text-emerald-600"
                      )}
                    >
                      {feedback.msg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
