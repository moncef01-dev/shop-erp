"use client";

import React from "react";
import Link from "next/link";
import {
  Wallet,
  Landmark,
  ShieldCheck,
  Building2,
  ArrowLeftRight,
  Receipt,
  ArrowUpRight,
  ArrowDownToLine,
  Lock,
  ChevronRight,
  TrendingUp,
  Coins,
} from "lucide-react";
import type { CashDashboardData } from "./actions";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import { formatDA } from "@/components/cash/PrintableCashDocuments";

interface GlobalSituationClientProps {
  data: CashDashboardData;
}

export function GlobalSituationClient({ data }: GlobalSituationClientProps) {
  const { treasury, activeSession } = data;
  const accounts = treasury.accounts || [];

  const cashAccounts = accounts.filter((a) => a.type === "cash" && a.isActive);
  const safeAccounts = accounts.filter((a) => a.type === "safe" && a.isActive);
  const bankAccounts = accounts.filter((a) => a.type === "bank" && a.isActive);

  const totalCash = cashAccounts.reduce((s, a) => s + a.currentBalance, 0);
  const totalSafe = safeAccounts.reduce((s, a) => s + a.currentBalance, 0);
  const totalBank = bankAccounts.reduce((s, a) => s + a.currentBalance, 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Navigation Trésorerie */}
      <TreasuryNavigationTabs />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <TrendingUp className="h-6 w-6 text-amber-500" />
            Situation Financière Globale
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Vision consolidée de l&apos;ensemble des disponibilités de trésorerie (Caisses, Coffres & Banques).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/cash/transfers"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-xs"
          >
            <ArrowLeftRight className="h-4 w-4 text-amber-500" />
            Nouveau Virement
          </Link>
          <Link
            href="/cash/closing"
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 shadow-xs"
          >
            <Lock className="h-4 w-4 text-amber-400" />
            Clôture Caisse
          </Link>
        </div>
      </div>

      {/* Cartes KPI Patrimoine Global */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Disponibilités */}
        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 relative overflow-hidden">
          <div className="absolute -right-3 -bottom-3 opacity-10">
            <Wallet className="w-28 h-28 text-amber-400" />
          </div>
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Disponibilités Totales</span>
            <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full text-[10px]">
              {treasury.activeAccountsCount} comptes actifs
            </span>
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {formatDA(treasury.totalTreasuryFunds)}
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Total consolidé disponible à l&apos;instant T
          </p>
        </div>

        {/* Caisses physiques */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Caisse(s) Journalière(s)</span>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {formatDA(totalCash)}
          </div>
          <div className="flex items-center justify-between text-xs text-slate-500 mt-2">
            <span>{cashAccounts.length} caisse(s)</span>
            <span className={activeSession ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
              {activeSession ? "Session ouverte" : "Session fermée"}
            </span>
          </div>
        </div>

        {/* Coffres de sécurité */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Coffre(s) de Sécurité</span>
            <ShieldCheck className="h-4 w-4 text-amber-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {formatDA(totalSafe)}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {safeAccounts.length} coffre(s) sécurisé(s)
          </p>
        </div>

        {/* Banques & Électronique */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider mb-2">
            <span>Comptes Bancaires</span>
            <Building2 className="h-4 w-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 font-mono">
            {formatDA(totalBank)}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {bankAccounts.length} compte(s) bancaire(s)
          </p>
        </div>
      </div>

      {/* Raccourcis Modules Opérationnels */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <h2 className="text-sm font-bold text-slate-900 mb-3 uppercase tracking-wider text-xs text-slate-500">
          Branches de Gestion de la Trésorerie
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Link
            href="/cash/accounts"
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-amber-50/60 hover:border-amber-300 transition group text-center"
          >
            <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 group-hover:text-amber-600 shadow-2xs mb-2">
              <Landmark className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-800">Compte</span>
            <span className="text-[11px] text-slate-500">Gérer les comptes</span>
          </Link>

          <Link
            href="/cash/transfers"
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-amber-50/60 hover:border-amber-300 transition group text-center"
          >
            <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 group-hover:text-amber-600 shadow-2xs mb-2">
              <ArrowLeftRight className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-800">Mouvement</span>
            <span className="text-[11px] text-slate-500">Virements internes</span>
          </Link>

          <Link
            href="/cash/supplier-payments"
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-amber-50/60 hover:border-amber-300 transition group text-center"
          >
            <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 group-hover:text-amber-600 shadow-2xs mb-2">
              <ArrowUpRight className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-800">Fournisseurs</span>
            <span className="text-[11px] text-slate-500">Paiement dettes</span>
          </Link>

          <Link
            href="/cash/expenses"
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-amber-50/60 hover:border-amber-300 transition group text-center"
          >
            <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 group-hover:text-amber-600 shadow-2xs mb-2">
              <Receipt className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-800">Charges</span>
            <span className="text-[11px] text-slate-500">Dépenses magasin</span>
          </Link>

          <Link
            href="/cash/closing"
            className="flex flex-col items-center p-3 rounded-xl border border-slate-100 bg-slate-50 hover:bg-amber-50/60 hover:border-amber-300 transition group text-center"
          >
            <div className="h-10 w-10 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 group-hover:text-amber-600 shadow-2xs mb-2">
              <Lock className="h-5 w-5" />
            </div>
            <span className="text-xs font-bold text-slate-800">Clôture Caisse</span>
            <span className="text-[11px] text-slate-500">Comptage & transfert</span>
          </Link>
        </div>
      </div>

      {/* Liste des Comptes & Derniers Virements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Synthèse des comptes */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Landmark className="h-4 w-4 text-amber-500" />
                Comptes de Trésorerie Définis
              </h2>
              <Link
                href="/cash/accounts"
                className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1"
              >
                Gérer les comptes <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {accounts.map((acc) => (
                <div key={acc.id} className="py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 font-mono text-xs font-bold">
                      {acc.type === "cash" ? "CAI" : acc.type === "safe" ? "COF" : acc.type === "bank" ? "BNQ" : "DIV"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 text-sm">{acc.name}</span>
                        {acc.isDefault && (
                          <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full">
                            Principal
                          </span>
                        )}
                        {!acc.isActive && (
                          <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded-full">
                            Inactif
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{acc.code}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-slate-900 text-sm block">
                      {formatDA(acc.currentBalance)}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Ouverture : {formatDA(acc.openingBalance)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Derniers Virements Inter-comptes */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4 text-indigo-500" />
                Derniers Mouvements Inter-Comptes
              </h2>
              <Link
                href="/cash/transfers"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                Voir tout l&apos;historique <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <div className="divide-y divide-slate-100">
              {treasury.transfers.length === 0 ? (
                <div className="py-8 text-center text-slate-400 text-xs">
                  Aucun virement interne enregistré pour le moment.
                </div>
              ) : (
                treasury.transfers.slice(0, 5).map((t) => (
                  <div key={t.id} className="py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{t.reference}</span>
                        <span className="text-slate-400 text-[11px]">
                          {new Date(t.date).toLocaleDateString("fr-DZ")}
                        </span>
                      </div>
                      <p className="text-slate-600 font-medium mt-0.5">
                        {t.fromAccountName} → <span className="font-semibold text-slate-900">{t.toAccountName}</span>
                      </p>
                      <span className="text-slate-400 italic text-[11px]">{t.motif}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-bold text-slate-900 text-sm text-indigo-600">
                        {formatDA(t.amount)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
