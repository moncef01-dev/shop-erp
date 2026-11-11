"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { ZakatDashboardData } from "./types";
import {
  Scale,
  Plus,
  AlertTriangle,
  FileText,
  Clock,
  ArrowRight,
  Package,
  Wallet,
  Building2,
  Users,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Search,
} from "lucide-react";
import { formatZakatMoney } from "./formatters";

interface ZakatDashboardClientProps {
  initialData: ZakatDashboardData;
}

export function ZakatDashboardClient({ initialData }: ZakatDashboardClientProps) {
  const [data] = useState<ZakatDashboardData>(initialData);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const { latestValuation, allValuations } = data;

  const formatMoney = formatZakatMoney;

  const filteredValuations = allValuations.filter((v) => {
    const matchesSearch =
      v.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.valuationDate.includes(searchQuery) ||
      (v.approvedBy && v.approvedBy.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === "ALL" ||
      v.approvalStatus === statusFilter ||
      v.calculationStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (approvalStatus: string, calcStatus: string) => {
    if (approvalStatus === "APPROVED") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Approuvée
        </span>
      );
    }
    if (approvalStatus === "REJECTED") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-300">
          <XCircle className="w-3.5 h-3.5 text-rose-600" />
          Rejetée
        </span>
      );
    }
    if (calcStatus === "INCOMPLETE") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-300">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
          Incomplète (Provisoire)
        </span>
      );
    }
    if (calcStatus === "REQUIRES_REVIEW" || approvalStatus === "REQUIRES_REVIEW") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Revue requise
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300">
        <FileText className="w-3.5 h-3.5 text-blue-600" />
        Brouillon
      </span>
    );
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* ── En-tête du module ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
              <Scale className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Comptabilité de la Zakat (زكاة عروض التجارة)
              </h1>
              <p className="text-sm text-gray-500">
                Évaluation patrimoniale, calcul historique de l&apos;assiette et gestion des clôtures annuelles
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/zakat/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 text-white font-medium rounded-lg hover:bg-emerald-800 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nouvelle évaluation
          </Link>
        </div>
      </div>

      {/* ── Bannière de conformité Fiqh & Sécurité ── */}
      <div className="bg-amber-50/80 border border-amber-200 rounded-xl p-4 flex items-start gap-3 text-amber-900 text-sm">
        <HelpCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-amber-950">
            Avertissement méthodologique et conformité religieuse
          </p>
          <p className="text-xs text-amber-800 leading-relaxed">
            Ce module fournit une aide au calcul comptable et patrimonial fondée sur les pièces comptables enregistrées dans l&apos;ERP. Il ne constitue pas un avis religieux formel (fatwa). La déduction des passifs relève de la responsabilité du gestionnaire, et les évaluations incomplètes ne peuvent en aucun cas être traitées comme des montants définitifs.
          </p>
        </div>
      </div>

      {/* ── Notice d'Architecture Locale & Sécurité ── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-slate-700 text-sm">
        <AlertTriangle className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-900 text-xs">
            Notice d&apos;exploitation locale sans authentification utilisateur
          </p>
          <p className="text-xs text-slate-600 leading-relaxed">
            Shop ERP est une application monoposte / réseau local partagé ne disposant pas de comptes utilisateurs individuels ni de mot de passe. L&apos;attribution des opérations (approbateur, rejet) repose sur une saisie déclarative manuelle non vérifiée. L&apos;intégrité des accès dépend exclusivement de la protection physique du poste de travail et du filtrage réseau (pare-feu).
          </p>
        </div>
      </div>

      {/* ── Carte principale : Dernière évaluation ── */}
      {latestValuation ? (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg font-mono font-semibold text-sm">
                {latestValuation.reference}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-gray-900">Dernière évaluation enregistrée</h3>
                  {getStatusBadge(latestValuation.approvalStatus, latestValuation.calculationStatus)}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  Date de valorisation : {latestValuation.valuationDate} • Hawl du {latestValuation.hawlStartDate} au {latestValuation.hawlEndDate}
                </p>
              </div>
            </div>
            <Link
              href={`/zakat/${latestValuation.id}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 hover:text-emerald-800 hover:underline"
            >
              Consulter le rapport complet
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Actifs Zakatables */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Actifs Confirmés
              </span>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatMoney(latestValuation.totalAssetsDZD)}
              </p>
              <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                <p>Stock : {formatMoney(latestValuation.totalInventoryDZD)}</p>
                <p>Trésorerie : {formatMoney(latestValuation.totalTreasuryDZD)}</p>
                <p>Créances : {formatMoney(latestValuation.totalReceivablesDZD)}</p>
              </div>
            </div>

            {/* Dettes & Passifs Déductibles */}
            <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Dettes Déductibles (Gérant)
              </span>
              <p className="text-2xl font-bold text-gray-900 mt-1">
                {formatMoney(latestValuation.manualLiabilitiesDZD)}
              </p>
              <div className="text-xs text-gray-500 mt-2 space-y-0.5">
                <p>Ajustements nets : {formatMoney(latestValuation.totalAdjustmentsDZD)}</p>
                <p className="truncate">
                  Fonds clients en caisse : {formatMoney(latestValuation.customerFundsHeldDZD)}
                </p>
                <p className="text-amber-700 font-medium">
                  Statut confirmation : {latestValuation.customerFundsConfirmation}
                </p>
              </div>
            </div>

            {/* Assiette Nette (Base Zakat) */}
            <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
              <span className="text-xs font-medium text-emerald-800 uppercase tracking-wider">
                Assiette Imposable (Base)
              </span>
              <p className="text-2xl font-bold text-emerald-950 mt-1">
                {formatMoney(latestValuation.zakatableBaseDZD)}
              </p>
              <div className="text-xs text-emerald-700 mt-2 space-y-0.5">
                <p>Seuil du Nisab : {formatMoney(latestValuation.nisabValueDZD)}</p>
                <p className="font-medium">
                  {latestValuation.isNisabReached ? "✓ Seuil de Nisab atteint" : "✗ En dessous du Nisab"}
                </p>
                <p>Convention : Année {latestValuation.zakatYearType === "LUNAR" ? "Lunaire (2.5%)" : "Solaire"}</p>
              </div>
            </div>

            {/* Montant Estimé de la Zakat */}
            <div className="bg-emerald-700 text-white rounded-xl p-4 shadow-sm flex flex-col justify-between">
              <div>
                <span className="text-xs font-medium text-emerald-200 uppercase tracking-wider">
                  Montant Estimé de la Zakat
                </span>
                <p className="text-3xl font-extrabold mt-1">
                  {formatMoney(latestValuation.zakatDueDZD)}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-emerald-600/60 text-xs text-emerald-100 flex items-center justify-between">
                <span>Taux appliqué : {(latestValuation.zakatRate * 100).toFixed(3)}%</span>
                <span>{latestValuation.approvalStatus === "APPROVED" ? "Verrouillé" : "Non approuvé"}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center space-y-4">
          <div className="w-14 h-14 bg-emerald-50 text-emerald-700 rounded-full flex items-center justify-center mx-auto">
            <Scale className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Aucune évaluation de Zakat enregistrée</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
              Initialisez votre première évaluation patrimoniale de fin d&apos;exercice commercial en quelques étapes guidées.
            </p>
          </div>
          <Link
            href="/zakat/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white font-medium rounded-lg hover:bg-emerald-800 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Créer la première évaluation
          </Link>
        </div>
      )}

      {/* ── Cartes d'indicateurs de répartition financière ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Marchandises en stock</span>
            <Package className="w-5 h-5 text-indigo-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 mt-2">
            {formatMoney(latestValuation?.totalInventoryDZD)}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">Valorisation au prix de revient d&apos;achat</span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Trésorerie & Disponibilités</span>
            <Wallet className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 mt-2">
            {formatMoney(latestValuation?.totalTreasuryDZD)}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">Caisses, coffres et comptes bancaires</span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Créances clients recouvrables</span>
            <Users className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 mt-2">
            {formatMoney(latestValuation?.totalReceivablesDZD)}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">Restes dus des clients identifiés</span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Avances fournisseurs confirmées</span>
            <Building2 className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-xl font-bold text-gray-900 mt-2">
            {formatMoney(latestValuation?.totalSupplierPrepaymentsDZD)}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">
            {latestValuation?.unverifiedAssetsDZD
              ? `+ ${formatMoney(latestValuation.unverifiedAssetsDZD)} non vérifiés`
              : "Versements non encore consommés"}
          </span>
        </div>
      </div>

      {/* ── Table de l'historique des évaluations ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Historique des évaluations</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Toutes les évaluations sont conservées sous forme de snapshots immuables et reproductibles
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Rechercher référence, date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white w-48 sm:w-60"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs py-1.5 px-3 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="APPROVED">Approuvées</option>
              <option value="DRAFT">Brouillons</option>
              <option value="REQUIRES_REVIEW">Revue requise</option>
              <option value="INCOMPLETE">Incomplètes</option>
              <option value="REJECTED">Rejetées</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Référence</th>
                <th className="py-3.5 px-4 font-semibold">Date de valorisation</th>
                <th className="py-3.5 px-4 font-semibold">Période du Hawl</th>
                <th className="py-3.5 px-4 font-semibold text-right">Assiette (Base)</th>
                <th className="py-3.5 px-4 font-semibold text-right">Zakat Estimée</th>
                <th className="py-3.5 px-4 font-semibold text-center">Statut</th>
                <th className="py-3.5 px-4 font-semibold">Approbation</th>
                <th className="py-3.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredValuations.length > 0 ? (
                filteredValuations.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3.5 px-4 font-mono font-medium text-emerald-800">
                      {v.reference}
                    </td>
                    <td className="py-3.5 px-4 font-medium text-gray-900">
                      {v.valuationDate}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-500">
                      {v.hawlStartDate} au {v.hawlEndDate}
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium text-gray-900">
                      {formatMoney(v.zakatableBaseDZD)}
                    </td>
                    <td className="py-3.5 px-4 text-right font-bold text-emerald-700">
                      {formatMoney(v.zakatDueDZD)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      {getStatusBadge(v.approvalStatus, v.calculationStatus)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-600">
                      {v.approvalStatus === "APPROVED" ? (
                        <div>
                          <p className="font-medium text-emerald-800">{v.approvedBy || "Direction"}</p>
                          <p className="text-gray-400 text-[10px]">
                            {v.approvedAt ? new Date(v.approvedAt).toLocaleDateString("fr-DZ") : ""}
                          </p>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">En attente</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/zakat/${v.id}`}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-emerald-50 text-gray-700 hover:text-emerald-700 rounded-lg text-xs font-medium transition-colors border border-gray-200"
                      >
                        Consulter
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400 text-sm">
                    Aucune évaluation trouvée pour ces critères de recherche.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

