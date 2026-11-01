"use client";

import React, { useState, useTransition } from "react";
import { X, Ban, AlertCircle, RefreshCw, Wallet, ArrowRight, ShieldCheck, CheckCircle2 } from "lucide-react";
import { cancelSupplierPaymentAction } from "@/app/suppliers/actions";
import type { TreasuryAccountData } from "@/app/cash/treasury-actions";

export interface CancellablePaymentData {
  id: number;
  reference: string;
  amount: number;
  method: string;
  status: string;
  paymentDate: string | Date;
  partyName?: string;
  supplierName?: string;
  docReference?: string | null;
  accountName?: string | null;
  accountId?: number | null;
  sessionId?: number | null;
  sessionRef?: string | null;
}

interface CancelSupplierPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: CancellablePaymentData | null;
  accounts: TreasuryAccountData[];
  onSuccess: (message: string) => void;
}

export function CancelSupplierPaymentModal({
  isOpen,
  onClose,
  payment,
  accounts,
  onSuccess,
}: CancelSupplierPaymentModalProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [cancellationType, setCancellationType] = useState<"mistake" | "refund">("mistake");
  const [reason, setReason] = useState("");

  // Refund fields
  const defaultAccId = payment?.accountId || accounts[0]?.id || 2;
  const [refundAccountId, setRefundAccountId] = useState<number>(defaultAccId);
  const [refundAmount, setRefundAmount] = useState<number>(payment?.amount || 0);
  const [refundDate, setRefundDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [refundMethod, setRefundMethod] = useState<string>(payment?.method || "cash");

  if (!isOpen || !payment) return null;

  const supplierDisplay = payment.supplierName || payment.partyName || "Fournisseur";
  const dateDisplay =
    typeof payment.paymentDate === "string"
      ? new Date(payment.paymentDate).toLocaleDateString("fr-DZ")
      : payment.paymentDate.toLocaleDateString("fr-DZ");

  const targetAccount = accounts.find((a) => a.id === refundAccountId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!reason || reason.trim().length < 3) {
      setErrorMessage("Veuillez renseigner un motif d'annulation explicite (au moins 3 caractères).");
      return;
    }

    if (cancellationType === "refund") {
      if (!refundAccountId) {
        setErrorMessage("Veuillez sélectionner le compte de trésorerie qui a réceptionné les fonds remboursés.");
        return;
      }
      if (refundAmount <= 0 || refundAmount > payment.amount) {
        setErrorMessage(
          `Le montant remboursé (${refundAmount.toLocaleString(
            "fr-DZ"
          )} DA) doit être compris entre 1 DA et ${payment.amount.toLocaleString("fr-DZ")} DA.`
        );
        return;
      }
    }

    startTransition(async () => {
      const res = await cancelSupplierPaymentAction({
        paymentId: payment.id,
        cancellationType,
        reason: reason.trim(),
        refundAccountId: cancellationType === "refund" ? refundAccountId : undefined,
        refundDate: cancellationType === "refund" ? refundDate : undefined,
        refundAmount: cancellationType === "refund" ? refundAmount : undefined,
        refundMethod: cancellationType === "refund" ? refundMethod : undefined,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Erreur lors de l'annulation du versement.");
      } else {
        onSuccess(res.message || "Opération validée avec succès.");
        onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 my-8 border border-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
              <Ban className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">Annuler le Versement Fournisseur</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-rose-100 text-rose-800">
                  {payment.reference}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Bénéficiaire : <span className="font-semibold text-slate-800">{supplierDisplay}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Fiche récapitulative du versement */}
          <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl text-xs space-y-2">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Montant Initial</span>
                <span className="font-mono font-black text-slate-900 text-sm">
                  {payment.amount.toLocaleString("fr-DZ")} DA
                </span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Date de Règlement</span>
                <span className="font-semibold text-slate-800">{dateDisplay}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Compte Débité</span>
                <span className="font-semibold text-slate-800">{payment.accountName || "Caisse / Trésorerie"}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Mode</span>
                <span className="font-semibold uppercase text-slate-800">{payment.method}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200">
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold">Commande liée :</span>{" "}
                <span className="font-mono font-bold text-slate-800">
                  {payment.docReference || "Règlement global"}
                </span>
              </div>
              <div>
                <span className="text-slate-500 text-[10px] uppercase font-bold">Session de caisse :</span>{" "}
                <span className="font-mono font-bold text-slate-800">
                  {payment.sessionRef || (payment.sessionId ? `Session #${payment.sessionId}` : "Hors session")}
                </span>
              </div>
            </div>
          </div>

          {/* Erreur */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Choix de la situation */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Nature de l&apos;annulation <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option A : Erreur de saisie */}
              <label
                className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                  cancellationType === "mistake"
                    ? "border-rose-600 bg-rose-50/50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="cancellationType"
                  value="mistake"
                  checked={cancellationType === "mistake"}
                  onChange={() => setCancellationType("mistake")}
                  className="mt-0.5 text-rose-600 focus:ring-rose-500"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-900">A. Erreur de saisie</p>
                  <p className="text-slate-600 text-[11px] mt-0.5">
                    Aucun argent n&apos;est sorti réellement. L&apos;opération est annulée sans générer de flux de trésorerie factice.
                  </p>
                </div>
              </label>

              {/* Option B : Remboursement effectif */}
              <label
                className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-start gap-2.5 ${
                  cancellationType === "refund"
                    ? "border-emerald-600 bg-emerald-50/50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="radio"
                  name="cancellationType"
                  value="refund"
                  checked={cancellationType === "refund"}
                  onChange={() => setCancellationType("refund")}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="text-xs">
                  <p className="font-bold text-slate-900">B. Remboursement effectif</p>
                  <p className="text-slate-600 text-[11px] mt-0.5">
                    Le fournisseur a réellement rendu les fonds. Une entrée de trésorerie enregistre le cash perçu.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Formulaire spécifique si Remboursement effectif */}
          {cancellationType === "refund" && (
            <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 space-y-3">
              <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4 text-emerald-700" />
                Détails de l&apos;encaissement du remboursement
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Compte récepteur (Crédité) <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={refundAccountId}
                    onChange={(e) => setRefundAccountId(Number(e.target.value))}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.type === "cash" ? "Caisse" : acc.type === "safe" ? "Coffre" : "Banque"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Montant Perçu (DA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={payment.amount}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-full text-xs font-mono font-black bg-white border border-slate-200 rounded-lg p-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Date d&apos;encaissement</label>
                  <input
                    type="date"
                    value={refundDate}
                    onChange={(e) => setRefundDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Mode de règlement</label>
                  <select
                    value={refundMethod}
                    onChange={(e) => setRefundMethod(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                  >
                    <option value="cash">Espèces</option>
                    <option value="transfer">Virement bancaire</option>
                    <option value="check">Chèque</option>
                    <option value="cib">CIB / Carte</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Motif d'annulation */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
              Motif d&apos;annulation / Justification <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : Erreur d'imputation, paiement en double, retour marchandise soldé en espèces..."
              className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
              required
            />
          </div>

          {/* Prévisualisation de l'impact financier */}
          <div className="p-3.5 rounded-xl bg-slate-100 border border-slate-200 text-xs space-y-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 block mb-1">
              Impact financier prévisionnel :
            </span>
            <div className="flex items-center justify-between text-slate-700">
              <span>Dette due au fournisseur {supplierDisplay} :</span>
              <span className="font-mono font-bold text-rose-700">
                +{cancellationType === "refund" ? refundAmount.toLocaleString("fr-DZ") : payment.amount.toLocaleString("fr-DZ")} DA (Rétablissement)
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span>
                {cancellationType === "refund"
                  ? `Compte crédité (${targetAccount?.name || "Compte"}) :`
                  : `Solde compte (${payment.accountName || "Trésorerie"}) :`}
              </span>
              <span className="font-mono font-bold text-emerald-700">
                +{cancellationType === "refund" ? refundAmount.toLocaleString("fr-DZ") : payment.amount.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-200">
              <span>Sessions de caisse passées :</span>
              <span className="font-medium text-slate-700">Intégrité stricte garantie (0 altération des totaux clôturés)</span>
            </div>
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100 transition cursor-pointer"
            >
              Fermer
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer"
            >
              <Ban className="h-4 w-4" />
              {isPending ? "Annulation en cours..." : "Confirmer l'annulation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

