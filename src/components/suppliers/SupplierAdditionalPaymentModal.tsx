"use client";

import React, { useState } from "react";
import {
  HandCoins,
  AlertCircle,
  CheckCircle2,
  Loader2,
  X,
  Wallet,
  ShieldCheck,
  Building2,
} from "lucide-react";
import { createSupplierAdditionalPaymentAction } from "@/app/suppliers/additional-payment-actions";

export interface TreasuryAccountOption {
  id: number;
  code: string;
  name: string;
  type: string;
  isDefault: boolean;
  isActive: boolean;
  currentBalance?: number;
}

export interface SupplierOption {
  id: number;
  name: string;
  code?: string | null;
  outstandingDebt?: number;
}

interface SupplierAdditionalPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (savedSupplierId: number) => void;
  suppliers: SupplierOption[];
  selectedSupplierId?: number | null;
  accounts: TreasuryAccountOption[];
  activeCashSession?: {
    id: number;
    reference: string;
    status: string;
  } | null;
}

export function SupplierAdditionalPaymentModal({
  isOpen,
  onClose,
  onSuccess,
  suppliers,
  selectedSupplierId,
  accounts,
  activeCashSession,
}: SupplierAdditionalPaymentModalProps) {
  const [chosenSupplierId, setChosenSupplierId] = useState<number | "">(() => {
    if (selectedSupplierId && suppliers.some((s) => s.id === selectedSupplierId)) {
      return selectedSupplierId;
    }
    return suppliers.length === 1 ? suppliers[0].id : "";
  });

  const defaultAcc = accounts.find((a) => a.isDefault && a.isActive) || accounts.find((a) => a.isActive);
  const [amount, setAmount] = useState<string>("");
  const [selectedAccountId, setSelectedAccountId] = useState<number | "">(() => defaultAcc?.id || "");
  const [paymentMethod, setPaymentMethod] = useState<string>(() =>
    defaultAcc?.type === "bank" ? "transfer" : "cash"
  );
  const [date, setDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState<string>("");
  const [notes] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState<string>(() => crypto.randomUUID());

  if (!isOpen) return null;

  const currentSupplier = suppliers.find((s) => s.id === Number(chosenSupplierId));
  const selectedAccount = accounts.find((a) => a.id === Number(selectedAccountId));
  const isCaisse = selectedAccount?.type === "cash" || selectedAccount?.isDefault;
  const numAmount = parseFloat(amount) || 0;
  const accountBalance = selectedAccount?.currentBalance ?? 0;
  const isOverdrawn = selectedAccount && numAmount > accountBalance;
  const caisseSessionMissing = isCaisse && !activeCashSession;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!chosenSupplierId || !currentSupplier) {
      setError("Veuillez sélectionner un fournisseur bénéficiaire.");
      return;
    }

    if (numAmount <= 0) {
      setError("Veuillez saisir un montant supérieur à 0 DA.");
      return;
    }

    if (!selectedAccountId) {
      setError("Veuillez sélectionner un compte de trésorerie source.");
      return;
    }

    if (isOverdrawn) {
      setError(
        `Solde insuffisant sur le compte "${selectedAccount?.name}". Solde disponible : ${accountBalance.toLocaleString(
          "fr-DZ"
        )} DA.`
      );
      return;
    }

    if (caisseSessionMissing) {
      setError(
        "La caisse journalière n'a pas de session active. Ouvrez une session de caisse ou sélectionnez un coffre/banque."
      );
      return;
    }

    setLoading(true);
    try {
      const res = await createSupplierAdditionalPaymentAction({
        supplierId: currentSupplier.id,
        amount: numAmount,
        treasuryAccountId: Number(selectedAccountId),
        paymentMethod,
        date,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotencyKey,
      });

      if (!res.success) {
        setError(res.error || "Une erreur est survenue lors de l'enregistrement.");
        return;
      }

      onSuccess(currentSupplier.id);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-indigo-700 via-indigo-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs border border-white/15">
              <HandCoins className="h-6 w-6 text-indigo-200" />
            </div>
            <div>
              <h2 className="text-lg font-bold tracking-tight">Donner de l&apos;argent au fournisseur</h2>
              <p className="text-xs text-indigo-200 font-medium">
                Versement hors dette {currentSupplier ? `— ${currentSupplier.name}` : ""}
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

        {/* Warning / Rule Banner */}
        <div className="px-6 py-3 bg-indigo-50 border-b border-indigo-100 flex items-start gap-2.5 text-xs text-indigo-900">
          <ShieldCheck className="h-4 w-4 text-indigo-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-semibold">Règle de séparation financière stricte :</span> Ce montant est décaissé de
            votre trésorerie mais <span className="font-bold underline">ne réduira jamais la dette</span> de ce fournisseur.
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2 text-rose-800 text-xs">
            <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed font-medium">{error}</div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Fournisseur bénéficiaire */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-500" />
              Fournisseur bénéficiaire <span className="text-rose-600">*</span>
            </label>
            <select
              value={chosenSupplierId}
              onChange={(e) => setChosenSupplierId(e.target.value ? Number(e.target.value) : "")}
              required
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition"
            >
              <option value="">Sélectionner un fournisseur...</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.code ? `(${s.code})` : ""} {typeof s.outstandingDebt === "number" ? `— Dette : ${s.outstandingDebt.toLocaleString("fr-DZ")} DA` : ""}
                </option>
              ))}
            </select>
            {currentSupplier && (
              <div className="mt-1.5 flex items-center justify-between text-xs px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200 text-slate-600">
                <span>Dette fournisseur actuelle :</span>
                <span className="font-bold text-rose-700">
                  {(currentSupplier.outstandingDebt ?? 0).toLocaleString("fr-DZ")} DA (inchangée)
                </span>
              </div>
            )}
          </div>

          {/* Montant */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Montant à donner (DA) <span className="text-rose-600">*</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 1 000 000"
                className={`w-full px-4 py-2.5 text-lg font-bold rounded-xl border focus:outline-hidden focus:ring-2 transition ${
                  isOverdrawn
                    ? "border-rose-300 focus:ring-rose-500 text-rose-900 bg-rose-50/30"
                    : "border-slate-300 focus:ring-indigo-600 text-slate-900 bg-white"
                }`}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400">DA</span>
            </div>
          </div>

          {/* Compte source & solde */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Compte de trésorerie source <span className="text-rose-600">*</span>
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => {
                const accId = Number(e.target.value);
                setSelectedAccountId(accId);
                const acc = accounts.find((a) => a.id === accId);
                if (acc) {
                  setPaymentMethod(acc.type === "bank" ? "transfer" : "cash");
                }
              }}
              required
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-600 transition"
            >
              <option value="">Sélectionner un compte source...</option>
              {accounts
                .filter((a) => a.isActive)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.type.toUpperCase()}) — Solde : {(a.currentBalance ?? 0).toLocaleString("fr-DZ")} DA
                  </option>
                ))}
            </select>

            {selectedAccount && (
              <div className="mt-2 flex items-center justify-between text-xs px-3 py-2 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-slate-600 flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-slate-500" />
                  Solde disponible :
                </span>
                <span
                  className={`font-bold ${
                    isOverdrawn ? "text-rose-600 font-extrabold" : "text-slate-900 font-semibold"
                  }`}
                >
                  {accountBalance.toLocaleString("fr-DZ")} DA
                </span>
              </div>
            )}

            {isCaisse && (
              <div
                className={`mt-2 text-xs p-2.5 rounded-lg border flex items-center gap-2 ${
                  activeCashSession
                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                    : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                {activeCashSession ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>
                      Session active liée : <strong>{activeCashSession.reference}</strong> (décaissement tracé)
                    </span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>Aucune session active. Le versement depuis la caisse sera bloqué.</span>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Mode de règlement & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Mode de règlement
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-600"
              >
                <option value="cash">Espèces</option>
                <option value="transfer">Virement bancaire</option>
                <option value="check">Chèque</option>
                <option value="safe_transfer">Prélèvement coffre</option>
                <option value="other">Autre moyen</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Date du versement
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Motif / Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Motif / Raison du versement (optionnel)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Soutien financier temporaire, versement exceptionnel..."
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-300 bg-white text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-600"
            />
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
              disabled={loading || numAmount <= 0 || isOverdrawn || Boolean(caisseSessionMissing) || !chosenSupplierId}
              className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:opacity-50 disabled:pointer-events-none rounded-xl shadow-md shadow-indigo-600/20 transition flex items-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Traitement en cours...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Confirmer le versement
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
