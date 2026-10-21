"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownToLine,
  Plus,
  Search,
  Calendar,
  X,
  CheckCircle2,
  AlertCircle,
  Landmark,
} from "lucide-react";
import { createExpenseAction, type CashLedgerItem } from "../actions";
import type { TreasuryAccountData } from "../treasury-actions";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import { formatDA } from "@/components/cash/PrintableCashDocuments";

interface DepositsClientProps {
  initialDeposits: CashLedgerItem[];
  accounts: TreasuryAccountData[];
}

export function DepositsClient({ initialDeposits, accounts }: DepositsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);

  // New Deposit Form
  const [destAccountId, setDestAccountId] = useState<string>(
    accounts[0]?.id.toString() || ""
  );
  const [amount, setAmount] = useState("");
  const [motif, setMotif] = useState("");
  const [method, setMethod] = useState("cash");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [beneficiary, setBeneficiary] = useState("");
  const [notes, setNotes] = useState("");

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  const filteredDeposits = initialDeposits.filter((d) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      d.reference.toLowerCase().includes(q) ||
      d.description.toLowerCase().includes(q) ||
      d.partyName.toLowerCase().includes(q);

    const matchesAccount =
      accountFilter === "all" || (d.accountId && d.accountId.toString() === accountFilter);

    return matchesSearch && matchesAccount;
  });

  const totalDeposits = filteredDeposits.reduce((s, d) => s + d.amount, 0);

  const handleCreateDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showNotification("error", "Le montant doit être strictement supérieur à zéro.");
      return;
    }

    const fd = new FormData();
    fd.set("type", "income");
    fd.set("category", "capital");
    fd.set("description", motif);
    fd.set("amount", amountNum.toString());
    fd.set("method", method);
    fd.set("accountId", destAccountId);
    fd.set("date", date);
    fd.set("beneficiary", beneficiary || "Exploitant / Associé");
    fd.set("notes", notes);

    startTransition(async () => {
      const res = await createExpenseAction(fd);
      if (res.success) {
        showNotification("success", res.message || "Apport enregistré avec succès.");
        setIsModalOpen(false);
        setAmount("");
        setMotif("");
        setNotes("");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de l'enregistrement.");
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
            <ArrowDownToLine className="h-6 w-6 text-emerald-600" />
            Apports de Trésorerie & Fonds Propres
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enregistrement des fonds apportés à l&apos;entreprise (apports personnels, capital, recettes exceptionnelles).
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nouvel Apport
        </button>
      </div>

      {/* Total Card */}
      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-700 flex items-center justify-center">
            <ArrowDownToLine className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-emerald-950">Total des apports répertoriés</h3>
            <p className="text-xs text-emerald-700 mt-0.5">
              Ces apports augmentent les comptes sans être comptabilisés dans le chiffre d&apos;affaires des ventes.
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-xs uppercase font-semibold text-emerald-700 block">Total Encaissé</span>
          <span className="text-2xl font-black text-emerald-900 font-mono">{formatDA(totalDeposits)}</span>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par référence, motif ou apporteur..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tous les comptes récepteurs</option>
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
                <th className="py-3 px-4">Compte Crédité</th>
                <th className="py-3 px-4">Origine / Apporteur</th>
                <th className="py-3 px-4">Motif / Description</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDeposits.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    Aucun apport de trésorerie enregistré.
                  </td>
                </tr>
              ) : (
                filteredDeposits.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">
                      {d.reference}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-xs">
                      {new Date(d.date).toLocaleDateString("fr-DZ")}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-semibold text-slate-800 text-xs">
                        {d.accountName || "Caisse Principale"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-900">
                      {d.partyName || "Exploitant"}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 max-w-sm truncate">
                      {d.description}
                    </td>
                    <td className="py-3.5 px-4 text-xs">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                        {d.method === "cash"
                          ? "Espèces"
                          : d.method === "transfer"
                          ? "Virement"
                          : d.method === "check"
                          ? "Chèque"
                          : "CIB"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 text-sm">
                      +{formatDA(d.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Nouvel Apport */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowDownToLine className="h-5 w-5 text-emerald-600" />
                Enregistrer un Apport de Trésorerie
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDeposit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Compte Destination (Crédité) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={destAccountId}
                  onChange={(e) => setDestAccountId(e.target.value)}
                  className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  {accounts
                    .filter((a) => a.isActive)
                    .map((a) => (
                      <option key={a.id} value={a.id.toString()}>
                        {a.name} ({formatDA(a.currentBalance)})
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Montant de l&apos;apport (DA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="Ex: 100000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mode de versement</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="cash">Espèces</option>
                    <option value="transfer">Virement Bancaire</option>
                    <option value="check">Chèque</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Origine / Apporteur</label>
                  <input
                    type="text"
                    placeholder="Ex: Moncef (Gérant), Associé..."
                    value={beneficiary}
                    onChange={(e) => setBeneficiary(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motif / Justification <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Apport personnel pour approvisionnement stock initial..."
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes complémentaires</label>
                <textarea
                  rows={2}
                  placeholder="Notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
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
                  {isPending ? "Enregistrement..." : "Valider l'Apport"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
