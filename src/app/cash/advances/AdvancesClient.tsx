"use client";

import React, { useState } from "react";
import {
  Coins,
  Search,
  Calendar,
  Wallet,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  RotateCcw,
} from "lucide-react";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import { formatDA } from "@/components/cash/PrintableCashDocuments";

export interface AdvanceItem {
  id: number;
  reference: string;
  customerId: number;
  customerName: string;
  customerPhone?: string | null;
  accountId?: number | null;
  accountName?: string | null;
  amount: number;
  allocatedAmount: number;
  refundedAmount: number;
  availableAmount: number;
  method: string;
  paymentDate: string;
  productInterest?: string | null;
  notes?: string | null;
  status: string; // available, partially_used, fully_used, refunded
}

interface AdvancesClientProps {
  initialAdvances: AdvanceItem[];
}

export function AdvancesClient({ initialAdvances }: AdvancesClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredAdvances = initialAdvances.filter((a) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      a.reference.toLowerCase().includes(q) ||
      a.customerName.toLowerCase().includes(q) ||
      (a.productInterest && a.productInterest.toLowerCase().includes(q)) ||
      (a.notes && a.notes.toLowerCase().includes(q));

    const matchesStatus = statusFilter === "all" || a.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const totalAmount = filteredAdvances.reduce((s, a) => s + a.amount, 0);
  const totalAvailable = filteredAdvances.reduce((s, a) => s + a.availableAmount, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "available":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <CheckCircle2 className="h-3 w-3" /> Disponible (100%)
          </span>
        );
      case "partially_used":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <Clock className="h-3 w-3" /> Partiellement utilisé
          </span>
        );
      case "fully_used":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            Soldé / Affecté
          </span>
        );
      case "refunded":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
            <RotateCcw className="h-3 w-3" /> Restitué
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Navigation Trésorerie */}
      <TreasuryNavigationTabs />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Coins className="h-6 w-6 text-amber-500" />
            Acomptes & Avances Clients
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Suivi des dépôts de garantie et acomptes versés par les clients avant livraison ou affectation sur vente.
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-semibold text-slate-400 block tracking-wider">
              Total des Acomptes Versés
            </span>
            <p className="text-xs text-slate-400 mt-0.5">
              Montant total cumulé de l&apos;ensemble des acomptes reçus.
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-black text-amber-400 font-mono">
              {formatDA(totalAmount)}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-xs uppercase font-semibold text-emerald-700 block tracking-wider">
              Solde Restant Disponible
            </span>
            <p className="text-xs text-slate-500 mt-0.5">
              Sommes non encore allouées à des ventes en attente de déduction.
            </p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-emerald-800 font-mono">
              {formatDA(totalAvailable)}
            </span>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par référence (ACP-...), client ou modèle..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tous les statuts</option>
              <option value="available">Disponible</option>
              <option value="partially_used">Partiellement utilisé</option>
              <option value="fully_used">Soldé / Déduit</option>
              <option value="refunded">Restitué</option>
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
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Compte Récepteur</th>
                <th className="py-3 px-4 text-right">Montant Reçu</th>
                <th className="py-3 px-4 text-right">Déjà Alloué</th>
                <th className="py-3 px-4 text-right">Solde Disponible</th>
                <th className="py-3 px-4 text-center">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAdvances.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                    Aucun acompte client répertorié.
                  </td>
                </tr>
              ) : (
                filteredAdvances.map((adv) => (
                  <tr key={adv.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">
                      {adv.reference}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-xs">
                      {new Date(adv.paymentDate).toLocaleDateString("fr-DZ")}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-slate-900 text-xs block">
                        {adv.customerName}
                      </span>
                      {adv.productInterest && (
                        <span className="text-[11px] text-slate-400">
                          Intérêt : {adv.productInterest}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-slate-800">
                      {adv.accountName || "Caisse Principale"}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                      {formatDA(adv.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono text-slate-600 text-xs">
                      {formatDA(adv.allocatedAmount)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-emerald-700 text-sm">
                      {formatDA(adv.availableAmount)}
                    </td>
                    <td className="py-3.5 px-4 text-center">{getStatusBadge(adv.status)}</td>
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
