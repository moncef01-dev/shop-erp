"use client";

import React, { useState } from "react";
import {
  HandCoins,
  PlusCircle,
  RotateCcw,
  CheckCircle2,
  Calendar,
  Building2,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
} from "lucide-react";
import { SupplierAdditionalPaymentReversalModal } from "./SupplierAdditionalPaymentReversalModal";

export interface SupplierAdditionalPaymentHistoryItem {
  id: number;
  reference: string;
  amount: number;
  date: Date | string;
  paymentMethod: string;
  status: string;
  notes: string | null;
  description: string | null;
  isReversal: boolean;
  reversedAt: Date | string | null;
  reversalReason: string | null;
  sessionId: number | null;
  treasuryAccount: {
    id: number;
    name: string;
    code: string;
    type: string;
  };
  session?: {
    id: number;
    reference: string;
    status: string;
  } | null;
  reversal?: {
    id: number;
    reference: string;
    date: Date | string;
    createdAt: Date | string;
    reversalReason: string | null;
  } | null;
  reversalOf?: {
    id: number;
    reference: string;
  } | null;
}

interface SupplierAdditionalPaymentSectionProps {
  supplierId: number;
  supplierName: string;
  totalGiven: number;
  history: SupplierAdditionalPaymentHistoryItem[];
  onOpenNewModal: () => void;
  onRefresh: () => void;
}

export function SupplierAdditionalPaymentSection({
  supplierName,
  totalGiven,
  history,
  onOpenNewModal,
  onRefresh,
}: SupplierAdditionalPaymentSectionProps) {
  const [selectedForReversal, setSelectedForReversal] = useState<{
    id: number;
    reference: string;
    amount: number;
    date: string;
    supplierName: string;
    accountName: string;
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
      <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-slate-50 border border-indigo-200/80 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 bg-indigo-600 text-white rounded-xl shadow-md shadow-indigo-600/20">
              <HandCoins className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Versements Supplémentaires (Hors Dette)</h3>
                <span className="px-2 py-0.5 text-[11px] font-bold bg-indigo-100 text-indigo-800 rounded-full border border-indigo-200">
                  Total cumulé net
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-xl">
                Fonds sortis de la trésorerie et versés à <strong>{supplierName}</strong>. Ces montants n&apos;ont jamais
                été déduits de la dette fournisseur et demeurent suivis sur leur propre registre d&apos;audit.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="bg-white px-5 py-3 rounded-xl border border-indigo-200 shadow-xs text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">Argent versé au fournisseur</div>
              <div className="text-2xl font-black text-indigo-900 tracking-tight">
                {totalGiven.toLocaleString("fr-DZ")} <span className="text-sm font-bold text-indigo-500">DA</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onOpenNewModal}
              className="px-4 py-3 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-2 transition shrink-0"
            >
              <PlusCircle className="h-4 w-4" />
              Nouveau versement
            </button>
          </div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-slate-900">Historique chronologique des versements</h4>
            <span className="px-2 py-0.5 text-xs font-semibold bg-slate-200/70 text-slate-700 rounded-full">
              {history.length} {history.length > 1 ? "opérations" : "opération"}
            </span>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex p-3 bg-indigo-50 text-indigo-600 rounded-full mb-3">
              <Info className="h-6 w-6" />
            </div>
            <h5 className="text-sm font-bold text-slate-800">Aucun versement supplémentaire enregistré</h5>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-4">
              Ce fournisseur n&apos;a reçu aucun versement hors dette à ce jour. Vous pouvez donner de l&apos;argent depuis
              le bouton ci-dessus.
            </p>
            <button
              type="button"
              onClick={onOpenNewModal}
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition"
            >
              <PlusCircle className="h-4 w-4" />
              Donner de l&apos;argent au fournisseur
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-slate-600 uppercase tracking-wider font-semibold text-[11px]">
                  <th className="py-3 px-4">Date & Réf.</th>
                  <th className="py-3 px-4">Type & Description</th>
                  <th className="py-3 px-4">Compte source</th>
                  <th className="py-3 px-4 text-right">Montant</th>
                  <th className="py-3 px-4 text-center">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((item) => {
                  const isRev = item.isReversal;
                  const isCancelled = item.status === "reversed" || Boolean(item.reversedAt);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isRev ? "bg-purple-50/30" : isCancelled ? "bg-slate-50/50 opacity-80" : ""
                      }`}
                    >
                      {/* Date & Ref */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900">{item.reference}</div>
                        <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          {formatDate(item.date)}
                        </div>
                      </td>

                      {/* Description & Type */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 font-medium text-slate-900">
                          {isRev ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 bg-purple-100 text-purple-800 rounded-md">
                              <ArrowDownLeft className="h-3 w-3 text-purple-700" />
                              Contrepassation
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-md">
                              <ArrowUpRight className="h-3 w-3 text-indigo-700" />
                              Versement
                            </span>
                          )}
                          <span className="text-xs truncate max-w-xs">{item.description}</span>
                        </div>
                        {item.notes && <div className="text-[11px] text-slate-500 mt-0.5 italic">{item.notes}</div>}
                        {item.reversalReason && (
                          <div className="text-[11px] text-rose-600 mt-0.5 font-medium">
                            Motif annulation : {item.reversalReason}
                          </div>
                        )}
                        {item.reversal && (
                          <div className="text-[11px] text-purple-700 mt-0.5 font-semibold">
                            Annulé par : {item.reversal.reference}
                          </div>
                        )}
                        {item.reversalOf && (
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Annule le versement : {item.reversalOf.reference}
                          </div>
                        )}
                      </td>

                      {/* Compte source */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-slate-400" />
                          {item.treasuryAccount.name}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Code : {item.treasuryAccount.code} • Mode : {item.paymentMethod.toUpperCase()}
                        </div>
                        {item.session && (
                          <div className="text-[10px] text-emerald-700 font-medium">
                            Session Caisse : {item.session.reference}
                          </div>
                        )}
                      </td>

                      {/* Montant */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span
                          className={`font-mono text-sm font-bold ${
                            isRev
                              ? "text-emerald-700"
                              : isCancelled
                              ? "line-through text-slate-400"
                              : "text-indigo-700"
                          }`}
                        >
                          {isRev ? "+" : "-"}
                          {item.amount.toLocaleString("fr-DZ")} DA
                        </span>
                      </td>

                      {/* Statut */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {isCancelled ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            Annulé
                          </span>
                        ) : isRev ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            Restitué
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Validé
                          </span>
                        )}
                      </td>

                      {/* Action Annulation */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {!isRev && !isCancelled && (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedForReversal({
                                id: item.id,
                                reference: item.reference,
                                amount: item.amount,
                                date: formatDate(item.date),
                                supplierName,
                                accountName: item.treasuryAccount.name,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-rose-700 hover:text-white hover:bg-rose-600 bg-rose-50 border border-rose-200 rounded-lg transition"
                          >
                            <RotateCcw className="h-3 w-3" />
                            Annuler
                          </button>
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

      {/* Reversal Modal Mount */}
      {selectedForReversal && (
        <SupplierAdditionalPaymentReversalModal
          isOpen={true}
          onClose={() => setSelectedForReversal(null)}
          onSuccess={() => {
            setSelectedForReversal(null);
            onRefresh();
          }}
          payment={selectedForReversal}
        />
      )}
    </div>
  );
}
