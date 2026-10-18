"use client";

import React, { useState, useTransition } from "react";
import {
  TrendingUp,
  Download,
  Calendar,
  AlertTriangle,
  Package,
  ShoppingCart,
  Truck,
  Wallet,
  CheckCircle,
  RefreshCw,
  Info,
} from "lucide-react";
import type { ReportsData, DateFilterRange } from "./actions";
import { getReportsData } from "./actions";

export function ReportsClient({ initialData }: { initialData: ReportsData }) {
  const [data, setData] = useState<ReportsData>(initialData);
  const [activePreset, setActivePreset] = useState<DateFilterRange["preset"]>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSelectPreset = (preset: DateFilterRange["preset"]) => {
    setActivePreset(preset);
    startTransition(async () => {
      const updated = await getReportsData({ preset });
      setData(updated);
    });
  };

  const handleApplyCustomDates = () => {
    if (!customStart || !customEnd) return;
    setActivePreset(undefined);
    setShowCustomModal(false);
    startTransition(async () => {
      const updated = await getReportsData({
        startDate: customStart,
        endDate: customEnd,
      });
      setData(updated);
    });
  };

  // CSV Export for French Excel
  const handleExportCSV = () => {
    const BOM = "\uFEFF";
    const sep = ";";
    let csv = `${BOM}RAPPORT D'ACTIVITÉ & BILAN ERP — ${data.settings.shopName.toUpperCase()}\n`;
    csv += `Période${sep}${data.period.label}\n`;
    csv += `Date d'exportation${sep}${new Date().toLocaleString("fr-DZ")}\n\n`;

    // 1. Synthèse Ventes
    csv += `1. CHIFFRE D'AFFAIRES & VENTES\n`;
    csv += `Indicateur${sep}Montant (DA)${sep}Détails\n`;
    csv += `Chiffre d'Affaires Facturé TTC${sep}${data.salesSummary.invoicedRevenue}${sep}${data.salesSummary.confirmedSalesCount} vente(s) confirmée(s)\n`;
    csv += `Total Sous-Total Brut${sep}${data.salesSummary.subtotalGross}${sep}\n`;
    csv += `Total Remises Accordées${sep}-${data.salesSummary.totalDiscounts}${sep}\n`;
    csv += `Total Frais de Livraison Facturés${sep}+${data.salesSummary.totalDeliveryFees}${sep}\n`;
    csv += `Montant Total Encaissé${sep}${data.salesSummary.collectedRevenue}${sep}Taux d'encaissement: ${data.salesSummary.collectionRate.toFixed(1)}%\n`;
    csv += `Créances Clients Restantes${sep}${data.salesSummary.customerDebts}${sep}Solde à recouvrer\n\n`;

    // 2. Marge Brute Estimée
    csv += `2. ANALYSE DE LA MARGE BRUTE ESTIMÉE\n`;
    csv += `Indicateur${sep}Valeur${sep}Observation\n`;
    csv += `Ventes couvertes par coût d'achat${sep}${data.marginAnalysis.coveredSellingRevenue} DA${sep}${data.marginAnalysis.coveredItemsCount} article(s)\n`;
    csv += `Coût de revient estimé${sep}${data.marginAnalysis.coveredCostTotal} DA${sep}\n`;
    csv += `Marge Brute Estimée${sep}${data.marginAnalysis.estimatedGrossMargin} DA${sep}Taux de marge: ${data.marginAnalysis.estimatedMarginRate.toFixed(1)}%\n`;
    csv += `Ventes sans coût de revient${sep}${data.marginAnalysis.uncoveredSellingRevenue} DA${sep}${data.marginAnalysis.uncoveredItemsCount} article(s) exclus\n`;
    csv += `Couverture du coût${sep}${data.marginAnalysis.costCoveragePercentage.toFixed(1)}%${sep}${data.marginAnalysis.disclosureNote}\n\n`;

    // 3. Achats & Dettes Fournisseurs
    csv += `3. ACHATS & DETTES FOURNISSEURS\n`;
    csv += `Indicateur${sep}Montant (DA)${sep}Détails\n`;
    csv += `Total Commandes Achats${sep}${data.purchasesSummary.totalPurchases}${sep}${data.purchasesSummary.purchasesCount} commande(s)\n`;
    csv += `Total Réglé aux Fournisseurs${sep}${data.purchasesSummary.paidToSuppliers}${sep}Taux de règlement: ${data.purchasesSummary.paymentRate.toFixed(1)}%\n`;
    csv += `Dettes Fournisseurs Restantes${sep}${data.purchasesSummary.supplierDebts}${sep}Solde à payer\n\n`;

    // 4. Dépenses d'Exploitation
    csv += `4. DÉPENSES D'EXPLOITATION\n`;
    csv += `Catégorie${sep}Montant (DA)${sep}Nombre de pièces\n`;
    for (const cat of data.cashSummary.expensesByCategory) {
      csv += `${cat.categoryLabel}${sep}${cat.total}${sep}${cat.count}\n`;
    }
    csv += `Total Dépenses${sep}${data.cashSummary.totalExpenses}${sep}${data.cashSummary.expensesCount} pièces\n\n`;

    // 5. Trésorerie
    csv += `5. FLUX DE TRÉSORERIE\n`;
    csv += `Flux${sep}Montant (DA)\n`;
    csv += `Encaissements Espèces (Tiroir)${sep}${data.cashSummary.cashCollections}\n`;
    csv += `Encaissements Bancaires (CIB/Virements/Chèques)${sep}${data.cashSummary.nonCashCollections}\n`;
    csv += `Total Entrées Caisse/Banque${sep}${data.cashSummary.totalCashReceived}\n`;
    csv += `Dépenses payées en espèces${sep}-${data.cashSummary.totalExpenses}\n`;
    csv += `Règlements fournisseurs en espèces${sep}-${data.cashSummary.supplierCashPaid}\n`;
    csv += `Flux net d'exploitation en espèces${sep}${data.cashSummary.netOperatingCash}\n\n`;

    // 6. Stocks par Dépôt
    csv += `6. VALORISATION DES STOCKS PAR DÉPÔT\n`;
    csv += `Dépôt / Entrepôt${sep}Code${sep}Quantité totale${sep}Valeur Coût Achat (DA)${sep}Valeur Prix Vente (DA)\n`;
    for (const wh of data.stockValuation.warehouses) {
      csv += `${wh.locationName}${sep}${wh.locationCode}${sep}${wh.totalQuantity}${sep}${wh.valuationCost}${sep}${wh.valuationSelling}\n`;
    }
    csv += `TOTAL GLOBAL${sep}${sep}${data.stockValuation.globalTotalQuantity}${sep}${data.stockValuation.globalValuationCost}${sep}${data.stockValuation.globalValuationSelling}\n\n`;

    // 7. Alertes Sous-Stock
    csv += `7. PRODUITS EN SOUS-STOCK / ALERTES\n`;
    csv += `Code / SKU${sep}Désignation${sep}Stock Actuel${sep}Stock Minimum${sep}Quantité Manquante\n`;
    for (const alert of data.lowStockAlerts) {
      csv += `${alert.sku}${sep}${alert.name}${sep}${alert.stock}${sep}${alert.minStock}${sep}${alert.shortage}\n`;
    }

    // Téléchargement du fichier CSV
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport_erp_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ─── BANDEAU SUPÉRIEUR & FILTRES ───────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600">
              <TrendingUp className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Rapports Financiers &amp; Analyses Décisionnelles
              </h1>
              <p className="text-xs text-slate-500">
                Bilan d&apos;activité, marges estimées, créances clients, dettes fournisseurs et valorisation des stocks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <Download className="h-4 w-4" />
              Exporter Excel (CSV)
            </button>
            <button
              onClick={() => handleSelectPreset(activePreset || "month")}
              disabled={isPending}
              className="p-2 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors"
              title="Actualiser les données"
            >
              <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Sélecteur de période */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span>Période : <span className="text-amber-700 font-bold">{data.period.label}</span></span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "today", label: "Aujourd'hui" },
                { id: "week", label: "7 jours" },
                { id: "month", label: "Ce mois" },
                { id: "last_month", label: "Mois dernier" },
                { id: "year", label: "Cette année" },
                { id: "all", label: "Tout l'historique" },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                onClick={() => handleSelectPreset(p.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  activePreset === p.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              onClick={() => setShowCustomModal(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
            >
              Dates personnalisées...
            </button>
          </div>
        </div>
      </div>

      {/* ─── 4 CARTES KPI MAJEURES ─────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. CA VENTES */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
              Ventes Facturées (CA TTC)
            </p>
            <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
              <ShoppingCart className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {data.salesSummary.invoicedRevenue.toLocaleString("fr-DZ")} DA
          </p>
          <div className="mt-3 space-y-1 text-xs text-slate-600 pt-2 border-t border-blue-100">
            <div className="flex justify-between">
              <span>Encaissé réel :</span>
              <span className="font-mono font-semibold text-emerald-700">
                {data.salesSummary.collectedRevenue.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="flex justify-between">
              <span>Créances restant dues :</span>
              <span className="font-mono font-bold text-rose-700">
                {data.salesSummary.customerDebts.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="w-full bg-blue-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-emerald-600 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, data.salesSummary.collectionRate)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* 2. ACHATS FOURNISSEURS */}
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wider">
              Commandes Achats
            </p>
            <div className="p-2 rounded-lg bg-indigo-100 text-indigo-700">
              <Truck className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {data.purchasesSummary.totalPurchases.toLocaleString("fr-DZ")} DA
          </p>
          <div className="mt-3 space-y-1 text-xs text-slate-600 pt-2 border-t border-indigo-100">
            <div className="flex justify-between">
              <span>Total Réglé :</span>
              <span className="font-mono font-semibold text-indigo-800">
                {data.purchasesSummary.paidToSuppliers.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="flex justify-between">
              <span>Dettes Fournisseurs :</span>
              <span className="font-mono font-bold text-amber-800">
                {data.purchasesSummary.supplierDebts.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="w-full bg-indigo-200 h-1.5 rounded-full mt-1.5 overflow-hidden">
              <div
                className="bg-indigo-700 h-1.5 rounded-full"
                style={{ width: `${Math.min(100, data.purchasesSummary.paymentRate)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* 3. CHARGES & TRÉSORERIE */}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
              Flux Net Caisse Espèces
            </p>
            <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
              <Wallet className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {data.cashSummary.netOperatingCash.toLocaleString("fr-DZ")} DA
          </p>
          <div className="mt-3 space-y-1 text-xs text-slate-600 pt-2 border-t border-emerald-100">
            <div className="flex justify-between">
              <span>Encaissements Espèces :</span>
              <span className="font-mono font-semibold text-emerald-700">
                +{data.cashSummary.cashCollections.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="flex justify-between">
              <span>Charges d&apos;exploitation :</span>
              <span className="font-mono font-semibold text-rose-700">
                -{data.cashSummary.totalExpenses.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="flex justify-between">
              <span>Encaissements Banque/CIB :</span>
              <span className="font-mono font-medium text-slate-700">
                +{data.cashSummary.nonCashCollections.toLocaleString("fr-DZ")} DA
              </span>
            </div>
          </div>
        </div>

        {/* 4. VALORISATION STOCKS */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Valeur du Stock Global
            </p>
            <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold font-mono text-slate-900">
            {data.stockValuation.globalValuationSelling.toLocaleString("fr-DZ")} DA
          </p>
          <div className="mt-3 space-y-1 text-xs text-slate-600 pt-2 border-t border-amber-100">
            <div className="flex justify-between">
              <span>Valeur Coût Achat :</span>
              <span className="font-mono font-semibold text-slate-700">
                {data.stockValuation.globalValuationCost.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="flex justify-between">
              <span>Articles en Stock :</span>
              <span className="font-bold text-slate-900">
                {data.stockValuation.globalTotalQuantity} pièces
              </span>
            </div>
            <div className="flex justify-between text-amber-800 font-semibold">
              <span>Alertes Sous-Stock :</span>
              <span>{data.lowStockAlerts.length} article(s)</span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 1 : VENTES, DÉCOMPTE & MARGE BRUTE ESTIMÉE ─────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Décompte Facturé vs Encaissé */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-1 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
            Structure de la Facturation Ventes
          </h2>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-50">
              <span className="text-slate-600">Total Ventes Brutes (Articles) :</span>
              <span className="font-mono font-bold text-slate-900">
                {data.salesSummary.subtotalGross.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50 text-emerald-700">
              <span>Remises commerciales accordées :</span>
              <span className="font-mono font-bold">
                -{data.salesSummary.totalDiscounts.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-50 text-blue-700">
              <span>Frais de livraison refacturés :</span>
              <span className="font-mono font-bold">
                +{data.salesSummary.totalDeliveryFees.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="flex justify-between py-2 border-t border-slate-200 text-sm font-bold text-slate-900 bg-slate-50 px-2 rounded">
              <span>CHIFFRE D&apos;AFFAIRES NET TTC :</span>
              <span className="font-mono text-amber-700">
                {data.salesSummary.invoicedRevenue.toLocaleString("fr-DZ")} DA
              </span>
            </div>

            <div className="pt-2">
              <div className="flex justify-between text-slate-600 mb-1">
                <span>Rapprochement Recouvrement :</span>
                <span className="font-bold text-slate-900">
                  {data.salesSummary.collectionRate.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-2 rounded-full transition-all"
                  style={{ width: `${Math.min(100, data.salesSummary.collectionRate)}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Marge Brute Estimée (avec encadré de transparence comptable) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900">
                Analyse de la Marge Brute Estimée
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                Donnée Estimative
              </span>
            </div>
            <span className="text-xs text-slate-500 font-mono">
              Couverture : {data.marginAnalysis.costCoveragePercentage.toFixed(1)}%
            </span>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100">
              <p className="text-xs text-slate-600 font-medium">Ventes Couvertes par Coût</p>
              <p className="text-base font-bold font-mono text-slate-900 mt-0.5">
                {data.marginAnalysis.coveredSellingRevenue.toLocaleString("fr-DZ")} DA
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {data.marginAnalysis.coveredItemsCount} article(s) documenté(s)
              </p>
            </div>
            <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-100">
              <p className="text-xs text-slate-600 font-medium">Coût de Revient Estimé</p>
              <p className="text-base font-bold font-mono text-slate-700 mt-0.5">
                {data.marginAnalysis.coveredCostTotal.toLocaleString("fr-DZ")} DA
              </p>
              <p className="text-xs text-slate-400 mt-1">Sur base des prix d&apos;achat</p>
            </div>
            <div className="bg-emerald-50/70 p-3.5 rounded-lg border border-emerald-200">
              <p className="text-xs text-emerald-800 font-bold">Marge Brute Estimée</p>
              <p className="text-lg font-bold font-mono text-emerald-800 mt-0.5">
                {data.marginAnalysis.estimatedGrossMargin.toLocaleString("fr-DZ")} DA
              </p>
              <p className="text-xs font-bold text-emerald-700 mt-1">
                Taux moyen : {data.marginAnalysis.estimatedMarginRate.toFixed(1)}%
              </p>
            </div>
          </div>

          {/* Encadré d'avertissement de rigueur comptable */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-lg p-3 text-xs flex items-start gap-2.5">
            <Info className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-amber-900 text-[11px] leading-relaxed">
              <span className="font-bold">Avertissement de transparence comptable : </span>
              {data.marginAnalysis.disclosureNote}
            </div>
          </div>
        </div>
      </div>

      {/* ─── SECTION 2 : CHARGES D'EXPLOITATION & DÉPENSES ─────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <h2 className="text-sm font-bold text-slate-900">
            Ventilation des Charges d&apos;Exploitation &amp; Dépenses
          </h2>
          <span className="text-xs font-mono font-bold text-rose-700">
            Total : {data.cashSummary.totalExpenses.toLocaleString("fr-DZ")} DA ({data.cashSummary.expensesCount} pièce(s))
          </span>
        </div>

        {data.cashSummary.expensesByCategory.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            Aucune dépense enregistrée sur la période sélectionnée.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.cashSummary.expensesByCategory.map((cat) => {
              const pct =
                data.cashSummary.totalExpenses > 0
                  ? (cat.total / data.cashSummary.totalExpenses) * 100
                  : 0;

              return (
                <div key={cat.category} className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-1.5">
                  <div className="flex justify-between items-start">
                    <span className="font-bold text-slate-800 text-xs truncate max-w-[140px]">
                      {cat.categoryLabel}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{cat.count} pièce(s)</span>
                  </div>
                  <p className="font-mono font-bold text-sm text-slate-900">
                    {cat.total.toLocaleString("fr-DZ")} DA
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{pct.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── SECTION 3 : VALORISATION DES STOCKS PAR DÉPÔT ─────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-900">
            Valorisation des Stocks par Dépôt / Entrepôt
          </h2>
          <span className="text-xs text-slate-500">
            {data.stockValuation.warehouses.length} emplacement(s) actif(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-slate-100/60 border-b border-slate-200 text-slate-700 uppercase tracking-wider text-sm font-semibold">
                <th className="py-2.5 px-4">Dépôt / Entrepôt</th>
                <th className="py-2.5 px-4 font-mono">Code</th>
                <th className="py-2.5 px-4 text-center">Articles Référencés</th>
                <th className="py-2.5 px-4 text-center">Quantité Totale</th>
                <th className="py-2.5 px-4 text-right">Valeur Coût d&apos;Achat (DA)</th>
                <th className="py-2.5 px-4 text-right">Valeur Prix de Vente (DA)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.stockValuation.warehouses.map((wh) => (
                <tr key={wh.locationId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-bold text-slate-900">{wh.locationName}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{wh.locationCode}</td>
                  <td className="py-3 px-4 text-center text-slate-700">{wh.productCount}</td>
                  <td className="py-3 px-4 text-center font-bold font-mono text-slate-900">
                    {wh.totalQuantity} pièces
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-medium text-slate-700">
                    {wh.valuationCost.toLocaleString("fr-DZ")} DA
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-amber-700">
                    {wh.valuationSelling.toLocaleString("fr-DZ")} DA
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 border-t-2 border-slate-200 font-bold text-xs">
              <tr>
                <td colSpan={3} className="py-3 px-4 uppercase text-slate-700">
                  TOTAL GLOBAL DE VALORISATION :
                </td>
                <td className="py-3 px-4 text-center font-mono text-slate-900 text-sm">
                  {data.stockValuation.globalTotalQuantity} pièces
                </td>
                <td className="py-3 px-4 text-right font-mono text-slate-900 text-sm">
                  {data.stockValuation.globalValuationCost.toLocaleString("fr-DZ")} DA
                </td>
                <td className="py-3 px-4 text-right font-mono text-amber-700 text-sm">
                  {data.stockValuation.globalValuationSelling.toLocaleString("fr-DZ")} DA
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ─── SECTION 4 : ALERTES RUPTURE & MEILLEURES VENTES ───────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Alertes Sous-Stock */}
        <div className="rounded-xl border border-rose-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Alertes Sous-Stock &amp; Réapprovisionnement
              </h2>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
              {data.lowStockAlerts.length} article(s)
            </span>
          </div>

          {data.lowStockAlerts.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs flex flex-col items-center">
              <CheckCircle className="h-8 w-8 text-emerald-500/40 mb-1" />
              <p className="font-semibold text-slate-700">Niveaux de stock satisfaisants</p>
              <p className="text-xs text-slate-400">Aucun produit sous le seuil d&apos;alerte minimum.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto pr-1">
              {data.lowStockAlerts.map((al) => (
                <div key={al.id} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-900 block">{al.name}</span>
                    <span className="text-xs text-slate-500 font-mono">
                      SKU : {al.sku} | Cat : {al.category || "Général"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-black text-rose-700 text-sm">
                      {al.stock} / {al.minStock} {al.unit}
                    </span>
                    <span className="block text-xs text-rose-600 font-semibold">
                      Manque : {al.shortage} {al.unit}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Ventes de la Période */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-sm font-bold text-slate-900">
              Top Produits Vendu(s) sur la Période
            </h2>
            <span className="text-xs text-slate-500">Classement par CA</span>
          </div>

          {data.topSellingProducts.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-xs">
              Aucune vente confirmée sur cette période.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.topSellingProducts.map((p, idx) => (
                <div key={p.productId} className="py-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold text-[11px]">
                      {idx + 1}
                    </span>
                    <div>
                      <span className="font-bold text-slate-900 block">{p.name}</span>
                      <span className="text-xs text-slate-500 font-mono">SKU : {p.sku}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-slate-900 block">
                      {p.totalRevenue.toLocaleString("fr-DZ")} DA
                    </span>
                    <span className="text-xs text-slate-600 font-medium">{p.quantitySold} vendue(s)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── MODALE DATES PERSONNALISÉES ───────────────────────────────────── */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white rounded-xl shadow-xl p-6 text-slate-900">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Période d&apos;analyse personnalisée</h3>
            <p className="text-xs text-slate-500 mb-4">
              Sélectionnez les dates de début et de fin pour recalculer les statistiques.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date de début :</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-amber-500 focus:outline-hidden"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Date de fin :</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setShowCustomModal(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  onClick={handleApplyCustomDates}
                  disabled={!customStart || !customEnd}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold cursor-pointer"
                >
                  Appliquer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
