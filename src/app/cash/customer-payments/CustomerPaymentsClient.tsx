"use client";

import React, { useState } from "react";
import {
  CreditCard,
  Search,
  Calendar,
  Wallet,
  ShoppingBag,
  ArrowDownLeft,
} from "lucide-react";
import type { CashLedgerItem } from "../actions";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import { formatDA } from "@/components/cash/PrintableCashDocuments";

interface CustomerPaymentsClientProps {
  initialPayments: CashLedgerItem[];
}

export function CustomerPaymentsClient({
  initialPayments,
}: CustomerPaymentsClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");

  const filteredPayments = initialPayments.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.reference.toLowerCase().includes(q) ||
      p.partyName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.docReference && p.docReference.toLowerCase().includes(q));

    const matchesMethod =
      methodFilter === "all" || p.method === methodFilter;

    return matchesSearch && matchesMethod;
  });

  const totalReceived = filteredPayments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Navigation Trésorerie */}
      <TreasuryNavigationTabs />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <CreditCard className="h-6 w-6 text-emerald-600" />
            Paiements Clients (Encaissements Ventes)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Historique et pointage des encaissements reçus de la clientèle pour les ventes et commandes.
          </p>
        </div>
      </div>

      {/* Total Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <ArrowDownLeft className="h-5 w-5" />
          </div>
          <div>
            <span className="text-xs uppercase font-semibold text-slate-400 block tracking-wider">
              Total des Règlements Clients Encaissés
            </span>
            <p className="text-xs text-slate-400 mt-0.5">
              Règlements comptant, versements d&apos;acomptes et paiements différés de factures.
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-emerald-400 font-mono">
            {formatDA(totalReceived)}
          </span>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par référence paiement, N° vente (FAC-...), ou client..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tous les modes de règlement</option>
              <option value="cash">Espèces</option>
              <option value="transfer">Virement Bancaire</option>
              <option value="check">Chèque</option>
              <option value="cib">CIB / Carte</option>
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
                <th className="py-3 px-4">Réf. Règlement</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Facture / Vente</th>
                <th className="py-3 px-4">Compte Encaissé</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4 text-right">Montant Encaissé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredPayments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    Aucun paiement client répertorié.
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
                    <td className="py-3.5 px-4 text-xs font-mono font-semibold text-indigo-600">
                      {p.docReference || "-"}
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
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 text-sm">
                      +{formatDA(p.amount)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
