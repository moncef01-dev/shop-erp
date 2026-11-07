"use client";

import React, { useState, useEffect } from "react";
import {
  FileCheck2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  ShieldCheck,
  Receipt,
  Sparkles,
} from "lucide-react";
import {
  createSupplierAdditionalPaymentAllocationAction,
  getSupplierEligibleAdditionalPayments,
  getSupplierUnpaidPurchases,
  type EligibleAdditionalPaymentItem,
} from "@/app/suppliers/allocation-actions";

export interface UnpaidPurchaseOption {
  id: number;
  reference: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  purchaseDate: string;
}

interface SupplierAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (allocationData: unknown) => void;
  supplierId: number;
  supplierName: string;
  outstandingDebt: number;
  unpaidPurchases?: UnpaidPurchaseOption[];
}

export function SupplierAllocationModal({
  isOpen,
  onClose,
  onSuccess,
  supplierId,
  supplierName,
  outstandingDebt,
  unpaidPurchases = [],
}: SupplierAllocationModalProps) {
  const [payments, setPayments] = useState<EligibleAdditionalPaymentItem[]>([]);
  const [purchasesList, setPurchasesList] = useState<UnpaidPurchaseOption[]>(unpaidPurchases);
  const [loadingPayments, setLoadingPayments] = useState(true);
  const [selectedPaymentId, setSelectedPaymentId] = useState<number | "">("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<number | "">("");
  const [amount, setAmount] = useState<string>("");
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  useEffect(() => {
    let isMounted = true;
    if (isOpen && supplierId) {
      Promise.all([
        getSupplierEligibleAdditionalPayments(supplierId),
        unpaidPurchases.length > 0 ? Promise.resolve(unpaidPurchases) : getSupplierUnpaidPurchases(supplierId),
      ])
        .then(([items, purs]) => {
          if (!isMounted) return;
          setPayments(items);
          setPurchasesList(purs);
          if (items.length > 0) {
            setSelectedPaymentId(items[0].id);
          }
        })
        .catch((err) => {
          if (!isMounted) return;
          setError("Impossible de charger les données d'imputation.");
          console.error(err);
        })
        .finally(() => {
          if (!isMounted) return;
          setLoadingPayments(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isOpen, supplierId, unpaidPurchases]);

  if (!isOpen) return null;

  const selectedPayment = payments.find((p) => p.id === Number(selectedPaymentId));
  const selectedPurchase = purchasesList.find((p) => p.id === Number(selectedPurchaseId));

  const remainingOnPayment = selectedPayment ? selectedPayment.remainingAmount : 0;
  const targetPurchaseLimit = selectedPurchase ? selectedPurchase.remainingAmount : outstandingDebt;
  const maxAllocatable = Math.max(0, Math.min(remainingOnPayment, targetPurchaseLimit));

  const numAmount = parseFloat(amount) || 0;
  const isAmountExceeded = numAmount > maxAllocatable;
  const isDebtZero = outstandingDebt <= 0;
  const hasNoEligiblePayments = !loadingPayments && payments.length === 0;

  const handleSetMax = () => {
    if (maxAllocatable > 0) {
      setAmount(maxAllocatable.toString());
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedPaymentId || !selectedPayment) {
      setError("Veuillez sélectionner un versement supplémentaire d'origine.");
      return;
    }

    if (numAmount <= 0) {
      setError("Veuillez saisir un montant d'imputation supérieur à 0 DA.");
      return;
    }

    if (numAmount > remainingOnPayment) {
      setError(
        `Le montant d'imputation (${numAmount.toLocaleString(
          "fr-DZ"
        )} DA) dépasse le solde disponible (${remainingOnPayment.toLocaleString(
          "fr-DZ"
        )} DA) sur ce versement.`
      );
      return;
    }

    if (numAmount > outstandingDebt) {
      setError(
        `Le montant d'imputation (${numAmount.toLocaleString(
          "fr-DZ"
        )} DA) dépasse la dette fournisseur restante (${outstandingDebt.toLocaleString(
          "fr-DZ"
        )} DA).`
      );
      return;
    }

    if (selectedPurchase && numAmount > selectedPurchase.remainingAmount) {
      setError(
        `Le montant (${numAmount.toLocaleString(
          "fr-DZ"
        )} DA) dépasse le solde restant dû sur la commande ${selectedPurchase.reference} (${selectedPurchase.remainingAmount.toLocaleString(
          "fr-DZ"
        )} DA).`
      );
      return;
    }

    setLoading(true);
    try {
      const res = await createSupplierAdditionalPaymentAllocationAction({
        supplierId,
        paymentId: selectedPayment.id,
        amount: numAmount,
        purchaseId: selectedPurchaseId ? Number(selectedPurchaseId) : null,
        date,
        notes: notes.trim() || undefined,
        idempotencyKey,
      });

      if (!res.success) {
        setError(res.error || "Une erreur est survenue lors de l'imputation.");
        return;
      }

      onSuccess(res.data);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue lors de l'imputation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-purple-700 via-purple-800 to-indigo-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs border border-white/15">
              <FileCheck2 className="h-6 w-6 text-purple-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Imputer un versement supplémentaire</h2>
              <p className="text-xs text-purple-200 font-medium">
                Affectation sur dette — {supplierName}
              </p>
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

        {/* Financial Separation & Treasury Notice */}
        <div className="px-6 py-3 bg-purple-50 border-b border-purple-100 flex items-start gap-2.5 text-xs text-purple-900">
          <ShieldCheck className="h-4 w-4 text-purple-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Reclassement comptable interne :</span> Cette imputation déduit le montant de la
            dette fournisseur et du solde du versement. <span className="font-bold underline">Impact trésorerie : 0 DA</span> (les fonds ont déjà été décaissés antérieurement).
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-medium">{error}</div>
          </div>
        )}

        {isDebtZero && (
          <div className="mx-6 mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-800 text-xs">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-medium">
              Ce fournisseur n&apos;a actuellement aucune dette en cours (0 DA). Aucune imputation n&apos;est nécessaire.
            </div>
          </div>
        )}

        {hasNoEligiblePayments && !isDebtZero && (
          <div className="mx-6 mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2 text-amber-800 text-xs">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-medium">
              Aucun versement supplémentaire avec un solde disponible à imputer n&apos;a été trouvé pour ce fournisseur.
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Sélection du versement d'origine */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
              <span>Versement supplémentaire source <span className="text-rose-600">*</span></span>
              {loadingPayments && (
                <span className="text-[11px] text-purple-600 font-normal flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Chargement des versements...
                </span>
              )}
            </label>
            <select
              value={selectedPaymentId}
              onChange={(e) => {
                const pId = Number(e.target.value);
                setSelectedPaymentId(pId || "");
                setAmount("");
              }}
              required
              disabled={loadingPayments || payments.length === 0}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600 transition disabled:opacity-50"
            >
              {payments.length === 0 ? (
                <option value="">Aucun versement disponible avec solde non imputé</option>
              ) : (
                payments.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.reference} du {new Date(p.date).toLocaleDateString("fr-DZ")} — Dispo : {p.remainingAmount.toLocaleString("fr-DZ")} DA (Initial : {p.originalAmount.toLocaleString("fr-DZ")} DA via {p.accountName})
                  </option>
                ))
              )}
            </select>

            {/* Carte de cadrage financier du versement sélectionné */}
            {selectedPayment && (
              <div className="mt-2 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
                <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-200 text-slate-600">
                  <div>
                    Versement initial :{" "}
                    <strong className="text-slate-900">{selectedPayment.originalAmount.toLocaleString("fr-DZ")} DA</strong>
                  </div>
                  <div>
                    Déjà imputé :{" "}
                    <strong className="text-slate-900">{selectedPayment.alreadyAllocated.toLocaleString("fr-DZ")} DA</strong>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-purple-800 font-semibold">Solde disponible sur ce versement :</span>
                  <span className="font-mono font-bold text-sm text-purple-700">
                    {remainingOnPayment.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-rose-800 font-semibold">Dette fournisseur actuelle :</span>
                  <span className="font-mono font-bold text-sm text-rose-700">
                    {outstandingDebt.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-purple-100 bg-purple-100/60 -mx-3 -mb-3 px-3 py-2 rounded-b-xl">
                  <span className="text-xs font-bold text-purple-950 uppercase tracking-wider">
                    Plafond maximum imputable :
                  </span>
                  <span className="font-mono font-black text-sm text-purple-900">
                    {maxAllocatable.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Montant à imputer */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                Montant à imputer sur la dette (DA) <span className="text-rose-600">*</span>
              </label>
              {maxAllocatable > 0 && (
                <button
                  type="button"
                  onClick={handleSetMax}
                  className="text-[11px] font-bold text-purple-700 hover:text-purple-900 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="h-3 w-3" />
                  Imputer le maximum ({maxAllocatable.toLocaleString("fr-DZ")} DA)
                </button>
              )}
            </div>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                max={maxAllocatable}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`Ex: ${maxAllocatable > 0 ? maxAllocatable : "0"}`}
                disabled={maxAllocatable <= 0}
                className={`w-full px-4 py-2.5 text-lg font-bold rounded-xl border focus:outline-hidden focus:ring-2 transition ${
                  isAmountExceeded
                    ? "border-rose-300 focus:ring-rose-500 text-rose-900 bg-rose-50/30"
                    : "border-slate-300 focus:ring-purple-600 text-slate-900 bg-white"
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">DA</span>
            </div>
            {isAmountExceeded && (
              <p className="mt-1 text-xs text-rose-600 font-semibold">
                Le montant dépasse le plafond maximum autorisé de {maxAllocatable.toLocaleString("fr-DZ")} DA.
              </p>
            )}
          </div>

          {/* Commande d'achat liée (Optionnel) */}
          {purchasesList.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5 text-slate-500" />
                Commande d&apos;achat / Facture ciblée (optionnel)
              </label>
              <select
                value={selectedPurchaseId}
                onChange={(e) => {
                  setSelectedPurchaseId(e.target.value ? Number(e.target.value) : "");
                }}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
              >
                <option value="">Dette globale du fournisseur (imputation générale)</option>
                {purchasesList.map((pur) => (
                  <option key={pur.id} value={pur.id}>
                    Achat {pur.reference} du {new Date(pur.purchaseDate).toLocaleDateString("fr-DZ")} — Reste dû : {pur.remainingAmount.toLocaleString("fr-DZ")} DA (Total : {pur.totalAmount.toLocaleString("fr-DZ")} DA)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date & Notes */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Date d&apos;imputation
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Observation / Note
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex: Rapprochement convention..."
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-purple-600"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                numAmount <= 0 ||
                isAmountExceeded ||
                maxAllocatable <= 0 ||
                !selectedPaymentId
              }
              className="px-5 py-2 text-sm font-bold text-white bg-purple-700 hover:bg-purple-800 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-md shadow-purple-700/20 transition flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Imputation en cours...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmer l&apos;imputation
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
