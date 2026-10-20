"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  ArrowDownLeft,
  ArrowUpRight,
  CreditCard,
  Wallet,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  ArrowRight,
  PlusCircle,
  Users,
  Package,
  Layers,
  FileText,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Filter,
} from "lucide-react";
import {
  getDashboardData,
  type DashboardData,
  type PeriodPreset,
  type ChartDataPoint,
  type OperationalAlert,
  type RecentActivityItem,
} from "./dashboard-actions";

interface DashboardClientProps {
  initialData: DashboardData;
}

export function DashboardClient({ initialData }: DashboardClientProps) {
  const [data, setData] = useState<DashboardData>(initialData);
  const [isPending, startTransition] = useTransition();

  // Custom date range state
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Chart tooltip hover state
  const [hoveredPoint, setHoveredPoint] = useState<ChartDataPoint | null>(null);

  // Formatted current date in French
  const formattedToday = new Intl.DateTimeFormat("fr-DZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const handleSelectPeriod = (preset: PeriodPreset) => {
    if (preset === "custom") {
      setShowCustomModal(true);
      return;
    }

    startTransition(async () => {
      const updated = await getDashboardData({ preset });
      setData(updated);
    });
  };

  const handleApplyCustomDates = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customStart || !customEnd) return;

    startTransition(async () => {
      const updated = await getDashboardData({
        preset: "custom",
        startDate: customStart,
        endDate: customEnd,
      });
      setData(updated);
      setShowCustomModal(false);
    });
  };

  // Helper formatting for currency
  const fmt = (val: number) => val.toLocaleString("fr-DZ");

  // Chart scaling calculations
  const maxVal = Math.max(
    1,
    ...data.chartData.map((d) => Math.max(d.invoicedSales, d.collectedCash))
  );

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      {/* ── A. HEADER & PERIOD SELECTOR ───────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white p-3.5 sm:px-5 sm:py-3 rounded-xl border border-slate-200/90 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">
              Tableau de bord
            </h1>
            <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200/60">
              Mobilier & Décoration
            </span>
            {isPending && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 font-medium animate-pulse ml-2">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-ping" />
                Actualisation...
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 capitalize mt-0.5 flex items-center gap-1.5">
            <Calendar className="h-3 w-3 text-slate-400" />
            {formattedToday}
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-medium overflow-x-auto">
          {(
            [
              { key: "today", label: "Aujourd'hui" },
              { key: "yesterday", label: "Hier" },
              { key: "7d", label: "7 derniers jours" },
              { key: "month", label: "Ce mois-ci" },
              { key: "custom", label: "Personnalisé" },
            ] as const
          ).map((tab) => {
            const isActive = data.period.preset === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSelectPeriod(tab.key)}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? "bg-white text-slate-900 shadow-2xs font-bold"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/60"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Modal période personnalisée */}
      {showCustomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl border border-slate-200 animate-in fade-in zoom-in-95">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Période personnalisée</h3>
            <p className="text-xs text-slate-500 mb-4">
              Sélectionnez les dates de début et de fin d&apos;analyse.
            </p>
            <form onSubmit={handleApplyCustomDates} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date de début
                </label>
                <input
                  type="date"
                  required
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date de fin
                </label>
                <input
                  type="date"
                  required
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-amber-400 cursor-pointer"
                >
                  Appliquer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── B. KPI CARDS (COMPACT GRID OF 6 CARDS) ────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {/* Card 1: Ventes */}
        <Link
          href="/sales"
          className="group relative rounded-xl border border-slate-200/90 bg-white p-3.5 transition-all hover:border-amber-400 hover:shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Ventes
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-600 group-hover:bg-amber-100 transition-colors">
              <ShoppingCart className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1 text-lg sm:text-xl font-black text-slate-900 tabular-nums">
            {fmt(data.kpis.invoicedRevenue.current)} <span className="text-xs font-semibold text-slate-500">DA</span>
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">
              {data.kpis.invoicedRevenue.salesCount} facture(s)
            </span>
            {data.kpis.invoicedRevenue.percentageChange !== null && (
              <span
                className={`inline-flex items-center font-bold font-mono ${
                  data.kpis.invoicedRevenue.percentageChange >= 0
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                {data.kpis.invoicedRevenue.percentageChange >= 0 ? "+" : ""}
                {data.kpis.invoicedRevenue.percentageChange}%
              </span>
            )}
          </div>
        </Link>

        {/* Card 2: Encaissements */}
        <Link
          href="/cash"
          className="group relative rounded-xl border border-slate-200/90 bg-white p-3.5 transition-all hover:border-emerald-400 hover:shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Encaissements
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 group-hover:bg-emerald-100 transition-colors">
              <ArrowDownLeft className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1 text-lg sm:text-xl font-black text-emerald-700 tabular-nums">
            {fmt(data.kpis.collectedRevenue.current)} <span className="text-xs font-semibold text-slate-500">DA</span>
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">
              {data.kpis.collectedRevenue.paymentsCount} règlement(s)
            </span>
            {data.kpis.collectedRevenue.percentageChange !== null && (
              <span
                className={`inline-flex items-center font-bold font-mono ${
                  data.kpis.collectedRevenue.percentageChange >= 0
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                {data.kpis.collectedRevenue.percentageChange >= 0 ? "+" : ""}
                {data.kpis.collectedRevenue.percentageChange}%
              </span>
            )}
          </div>
        </Link>

        {/* Card 3: Dépenses */}
        <Link
          href="/cash"
          className="group relative rounded-xl border border-slate-200/90 bg-white p-3.5 transition-all hover:border-rose-400 hover:shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Dépenses
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 group-hover:bg-rose-100 transition-colors">
              <ArrowUpRight className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1 text-lg sm:text-xl font-black text-rose-700 tabular-nums">
            {fmt(data.kpis.expenses.current)} <span className="text-xs font-semibold text-slate-500">DA</span>
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">
              {data.kpis.expenses.expensesCount} charge(s)
            </span>
            {data.kpis.expenses.percentageChange !== null && (
              <span
                className={`inline-flex items-center font-bold font-mono ${
                  data.kpis.expenses.percentageChange <= 0
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                {data.kpis.expenses.percentageChange >= 0 ? "+" : ""}
                {data.kpis.expenses.percentageChange}%
              </span>
            )}
          </div>
        </Link>

        {/* Card 4: Créances clients */}
        <Link
          href="/customers"
          className="group relative rounded-xl border border-slate-200/90 bg-white p-3.5 transition-all hover:border-amber-400 hover:shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Créances Clients
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-100 transition-colors">
              <CreditCard className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1 text-lg sm:text-xl font-black text-slate-900 tabular-nums">
            {fmt(data.kpis.customerDebts.totalOutstanding)} <span className="text-xs font-semibold text-slate-500">DA</span>
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Reste à recouvrer</span>
            <span className="inline-block bg-rose-50 text-rose-700 font-bold px-1.5 py-0.2 rounded text-[10px]">
              {data.kpis.customerDebts.unpaidInvoicesCount} impayée(s)
            </span>
          </div>
        </Link>

        {/* Card 5: Caisse physique & Solde théorique */}
        <Link
          href="/cash"
          className="group relative rounded-xl border border-slate-200/90 bg-white p-3.5 transition-all hover:border-blue-400 hover:shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Caisse
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100 transition-colors">
              <Wallet className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1 text-lg sm:text-xl font-black text-slate-900 tabular-nums">
            {fmt(data.kpis.cashSession.theoreticalCash)} <span className="text-xs font-semibold text-slate-500">DA</span>
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span
              className={`inline-flex items-center gap-1 font-semibold ${
                data.kpis.cashSession.isOpen ? "text-emerald-700" : "text-slate-500"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  data.kpis.cashSession.isOpen ? "bg-emerald-500" : "bg-slate-400"
                }`}
              />
              {data.kpis.cashSession.isOpen ? "Ouverte" : "Clôturée"}
            </span>
            <span className="text-slate-400 text-[10px] truncate max-w-[80px]">
              {data.kpis.cashSession.countedCash !== null
                ? `Cpt: ${fmt(data.kpis.cashSession.countedCash)}`
                : "Non renseigné"}
            </span>
          </div>
        </Link>

        {/* Card 6: Alertes Stock */}
        <Link
          href="/products"
          className="group relative rounded-xl border border-slate-200/90 bg-white p-3.5 transition-all hover:border-amber-400 hover:shadow-xs"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Alertes Stock
            </span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700 group-hover:bg-amber-100 transition-colors">
              <Package className="h-3.5 w-3.5" />
            </div>
          </div>
          <p className="mt-1 text-lg sm:text-xl font-black text-slate-900 tabular-nums">
            {data.kpis.stock.totalCriticalCount}{" "}
            <span className="text-xs font-normal text-slate-500">critique(s)</span>
          </p>
          <div className="mt-1.5 flex items-center justify-between text-[11px]">
            <span className="text-slate-500 truncate max-w-[95px]">
              {data.kpis.stock.ruptureCount > 0 ? (
                <span className="text-rose-700 font-semibold">{data.kpis.stock.ruptureCount} en rupture</span>
              ) : (
                "0 en rupture"
              )}
            </span>
            <span className="text-slate-400 text-[10px]">
              {data.kpis.stock.totalProductsCount} articles
            </span>
          </div>
        </Link>
      </div>

      {/* ── C & D & E & F. SECTION CENTRALE : 2 COLONNES ───────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── COLONNE GAUCHE (8 / 12) : GRAPHIQUE VENTES + ACTIVITÉ RÉCENTE ────── */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* C. Sales Overview Chart */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <span>Activité des Ventes & Encaissements</span>
                  <span className="text-xs font-normal text-slate-400">({data.period.label})</span>
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Distinction comptable entre facturation et cash réellement collecté.
                </p>
              </div>

              {/* Chart Legend with Totals */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                  <span className="text-slate-600 font-medium">Facturé :</span>
                  <span className="font-bold font-mono text-slate-900">
                    {fmt(data.kpis.invoicedRevenue.current)} DA
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />
                  <span className="text-slate-600 font-medium">Encaissé :</span>
                  <span className="font-bold font-mono text-emerald-800">
                    {fmt(data.kpis.collectedRevenue.current)} DA
                  </span>
                </div>
              </div>
            </div>

            {/* Interactive SVG Chart */}
            <div className="mt-3 relative">
              {data.chartData.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-slate-400 text-xs">
                  <TrendingUp className="h-6 w-6 opacity-30 mb-1" />
                  Aucune donnée sur la période sélectionnée.
                </div>
              ) : (
                <div className="h-44 flex flex-col justify-between">
                  {/* Tooltip display */}
                  <div className="h-5 flex items-center justify-between text-xs px-1">
                    {hoveredPoint ? (
                      <div className="flex items-center gap-3 bg-slate-900 text-white px-2.5 py-0.5 rounded-md text-[11px] shadow-sm animate-in fade-in">
                        <span className="font-bold">{hoveredPoint.label}</span>
                        <span>•</span>
                        <span className="text-amber-300">
                          Ventes : {fmt(hoveredPoint.invoicedSales)} DA
                        </span>
                        <span>•</span>
                        <span className="text-emerald-300">
                          Encaissements : {fmt(hoveredPoint.collectedCash)} DA
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        Survolez les colonnes pour afficher le détail journalier
                      </span>
                    )}
                  </div>

                  {/* Bars Container */}
                  <div className="h-32 flex items-end gap-1 sm:gap-2 px-1 pt-2 border-b border-slate-100">
                    {data.chartData.map((pt, idx) => {
                      const invoicedHeight = Math.max(
                        4,
                        Math.round((pt.invoicedSales / maxVal) * 100)
                      );
                      const collectedHeight = Math.max(
                        4,
                        Math.round((pt.collectedCash / maxVal) * 100)
                      );

                      const isHovered = hoveredPoint?.dateKey === pt.dateKey;

                      return (
                        <div
                          key={pt.dateKey || idx}
                          onMouseEnter={() => setHoveredPoint(pt)}
                          onMouseLeave={() => setHoveredPoint(null)}
                          className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                        >
                          <div className="w-full flex items-end justify-center gap-0.5 sm:gap-1 h-full">
                            {/* Invoiced Bar */}
                            <div
                              style={{ height: `${pt.invoicedSales > 0 ? invoicedHeight : 2}%` }}
                              className={`w-1/2 max-w-[14px] rounded-t-sm transition-all ${
                                pt.invoicedSales > 0
                                  ? isHovered
                                    ? "bg-amber-600 ring-2 ring-amber-300"
                                    : "bg-amber-500 group-hover:bg-amber-600"
                                  : "bg-slate-100"
                              }`}
                            />
                            {/* Collected Bar */}
                            <div
                              style={{ height: `${pt.collectedCash > 0 ? collectedHeight : 2}%` }}
                              className={`w-1/2 max-w-[14px] rounded-t-sm transition-all ${
                                pt.collectedCash > 0
                                  ? isHovered
                                    ? "bg-emerald-700 ring-2 ring-emerald-300"
                                    : "bg-emerald-600 group-hover:bg-emerald-700"
                                  : "bg-slate-100"
                              }`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* X Axis Labels */}
                  <div className="flex justify-between px-1 text-[10px] text-slate-400 mt-1">
                    {data.chartData
                      .filter((_, idx, arr) => {
                        if (arr.length <= 7) return true;
                        // Afficher 5-7 labels espacés
                        const step = Math.ceil(arr.length / 6);
                        return idx % step === 0 || idx === arr.length - 1;
                      })
                      .map((pt) => (
                        <span key={pt.dateKey} className="truncate">
                          {pt.label}
                        </span>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* E. Recent Activity Table */}
          <div className="rounded-xl border border-slate-200/90 bg-white overflow-hidden shadow-2xs">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Dernières Opérations Enregistrées</span>
              </h2>
              <span className="text-[11px] text-slate-400">Flux récents</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200/70 text-slate-500 font-semibold uppercase tracking-wider text-[10px]">
                    <th className="py-2.5 px-3.5">Date / Réf</th>
                    <th className="py-2.5 px-3.5">Type</th>
                    <th className="py-2.5 px-3.5">Client / Tiers</th>
                    <th className="py-2.5 px-3.5 text-right">Montant (DA)</th>
                    <th className="py-2.5 px-3.5 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.recentActivity.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                        Aucune opération récente sur cette période.
                      </td>
                    </tr>
                  ) : (
                    data.recentActivity.map((item) => (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                        onClick={() => {
                          window.location.href = item.href;
                        }}
                      >
                        <td className="py-2 px-3.5">
                          <p className="font-mono font-bold text-slate-900 group-hover:text-amber-600 transition-colors">
                            {item.reference}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {new Date(item.date).toLocaleDateString("fr-DZ")} •{" "}
                            {new Date(item.date).toLocaleTimeString("fr-DZ", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </td>

                        <td className="py-2 px-3.5">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${
                              item.type === "sale"
                                ? "bg-amber-50 text-amber-800 border border-amber-200/60"
                                : item.type === "payment"
                                ? "bg-emerald-50 text-emerald-800 border border-emerald-200/60"
                                : "bg-rose-50 text-rose-800 border border-rose-200/60"
                            }`}
                          >
                            {item.typeLabel}
                          </span>
                        </td>

                        <td className="py-2 px-3.5 text-slate-700 font-medium max-w-[150px] truncate">
                          {item.party}
                        </td>

                        <td className="py-2 px-3.5 text-right font-mono font-bold text-xs tabular-nums">
                          <span
                            className={
                              item.type === "expense"
                                ? "text-rose-700"
                                : item.type === "payment"
                                ? "text-emerald-700"
                                : "text-slate-900"
                            }
                          >
                            {item.type === "expense" ? "-" : "+"}
                            {fmt(item.amount)} DA
                          </span>
                        </td>

                        <td className="py-2 px-3.5 text-center">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700">
                            {item.statusLabel}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── COLONNE DROITE (4 / 12) : ACTIONS RAPIDES + ALERTES OPÉRATIONNELLES ── */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          {/* F. Quick Actions Shortcuts */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
            <h2 className="text-sm font-bold text-slate-900 mb-2.5 flex items-center justify-between">
              <span>Actions Rapides</span>
              <span className="text-[11px] font-normal text-slate-400">Raccourcis</span>
            </h2>

            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/sales"
                className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2.5 text-xs font-semibold text-slate-800 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900 transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-slate-900 shrink-0">
                  <PlusCircle className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">Nouvelle vente</p>
                  <p className="text-[10px] text-slate-500 truncate">Créer un devis/FAC</p>
                </div>
              </Link>

              <Link
                href="/sales"
                className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2.5 text-xs font-semibold text-slate-800 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-900 transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-600 text-white shrink-0">
                  <ArrowDownLeft className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">Paiement client</p>
                  <p className="text-[10px] text-slate-500 truncate">Encaisser un solde</p>
                </div>
              </Link>

              <Link
                href="/cash"
                className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2.5 text-xs font-semibold text-slate-800 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-900 transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-rose-600 text-white shrink-0">
                  <ArrowUpRight className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">Ajouter dépense</p>
                  <p className="text-[10px] text-slate-500 truncate">Charge / décaissement</p>
                </div>
              </Link>

              <Link
                href="/cash"
                className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2.5 text-xs font-semibold text-slate-800 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-900 transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-600 text-white shrink-0">
                  <Wallet className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">Journal de caisse</p>
                  <p className="text-[10px] text-slate-500 truncate">Sessions & clôtures</p>
                </div>
              </Link>

              <Link
                href="/customers"
                className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2.5 text-xs font-semibold text-slate-800 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900 transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-800 text-white shrink-0">
                  <Users className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">Clients</p>
                  <p className="text-[10px] text-slate-500 truncate">Répertoire & crédits</p>
                </div>
              </Link>

              <Link
                href="/products"
                className="flex items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-50/60 p-2.5 text-xs font-semibold text-slate-800 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-900 transition-all cursor-pointer shadow-2xs"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-600 text-white shrink-0">
                  <Package className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">Stock & Meubles</p>
                  <p className="text-[10px] text-slate-500 truncate">Catalogue & dépôts</p>
                </div>
              </Link>
            </div>
          </div>

          {/* D. Operational Alerts Panel */}
          <div className="rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs">
            <div className="flex items-center justify-between mb-2.5">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-amber-500" />
                <span>Alertes Opérationnelles</span>
              </h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {data.alerts.length} active(s)
              </span>
            </div>

            <div className="space-y-2">
              {data.alerts.length === 0 ? (
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-emerald-50/80 border border-emerald-200/60 text-emerald-800 text-xs">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                  <p className="font-medium">
                    Tous les voyants sont au vert. Aucune anomalie détectée.
                  </p>
                </div>
              ) : (
                data.alerts.map((alert) => {
                  const borderClass =
                    alert.type === "danger"
                      ? "border-rose-200 bg-rose-50/50 hover:bg-rose-50"
                      : alert.type === "warning"
                      ? "border-amber-200 bg-amber-50/40 hover:bg-amber-50"
                      : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/60";

                  const textTitle =
                    alert.type === "danger"
                      ? "text-rose-900"
                      : alert.type === "warning"
                      ? "text-amber-900"
                      : "text-slate-800";

                  return (
                    <div
                      key={alert.id}
                      className={`p-2.5 rounded-lg border transition-all ${borderClass}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-xs font-bold ${textTitle} flex items-center gap-1.5`}>
                            {alert.title}
                          </p>
                          <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
                            {alert.message}
                          </p>
                        </div>
                        {alert.badge && (
                          <span className="shrink-0 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                            {alert.badge}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex justify-end">
                        <Link
                          href={alert.href}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 hover:text-amber-900 transition-colors"
                        >
                          <span>{alert.linkText}</span>
                          <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
