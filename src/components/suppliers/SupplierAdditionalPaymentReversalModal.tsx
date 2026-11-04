"use client";

import React, { useState } from "react";
import { AlertTriangle, Loader2, X, RotateCcw, ShieldAlert } from "lucide-react";
import { reverseSupplierAdditionalPaymentAction } from "@/app/suppliers/additional-payment-actions";

interface SupplierAdditionalPaymentReversalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  payment: {
    id: number;
    reference: string;
    amount: number;
    date: string;
    supplierName: string;
    accountName: string;
  };
}

export function SupplierAdditionalPaymentReversalModal({
  isOpen,
  onClose,
  onSuccess,
  payment,
}: SupplierAdditionalPaymentReversalModalProps) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason || reason.trim().length < 5) {
      setError("Veuillez indiquer un motif d'annulation détaillé (au moins 5 caractères).");
      return;
    }

    setLoading(true);
    try {
      const res = await reverseSupplierAdditionalPaymentAction({
        paymentId: payment.id,
        reason: reason.trim(),
        idempotencyKey: crypto.randomUUID(),
      });

      if (!res.success) {
        setError(res.error || "Une erreur est survenue lors de l'annulation.");
        return;
      }

      onSuccess();
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
        <div className="px-6 py-5 bg-gradient-to-r from-rose-700 to-rose-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs border border-white/15">
              <RotateCcw className="h-6 w-6 text-rose-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Annuler le versement</h2>
              <p className="text-xs text-rose-200 font-medium">Contrepassation comptable compensatoire</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Info Card */}
        <div className="p-5 bg-slate-50 border-b border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Référence opération :</span>
            <span className="font-mono font-bold text-slate-900">{payment.reference}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Fournisseur bénéficiaire :</span>
            <span className="font-semibold text-slate-900">{payment.supplierName}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Compte débité :</span>
            <span className="font-semibold text-slate-900">{payment.accountName}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Montant à restituer :</span>
            <span className="font-bold text-indigo-700 text-sm">{payment.amount.toLocaleString("fr-DZ")} DA</span>
          </div>
        </div>

        {/* Warning Alert */}
        <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
          <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="leading-relaxed">
            <span className="font-semibold">Traçabilité intégrale :</span> La transaction originale ne sera pas
            supprimée. Une écriture inverse compensatoire restituera les fonds sur le compte d&apos;origine. La dette
            fournisseur restera intacte.
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-medium">{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Motif de l&apos;annulation <span className="text-rose-600">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Erreur de saisie de montant, doublon avec une autre caisse, accord annulé..."
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-rose-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">Obligatoire pour les archives et le journal d&apos;audit.</p>
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            >
              Fermer
            </button>
            <button
              type="submit"
              disabled={loading || reason.trim().length < 5}
              className="px-5 py-2 text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-md shadow-rose-600/20 transition flex items-center gap-2"
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

