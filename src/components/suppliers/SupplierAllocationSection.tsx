"use client";

import React, { useState } from "react";
import {
  PlusCircle,
  RotateCcw,
  CheckCircle2,
  Calendar,
  ArrowDownToLine,
  Info,
} from "lucide-react";
import { SupplierAllocationReversalModal } from "./SupplierAllocationReversalModal";

export interface SupplierAllocationHistoryItem {
  id: number;
  reference: string;
  paymentId: number;
  supplierId: number;
  purchaseId: number | null;
  supplierDebtId: number | null;
  amount: number;
  date: Date | string;
  status: string;
  notes: string | null;
  description: string | null;
  isReversal: boolean;
  reversedAt: Date | string | null;
  reversalReason: string | null;
  payment?: {
    id: number;
    reference: string;
    amount: number;
    date: Date | string;
  } | null;
  purchase?: {
    id: number;
    reference: string;
    totalAmount: number;
    paidAmount: number;
  } | null;
  reversal?: {
    id: number;
    reference: string;
    date: Date | string;
    reversalReason: string | null;
  } | null;
  reversalOf?: {
    id: number;
    reference: string;
  } | null;
}

interface SupplierAllocationSectionProps {
  supplierId: number;
  supplierName: string;
  totalGiven: number;
  totalAllocated: number;
  unallocatedAmount: number;
  history: SupplierAllocationHistoryItem[];
  onOpenNewModal: () => void;
  onRefresh: () => void;
}

export function SupplierAllocationSection({
  supplierName,
  totalGiven,
  totalAllocated,
  unallocatedAmount,
  history,
  onOpenNewModal,
  onRefresh,
}: SupplierAllocationSectionProps) {
  const [selectedForReversal, setSelectedForReversal] = useState<{
    id: number;
    reference: string;
    amount: number;
    date: string;
    supplierName: string;
    paymentReference: string;
    purchaseReference?: string | null;
  } | null>(null);

  const formatDate = (val: Date | string) => {
    try {
      const d = new Date(val);
      return d.toLocaleDateString("fr-DZ", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return String(val);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-gradient-to-r from-purple-50 via-indigo-50 to-slate-50 border border-purple-200/80 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-purple-700 text-white rounded-xl shadow-md shadow-purple-700/20">
              <ArrowDownToLine className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Imputations des Versements Supplémentaires sur Dette
                </h3>
                <span className="px-2 py-0.5 text-[11px] font-bold bg-purple-100 text-purple-800 rounded-full border border-purple-200">
                  Reclassement sans flux de trésorerie
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-xl">
                Affectation des versements déjà remis à <strong>{supplierName}</strong> pour réduire sa dette.
                Cette opération ne crée aucun décaissement supplémentaire et n&apos;impacte pas la trésorerie.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Total versé hors dette</div>
              <div className="text-xl font-black text-slate-900 tracking-tight">
                {totalGiven.toLocaleString("fr-DZ")} <span className="text-xs font-bold text-slate-500">DA</span>
              </div>
            </div>

            <div className="bg-white px-4 py-2.5 rounded-xl border border-purple-200 shadow-xs text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-purple-700">Total déjà imputé</div>
              <div className="text-xl font-black text-purple-900 tracking-tight">
                {totalAllocated.toLocaleString("fr-DZ")} <span className="text-xs font-bold text-purple-500">DA</span>
              </div>
            </div>

            <div className="bg-white px-4 py-2.5 rounded-xl border border-indigo-200 shadow-xs text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Solde disponible à imputer</div>
              <div className="text-xl font-black text-indigo-900 tracking-tight">
                {unallocatedAmount.toLocaleString("fr-DZ")} <span className="text-xs font-bold text-indigo-500">DA</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenNewModal}
              className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-purple-700/20 flex items-center gap-2 transition shrink-0 cursor-pointer"
            >
              <PlusCircle className="h-4 w-4" />
              Imputer un versement
            </button>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-900">Historique chronologique des imputations</h4>
            <span className="px-2 py-0.5 text-xs font-semibold bg-slate-200/70 text-slate-700 rounded-full">
              {history.length} {history.length > 1 ? "opérations" : "opération"}
            </span>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex p-3 bg-purple-50 text-purple-600 rounded-full mb-3">
              <Info className="h-6 w-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">Aucune imputation enregistrée</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Utilisez le bouton &laquo; Imputer un versement &raquo; pour affecter un versement supplémentaire disponible
              afin de réduire la dette de ce fournisseur.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Réf. Imputation</th>
                  <th className="py-3 px-4">Versement Source</th>
                  <th className="py-3 px-4">Affectation / Achat</th>
                  <th className="py-3 px-4 text-right">Montant Imputé</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4">Observation</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((item) => {
                  const isReversalComp = item.isReversal;
                  const isOriginalReversed = item.status === "reversed";
                  const isCompleted = item.status === "completed" && !item.isReversal;

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isReversalComp
                          ? "bg-rose-50/30"
                          : isOriginalReversed
                          ? "bg-slate-50/60 opacity-75"
                          : ""
                      }`}
                    >
                      <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          <span>{formatDate(item.date)}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                        {item.reference}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.payment ? (
                          <span className="font-mono font-semibold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                            {item.payment.reference}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {item.purchase ? (
                          <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            Achat {item.purchase.reference}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-medium">Dette globale</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`font-mono font-bold text-sm ${
                            isReversalComp
                              ? "text-rose-700 line-through"
                              : isOriginalReversed
                              ? "text-slate-500 line-through"
                              : "text-purple-700"
                          }`}
                        >
                          {item.amount.toLocaleString("fr-DZ")} DA
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isCompleted && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Imputé
                          </span>
                        )}
                        {isOriginalReversed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700 border border-slate-300">
                            Annulé
                          </span>
                        )}
                        {isReversalComp && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <RotateCcw className="h-3 w-3" />
                            Contrepassation
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate text-slate-600">
                        {item.reversalReason ? (
                          <span className="text-rose-700 font-medium italic">
                            Motif : {item.reversalReason}
                          </span>
                        ) : (
                          item.description || item.notes || "—"
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {isCompleted && (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedForReversal({
                                id: item.id,
                                reference: item.reference,
                                amount: item.amount,
                                date: formatDate(item.date),
                                supplierName,
                                paymentReference: item.payment?.reference || "Versement",
                                purchaseReference: item.purchase?.reference || null,
                              })
                            }
                            title="Annuler cette imputation et rétablir la dette"
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Annuler
                          </button>
                        )}
                        {(isOriginalReversed || isReversalComp) && (
                          <span className="text-[11px] text-slate-400 italic">Clôturé</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal d'annulation */}
      {selectedForReversal && (
        <SupplierAllocationReversalModal
          isOpen={Boolean(selectedForReversal)}
          onClose={() => setSelectedForReversal(null)}
          onSuccess={() => {
            setSelectedForReversal(null);
            onRefresh();
          }}
          allocation={selectedForReversal}
        />
      )}
    </div>
  );
}
