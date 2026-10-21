"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Plus,
  Search,
  Calendar,
  X,
  Printer,
  CheckCircle2,
  AlertCircle,
  Building2,
  Wallet,
} from "lucide-react";
import {
  recordSupplierPaymentMultiAccountAction,
  type SupplierDetailsWithBalance,
} from "@/app/suppliers/actions";
import type { TreasuryAccountData } from "../treasury-actions";
import type { CashLedgerItem } from "../actions";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import { formatDA } from "@/components/cash/PrintableCashDocuments";

interface SupplierPaymentsClientProps {
  initialPayments: CashLedgerItem[];
  suppliers: SupplierDetailsWithBalance[];
  accounts: TreasuryAccountData[];
}

export function SupplierPaymentsClient({
  initialPayments,
  suppliers,
  accounts,
}: SupplierPaymentsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Supplier Payment Form
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>(
    suppliers[0]?.id.toString() || ""
  );
  const [sourceAccountId, setSourceAccountId] = useState<string>(
    accounts.find((a) => a.type === "safe")?.id.toString() ||
      accounts[0]?.id.toString() ||
      ""
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentNotes, setPaymentNotes] = useState("");

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  const selectedSupplier = suppliers.find((s) => s.id.toString() === selectedSupplierId);
  const selectedAccount = accounts.find((a) => a.id.toString() === sourceAccountId);

  const filteredPayments = initialPayments.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.reference.toLowerCase().includes(q) ||
      p.partyName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q);

    const matchesSupp =
      supplierFilter === "all" || p.partyName.toLowerCase().includes(supplierFilter.toLowerCase());
    const matchesAcc =
      accountFilter === "all" || (p.accountId && p.accountId.toString() === accountFilter);

    return matchesSearch && matchesSupp && matchesAcc;
  });

  const totalPayments = filteredPayments.reduce((s, p) => s + p.amount, 0);

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId || !sourceAccountId) {
      showNotification("error", "Veuillez désigner le fournisseur et le compte source.");
      return;
    }

    const amountNum = parseFloat(paymentAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showNotification("error", "Le montant doit être strictement supérieur à zéro.");
      return;
    }

    if (selectedAccount && selectedAccount.currentBalance < amountNum) {
      showNotification(
        "error",
        `Fonds insuffisants sur "${selectedAccount.name}". Solde disponible : ${formatDA(
          selectedAccount.currentBalance
        )}.`
      );
      return;
    }

    if (selectedSupplier && amountNum > selectedSupplier.outstandingDebt) {
      showNotification(
        "error",
        `Le montant (${formatDA(amountNum)}) dépasse la dette totale du fournisseur (${formatDA(
          selectedSupplier.outstandingDebt
        )}). Les trop-perçus ne sont pas autorisés.`
      );
      return;
    }

    startTransition(async () => {
      const res = await recordSupplierPaymentMultiAccountAction({
        supplierId: parseInt(selectedSupplierId, 10),
        amount: amountNum,
        sourceAccountId: parseInt(sourceAccountId, 10),
        method: paymentMethod,
        paymentDate,
        notes: paymentNotes,
      });

      if (res.success) {
        showNotification("success", res.message || "Règlement fournisseur enregistré.");
        setIsModalOpen(false);
        setPaymentAmount("");
        setPaymentNotes("");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de l'enregistrement du règlement.");
      }
    });
  };

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
            <ArrowUpRight className="h-6 w-6 text-amber-500" />
            Paiement des Fournisseurs
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Règlements des dettes fournisseurs depuis le compte de trésorerie de votre choix (Coffre, Caisse ou Banque).
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nouveau Paiement Fournisseur
        </button>
      </div>

      {/* Total Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs uppercase font-semibold text-slate-400 block tracking-wider">
              Total des Règlements Fournisseurs
            </span>
            <p className="text-xs text-slate-400 mt-0.5">
              Diminue la dette fournisseur et le solde du compte de trésorerie choisi exactement une fois.
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-amber-400 font-mono">
            {formatDA(totalPayments)}
          </span>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par référence, fournisseur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tous les fournisseurs</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tous les comptes débités</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id.toString()}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Référence</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Fournisseur</th>
                <th className="py-3 px-4">Compte Débité</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4">Observation</th>
                <th className="py-3 px-4 text-right">Montant Versé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    Aucun paiement fournisseur enregistré.
                  </td>
                </tr>
              ) : (
                filteredPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">
                      {p.reference}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-xs">
                      {new Date(p.date).toLocaleDateString("fr-DZ")}
                    </td>
                    <td className="py-3.5 px-4 font-bold text-slate-900 text-xs">
                      {p.partyName}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-slate-800">
                      {p.accountName || "Caisse Principale"}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                        {p.method === "cash"
                          ? "Espèces"
                          : p.method === "transfer"
                          ? "Virement"
                          : p.method === "check"
                          ? "Chèque"
                          : "CIB"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {p.description}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                      {formatDA(p.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nouveau Règlement Fournisseur */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowUpRight className="h-5 w-5 text-amber-500" />
                Règlement Fournisseur Multi-Comptes
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePayment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Fournisseur Bénéficiaire <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id.toString()}>
                      {s.name} (Dette en cours : {formatDA(s.outstandingDebt)})
                    </option>
                  ))}
                </select>
                {selectedSupplier && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Dette restant due :{" "}
                    <strong className="text-rose-600 font-mono">
                      {formatDA(selectedSupplier.outstandingDebt)}
                    </strong>
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Compte Débité (Source du paiement) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={sourceAccountId}
                  onChange={(e) => setSourceAccountId(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {accounts
                    .filter((a) => a.isActive)
                    .map((a) => (
                      <option key={a.id} value={a.id.toString()}>
                        {a.name} (Solde dispo : {formatDA(a.currentBalance)})
                      </option>
                    ))}
                </select>
                {selectedAccount && (
                  <p className="text-[11px] text-slate-500 mt-1">
                    Solde disponible :{" "}
                    <strong className="text-slate-900 font-mono">
                      {formatDA(selectedAccount.currentBalance)}
                    </strong>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Montant du versement (DA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={selectedSupplier?.outstandingDebt || undefined}
                    step="any"
                    required
                    placeholder="Ex: 50000"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mode de règlement</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="cash">Espèces</option>
                    <option value="transfer">Virement Bancaire</option>
                    <option value="check">Chèque</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date du paiement</label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Observation</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Acompte sur commande, règlement facture N°..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Validation..." : "Valider le Paiement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
