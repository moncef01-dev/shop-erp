"use client";

import React, { useState } from "react";
import {
  RotateCcw,
  AlertTriangle,
  Loader2,
  X,
  ShieldAlert,
} from "lucide-react";
import { reverseSupplierAdditionalPaymentAllocationAction } from "@/app/suppliers/allocation-actions";

interface SupplierAllocationReversalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (data: unknown) => void;
  allocation: {
    id: number;
    reference: string;
    amount: number;
    date: Date | string;
    supplierName: string;
    paymentReference: string;
    purchaseReference?: string | null;
  } | null;
}

export function SupplierAllocationReversalModal({
  isOpen,
  onClose,
  onSuccess,
  allocation,
}: SupplierAllocationReversalModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  if (!isOpen || !allocation) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason || reason.trim().length < 5) {
      setError("Un motif explicatif d'au moins 5 caractères est obligatoire.");
      return;
    }

    setLoading(true);
    try {
      const res = await reverseSupplierAdditionalPaymentAllocationAction({
        allocationId: allocation.id,
        reason: reason.trim(),
        idempotencyKey,
      });

      if (!res.success) {
        setError(res.error || "Une erreur est survenue lors de l'annulation.");
        return;
      }

      onSuccess(res.data);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-rose-700 via-rose-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs border border-white/15">
              <RotateCcw className="h-6 w-6 text-rose-200" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight">Annuler une imputation sur dette</h2>
              <p className="text-xs text-rose-200 font-medium">Réf : {allocation.reference}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Conséquence de l&apos;annulation :</span> Le montant de{" "}
            <strong>{allocation.amount.toLocaleString("fr-DZ")} DA</strong> sera réintégré dans la dette du
            fournisseur, et le solde disponible du versement{" "}
            <strong>{allocation.paymentReference}</strong> sera restauré. Aucun impact en trésorerie.
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs">
            <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-medium">{error}</div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5 text-slate-700">
            <div className="flex justify-between">
              <span>Fournisseur :</span>
              <strong className="text-slate-900">{allocation.supplierName}</strong>
            </div>
            <div className="flex justify-between">
              <span>Versement source :</span>
              <strong className="text-slate-900">{allocation.paymentReference}</strong>
            </div>
            {allocation.purchaseReference && (
              <div className="flex justify-between">
                <span>Commande liée :</span>
                <strong className="text-slate-900">{allocation.purchaseReference}</strong>
              </div>
            )}
            <div className="flex justify-between pt-1 border-t border-slate-200">
              <span className="font-semibold text-rose-700">Montant de l&apos;imputation :</span>
              <strong className="font-mono text-sm text-rose-800">
                {allocation.amount.toLocaleString("fr-DZ")} DA
              </strong>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Motif explicatif de l&apos;annulation <span className="text-rose-600">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Erreur d'affectation sur le mauvais fournisseur ou mauvaise facture..."
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-600 transition"
            />
            <p className="mt-1 text-[11px] text-slate-500">Au moins 5 caractères obligatoires.</p>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="submit"
              disabled={loading || reason.trim().length < 5}
              className="px-5 py-2 text-sm font-bold text-white bg-rose-700 hover:bg-rose-800 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-md shadow-rose-700/20 transition flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Annulation en cours...
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" />
                  Confirmer l&apos;annulation
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

