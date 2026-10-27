"use client";

import React from "react";
import {
  MonthlyClosingTotals,
  MonthlyClosingChecklistItem,
  DiscrepancyReviewItem,
} from "@/app/closing/monthly/types";
import { Printer, X } from "lucide-react";
import { PrintPortal } from "@/components/common/PrintPortal";

interface PrintableMonthlyReportProps {
  monthLabel: string;
  periodStartStr: string;
  periodEndStr: string;
  reference?: string;
  version?: number;
  status?: string;
  isLocked?: boolean;
  approvedBy?: string | null;
  approvedAt?: string | null;
  reopenedBy?: string | null;
  reopenedAt?: string | null;
  reopenReason?: string | null;
  notes?: string | null;
  generatedAt?: string;
  generatedBy?: string | null;
  shopSettings: {
    shopName: string;
    activity: string;
    address: string;
    phone: string;
    email: string;
    nifRc: string;
    nis: string;
    currency: string;
    documentFooter: string;
  };
  totals: MonthlyClosingTotals;
  checklist: MonthlyClosingChecklistItem[];
  discrepancies?: DiscrepancyReviewItem[];
  onClose: () => void;
  autoPrint?: boolean;
}

export function PrintableMonthlyReport({
  monthLabel,
  periodStartStr,
  periodEndStr,
  reference,
  version,
  status = "DRAFT",
  isLocked = false,
  approvedBy,
  approvedAt,
  reopenedBy,
  reopenedAt,
  reopenReason,
  notes,
  generatedAt,
  generatedBy = "Opérateur",
  shopSettings,
  totals,
  checklist,
  discrepancies = [],
  onClose,
  autoPrint,
}: PrintableMonthlyReportProps) {
  const hasAutoPrinted = React.useRef(false);
  React.useEffect(() => {
    if (autoPrint && !hasAutoPrinted.current) {
      hasAutoPrinted.current = true;
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  const handlePrint = () => {
    window.print();
  };

  const formatMoney = (val: number) => {
    return `${Math.round(val).toLocaleString("fr-DZ")} ${shopSettings.currency}`;
  };

  const genDateStr = generatedAt
    ? new Date(generatedAt).toLocaleString("fr-DZ", { timeZone: "Africa/Algiers" })
    : new Date().toLocaleString("fr-DZ", { timeZone: "Africa/Algiers" });

  const validatedCount = checklist.filter((c) => c.status === "VALIDATED").length;
  const discrepancyCount = checklist.filter((c) => c.status === "DISCREPANCY").length;

  return (
    <PrintPortal>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-xs flex justify-center p-2 sm:p-6 print:p-0 print:static print:inset-auto print:block print:bg-white print:w-full print:overflow-visible">
      <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl flex flex-col print:shadow-none print:rounded-none print:w-full print:max-w-none print:p-0">
        {/* Barre d'action supérieure (masquée à l'impression) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 rounded-t-2xl print:hidden">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Rapport de Clôture Mensuelle — {monthLabel}
            </h3>
            <p className="text-xs text-slate-500">
              {reference ? `Instantané figé ${reference} (v${version || 1})` : "Prévisualisation en direct"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-sm shadow-xs transition-colors"
            >
              <Printer className="w-4 h-4" />
              Imprimer / Enregistrer en PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/50 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* CONTENU IMPRIMABLE (A4 officiel) */}
        <div className="p-8 sm:p-10 space-y-6 text-slate-800 font-sans text-xs print:p-0 print:space-y-4 print:text-black">
          {/* En-tête de l'entreprise */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 print:border-black pb-5">
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-slate-900 print:text-black uppercase">
                {shopSettings.shopName}
              </h1>
              <p className="text-xs text-slate-600 print:text-black font-semibold mt-0.5">{shopSettings.activity}</p>
              <p className="text-[11px] text-slate-500 print:text-black mt-1 max-w-md">{shopSettings.address}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500 print:text-black mt-1">
                <span>Tél : {shopSettings.phone}</span>
                {shopSettings.email && <span>Email : {shopSettings.email}</span>}
                {shopSettings.nifRc && <span>RC/NIF : {shopSettings.nifRc}</span>}
              </div>
            </div>

            <div className="text-right">
              <span
                className={`inline-block px-3 py-1 text-[11px] font-black rounded-md uppercase tracking-wider print:bg-white print:text-black print:border-2 print:border-black ${
                  status === "FINAL" || isLocked
                    ? "bg-emerald-900 text-emerald-100"
                    : status === "REOPENED"
                    ? "bg-amber-900 text-amber-100"
                    : status === "READY_FOR_APPROVAL"
                    ? "bg-blue-900 text-blue-100"
                    : "bg-slate-900 text-white"
                }`}
              >
                {status === "FINAL" || isLocked
                  ? "Clôture Définitive & Verrouillée"
                  : status === "REOPENED"
                  ? "Période Rouverte pour Régularisation"
                  : status === "READY_FOR_APPROVAL"
                  ? "Prêt pour Approbation"
                  : "Projet de Clôture (Brouillon)"}
              </span>
              <p className="text-sm font-black text-slate-900 print:text-black mt-2">
                Réf : {reference || "PROVISOIRE-DIRECT"}
              </p>
              <p className="text-[11px] text-slate-500 print:text-black mt-0.5 font-medium">Édité le : {genDateStr}</p>
              <p className="text-[11px] text-slate-500 print:text-black font-medium">Par : {generatedBy || "Opérateur"}</p>
              {approvedBy && (
                <div className="mt-1 pt-1 border-t border-slate-200 print:border-black text-[10px] text-emerald-800 print:text-black">
                  <span className="font-bold">Approuvé par :</span> {approvedBy}
                  {approvedAt && <div>le {new Date(approvedAt).toLocaleString("fr-DZ", { timeZone: "Africa/Algiers" })}</div>}
                </div>
              )}
              {reopenedBy && (
                <div className="mt-1 pt-1 border-t border-amber-200 print:border-black text-[10px] text-amber-800 print:text-black">
                  <span className="font-bold">Rouvert par :</span> {reopenedBy}
                  {reopenReason && <div className="italic">« {reopenReason} »</div>}
                </div>
              )}
            </div>
          </div>

          {/* Titre et Période */}
          <div className="bg-slate-100 rounded-lg p-3 text-center border border-slate-200 print:bg-white print:border-2 print:border-black">
            <h2 className="text-sm font-black uppercase text-slate-900 print:text-black tracking-wide">
              Procès-Verbal de Clôture Mensuelle & Rapprochement Financier
            </h2>
            <p className="text-xs font-bold text-slate-700 print:text-black mt-1">
              Mois : <span className="font-black uppercase">{monthLabel}</span> | Période : du {periodStartStr} au {periodEndStr}
            </p>
            <p className="text-[10px] text-slate-500 print:text-black mt-0.5 font-medium">
              Fuseau horaire de référence : Afrique / Alger (UTC+1) — Données consolidées de gestion
            </p>
          </div>

          {/* TABLEAU 1 : CHIFFRE D'AFFAIRES & ENCAISSEMENTS RÉELS */}
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900 print:text-black mb-2 border-b-2 border-slate-300 print:border-black pb-1 flex justify-between items-center">
              <span>1. Activité Commerciale &amp; Encaissements Réels</span>
              <span className="text-[10px] lowercase font-normal text-slate-500 print:text-black">
                (Distinction rigoureuse : facturation confirmée vs flux réels perçus)
              </span>
            </h3>
            <table className="w-full border-collapse border border-slate-300 print:border-2 print:border-black text-[11px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 print:bg-white print:text-black print:border-b-2 print:border-black font-bold">
                  <th className="border border-slate-300 print:border-black p-1.5 text-left">Rubrique Commerciale</th>
                  <th className="border border-slate-300 print:border-black p-1.5 text-right">Montant Facturé</th>
                  <th className="border border-slate-300 print:border-black p-1.5 text-left">Mode de Règlement Réel</th>
                  <th className="border border-slate-300 print:border-black p-1.5 text-right">Montant Encaissé</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="border border-slate-300 print:border-black p-1.5 font-medium">Sous-total articles vendus ({totals.sales.confirmedCount ?? totals.sales.count} factures)</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-bold">{formatMoney(totals.sales.subtotal)}</td>
                  <td className="border border-slate-300 print:border-black p-1.5 font-medium">Espèces reçues (Caisse &amp; Coffre)</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-bold">{formatMoney(totals.collections.cash)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 print:border-black p-1.5 text-slate-600 print:text-black">Frais de livraison inclus dans factures</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-medium">+{formatMoney(totals.sales.deliveryFeesIncluded ?? totals.sales.deliveryFees)}</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-slate-600 print:text-black">Chèques encaissés</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-medium">{formatMoney(totals.collections.check)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 print:border-black p-1.5 text-slate-600 print:text-black">Remises commerciales accordées</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-medium">-{formatMoney(totals.sales.discounts)}</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-slate-600 print:text-black">Virements bancaires &amp; CIB</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-medium">{formatMoney(totals.collections.transfer + totals.collections.cib)}</td>
                </tr>
                <tr>
                  <td className="border border-slate-300 print:border-black p-1.5 text-slate-600 print:text-black">Coût d&apos;achat estimé des ventes (COGS)</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-medium">{formatMoney(totals.sales.costOfGoodsSoldEstimated)}</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-slate-600 print:text-black">Acomptes clients reçus dans le mois</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-medium">{formatMoney(totals.collections.customerAdvancesReceived)}</td>
                </tr>
                <tr className="bg-slate-50 print:bg-white font-bold border-t-2 border-slate-300 print:border-t-2 print:border-black">
                  <td className="border border-slate-300 print:border-black p-1.5 text-slate-900 print:text-black uppercase font-black">Total Chiffre d&apos;Affaires Facturé Net</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono text-slate-900 print:text-black font-black">{formatMoney(totals.sales.totalInvoiced)}</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-slate-900 print:text-black uppercase font-black">Total Encaissements Réels perçus</td>
                  <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono text-emerald-700 print:text-black font-black">{formatMoney(totals.collections.totalCollected)}</td>
                </tr>
                {(totals.sales.draftQuotesCount ?? 0) > 0 && (
                  <tr className="bg-amber-50/40 print:bg-white text-[10.5px]">
                    <td className="border border-slate-300 print:border-black p-1 text-slate-600 print:text-black italic" colSpan={2}>
                      Note : +{formatMoney(totals.sales.draftQuotesTotal ?? 0)} sur {totals.sales.draftQuotesCount} devis en cours (dont {formatMoney(totals.sales.draftQuotesPaid ?? 0)} perçus en acompte). Volume commercial total : {formatMoney(totals.sales.totalCommercialVolume ?? totals.sales.totalInvoiced)}.
                    </td>
                    <td className="border border-slate-300 print:border-black p-1 text-slate-500 print:text-black italic" colSpan={2}>
                      Frais transporteur non inclus : {formatMoney(totals.sales.deliveryFeesExcluded ?? 0)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* TABLEAU 2 : SITUATION FOURNISSEURS, CHARGES & CRÉANCES */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900 print:text-black mb-2 border-b-2 border-slate-300 print:border-black pb-1">
                2. Achats &amp; Situation Fournisseurs
              </h3>
              <table className="w-full border-collapse border border-slate-300 print:border-2 print:border-black text-[11px]">
                <tbody>
                  <tr>
                    <td className="border border-slate-300 print:border-black p-1.5">Achats facturés dans le mois ({totals.purchases.count})</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-bold">{formatMoney(totals.purchases.totalInvoiced)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 print:border-black p-1.5">Règlements fournisseurs effectués</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono text-amber-700 print:text-black font-bold">{formatMoney(totals.purchases.supplierPaymentsMade)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 print:border-black p-1.5">Retours marchandises / Avoirs ({totals.purchases.supplierReturnsCount})</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono text-emerald-700 print:text-black font-bold">-{formatMoney(totals.purchases.supplierReturnsAmount)}</td>
                  </tr>
                  <tr className="bg-slate-50 print:bg-white font-bold border-t-2 border-slate-300 print:border-t-2 print:border-black">
                    <td className="border border-slate-300 print:border-black p-1.5 uppercase font-black">Dette totale arrêtée ({totals.purchases.creditorsCount} fourn.)</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono text-rose-700 print:text-black font-black">{formatMoney(totals.purchases.totalOutstandingDebtAtEnd)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900 print:text-black mb-2 border-b-2 border-slate-300 print:border-black pb-1">
                3. Charges d&apos;Exploitation &amp; Créances
              </h3>
              <table className="w-full border-collapse border border-slate-300 print:border-2 print:border-black text-[11px]">
                <tbody>
                  <tr>
                    <td className="border border-slate-300 print:border-black p-1.5">Charges d&apos;exploitation du mois</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-bold text-rose-700 print:text-black">{formatMoney(totals.expenses.totalOperating)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 print:border-black p-1.5">Produits / Apports exceptionnels</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-bold text-emerald-700 print:text-black">{formatMoney(totals.expenses.exceptionalIncome)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 print:border-black p-1.5">
                      Créances factures au 31 ({totals.customerDebt.debtorsCount} débiteurs)
                      <span className="block text-[9.5px] text-slate-500 print:text-black font-medium">
                        Factures de vente confirmées uniquement
                      </span>
                    </td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-bold">{formatMoney(totals.customerDebt.totalOutstanding)}</td>
                  </tr>
                  {(totals.customerDebt.draftQuotesRemaining ?? 0) > 0 && (
                    <tr className="text-slate-500 print:text-black text-[10.5px]">
                      <td className="border border-slate-300 print:border-black p-1.5">
                        Solde restant sur devis en cours (hors créances exigibles)
                      </td>
                      <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-medium">{formatMoney(totals.customerDebt.draftQuotesRemaining ?? 0)}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 print:bg-white font-bold border-t-2 border-slate-300 print:border-t-2 print:border-black">
                    <td className="border border-slate-300 print:border-black p-1.5 uppercase font-black">Marge brute d&apos;exploitation estimée</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono text-emerald-700 print:text-black font-black">{formatMoney(totals.sales.grossMarginEstimated)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* TABLEAU 3 : COMPTES DE TRÉSORERIE & VIREMENTS INTER-COMPTES */}
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900 print:text-black mb-2 border-b-2 border-slate-300 print:border-black pb-1 flex justify-between items-center">
              <span>4. Comptes de Trésorerie &amp; Virements Internes</span>
              <span className="text-[10px] text-slate-500 print:text-black font-normal">
                Virements : {formatMoney(totals.treasury.totalTransfersVolume)} (Dont {formatMoney(totals.cashSessions.closingTransfersTotal)} clôtures caisse + {formatMoney(totals.cashSessions.manualTransfersTotal ?? 0)} ponctuel) • Strictement neutre
              </span>
            </h3>
            <table className="w-full border-collapse border border-slate-300 print:border-2 print:border-black text-[10.5px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 print:bg-white print:text-black print:border-b-2 print:border-black font-bold">
                  <th className="border border-slate-300 print:border-black p-1 text-left">Compte</th>
                  <th className="border border-slate-300 print:border-black p-1 text-left">Type</th>
                  <th className="border border-slate-300 print:border-black p-1 text-right">Solde Début</th>
                  <th className="border border-slate-300 print:border-black p-1 text-right">Virements Reçus (+)</th>
                  <th className="border border-slate-300 print:border-black p-1 text-right">Virements Émis (-)</th>
                  <th className="border border-slate-300 print:border-black p-1 text-right">Autres Entrées</th>
                  <th className="border border-slate-300 print:border-black p-1 text-right">Autres Sorties</th>
                  <th className="border border-slate-300 print:border-black p-1 text-right">Solde Clôture</th>
                </tr>
              </thead>
              <tbody>
                {totals.treasury.accounts.map((acc) => (
                  <tr key={acc.id}>
                    <td className="border border-slate-300 print:border-black p-1 font-bold">{acc.name}</td>
                    <td className="border border-slate-300 print:border-black p-1 text-slate-500 print:text-black uppercase text-[9px] font-semibold">{acc.type}</td>
                    <td className="border border-slate-300 print:border-black p-1 text-right font-mono font-medium">{formatMoney(acc.openingBalance)}</td>
                    <td className="border border-slate-300 print:border-black p-1 text-right font-mono text-emerald-700 print:text-black font-bold">{acc.transfersIn > 0 ? `+${formatMoney(acc.transfersIn)}` : "0"}</td>
                    <td className="border border-slate-300 print:border-black p-1 text-right font-mono text-rose-700 print:text-black font-bold">{acc.transfersOut > 0 ? `-${formatMoney(acc.transfersOut)}` : "0"}</td>
                    <td className="border border-slate-300 print:border-black p-1 text-right font-mono text-emerald-700 print:text-black font-bold">{acc.otherInflows > 0 ? `+${formatMoney(acc.otherInflows)}` : "0"}</td>
                    <td className="border border-slate-300 print:border-black p-1 text-right font-mono text-rose-700 print:text-black font-bold">{acc.otherOutflows > 0 ? `-${formatMoney(acc.otherOutflows)}` : "0"}</td>
                    <td className="border border-slate-300 print:border-black p-1 text-right font-mono font-black text-slate-900 print:text-black">{formatMoney(acc.closingBalance)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-100 print:bg-white font-bold border-t-2 border-slate-300 print:border-t-2 print:border-black">
                  <td colSpan={2} className="border border-slate-300 print:border-black p-1 text-slate-900 print:text-black uppercase font-black">Total Trésorerie Consolidée</td>
                  <td className="border border-slate-300 print:border-black p-1 text-right font-mono font-bold">{formatMoney(totals.treasury.totalOpening)}</td>
                  <td className="border border-slate-300 print:border-black p-1 text-right font-mono text-emerald-700 print:text-black font-bold">+{formatMoney(totals.treasury.totalTransfersVolume)}</td>
                  <td className="border border-slate-300 print:border-black p-1 text-right font-mono text-rose-700 print:text-black font-bold">-{formatMoney(totals.treasury.totalTransfersVolume)}</td>
                  <td className="border border-slate-300 print:border-black p-1 text-right font-mono font-bold" colSpan={2}>
                    Variation nette : {totals.treasury.netVariation >= 0 ? `+${formatMoney(totals.treasury.netVariation)}` : formatMoney(totals.treasury.netVariation)}
                  </td>
                  <td className="border border-slate-300 print:border-black p-1 text-right font-mono text-slate-950 print:text-black font-black text-sm">{formatMoney(totals.treasury.totalClosing)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* TABLEAU 4 : VALORISATION DES STOCKS & SESSIONS DE CAISSE */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900 print:text-black mb-2 border-b-2 border-slate-300 print:border-black pb-1">
                5. Sessions de Caisse Journalière
              </h3>
              <table className="w-full border-collapse border border-slate-300 print:border-2 print:border-black text-[11px]">
                <tbody>
                  <tr>
                    <td className="border border-slate-300 print:border-black p-1.5">Nombre total de sessions</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-black">{totals.cashSessions.totalCount} ({totals.cashSessions.closedCount} fermées, {totals.cashSessions.openCount} ouvertes)</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 print:border-black p-1.5">Espèces réelles comptées au tiroir</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-bold">{formatMoney(totals.cashSessions.closingCountedTotal)}</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 print:border-black p-1.5">Transferts de clôture vers coffre</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-bold">{formatMoney(totals.cashSessions.closingTransfersTotal)}</td>
                  </tr>
                  {(totals.cashSessions.manualTransfersTotal ?? 0) > 0 && (
                    <tr>
                      <td className="border border-slate-300 print:border-black p-1.5 text-slate-500 print:text-black">Transferts ponctuels hors session</td>
                      <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono text-slate-600 print:text-black font-medium">+{formatMoney(totals.cashSessions.manualTransfersTotal ?? 0)}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 print:bg-white font-bold border-t-2 border-slate-300 print:border-t-2 print:border-black">
                    <td className="border border-slate-300 print:border-black p-1.5 uppercase font-black">Écart de caisse cumulé</td>
                    <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-black">
                      {totals.cashSessions.discrepancyTotal === 0 ? (
                        <span className="text-emerald-700 print:text-black">0 DA (Conforme)</span>
                      ) : (
                        <span className="text-rose-700 print:text-black">{formatMoney(totals.cashSessions.discrepancyTotal)}</span>
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900 print:text-black mb-2 border-b-2 border-slate-300 print:border-black pb-1 flex justify-between items-center">
                <span>6. Valorisation Globale des Stocks</span>
                <span className="text-[9.5px] font-bold text-slate-500 print:text-black uppercase">
                  {totals.stock.valuationBasis === "SNAPSHOT" ? "Arrêté figé" : totals.stock.valuationBasis === "UNAVAILABLE" ? "Non disponible" : "Temps réel"}
                </span>
              </h3>
              {totals.stock.valuationBasis === "UNAVAILABLE" ? (
                <div className="p-3 text-center border border-slate-300 print:border-2 print:border-black bg-slate-50 print:bg-white text-slate-500 print:text-black text-[11px] italic">
                  Valorisation historique indisponible : les mouvements et coûts historiques ne permettent pas une reconstitution rétroactive fiable. Aucun snapshot archivé pour ce mois.
                </div>
              ) : (
                <table className="w-full border-collapse border border-slate-300 print:border-2 print:border-black text-[11px]">
                  <tbody>
                    <tr>
                      <td className="border border-slate-300 print:border-black p-1.5">Quantité totale d&apos;articles en stock</td>
                      <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-black">{totals.stock.totalQuantity} pièces</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 print:border-black p-1.5">Valorisation au Coût d&apos;Achat (PMP/Revient)</td>
                      <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-black text-slate-900 print:text-black">{formatMoney(totals.stock.valuationCost)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-300 print:border-black p-1.5">Valorisation au Prix de Vente Catalogue</td>
                      <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono font-bold">{formatMoney(totals.stock.valuationSelling)}</td>
                    </tr>
                    <tr className="bg-slate-50 print:bg-white font-bold border-t-2 border-slate-300 print:border-t-2 print:border-black">
                      <td className="border border-slate-300 print:border-black p-1.5 uppercase font-black">Marge potentielle brute théorique</td>
                      <td className="border border-slate-300 print:border-black p-1.5 text-right font-mono text-emerald-700 print:text-black font-black">{formatMoney(totals.stock.potentialMargin)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {totals.stock.valuationNotice && (
                <p className="text-[9px] text-slate-400 print:text-black italic mt-1 leading-tight">
                  * {totals.stock.valuationNotice}
                </p>
              )}
            </div>
          </div>

          {/* TABLEAU 5 : GRILLE DE POINTAGE & CONTRÔLE (CHECKLIST) */}
          <div className="break-before-page">
            <h3 className="font-bold text-xs uppercase tracking-wide text-slate-900 print:text-black mb-2 border-b-2 border-slate-300 print:border-black pb-1 flex justify-between items-center">
              <span>7. Grille de Pointage &amp; Rapprochement de Clôture (10 Contrôles)</span>
              <span className="text-[10px] font-black text-slate-700 print:text-black">
                Progression : {validatedCount}/10 Validé(s) {discrepancyCount > 0 ? `(${discrepancyCount} écarts)` : ""}
              </span>
            </h3>
            <table className="w-full border-collapse border border-slate-300 print:border-2 print:border-black text-[10.5px]">
              <thead>
                <tr className="bg-slate-100 text-slate-700 print:bg-white print:text-black print:border-b-2 print:border-black font-bold">
                  <th className="border border-slate-300 print:border-black p-1 text-left w-1/3">Point de Contrôle</th>
                  <th className="border border-slate-300 print:border-black p-1 text-center w-32">Statut</th>
                  <th className="border border-slate-300 print:border-black p-1 text-left">Observations &amp; Justifications</th>
                  <th className="border border-slate-300 print:border-black p-1 text-right w-24">Visa / Date</th>
                </tr>
              </thead>
              <tbody>
                {checklist.map((item) => {
                  const statusBadge =
                    item.status === "VALIDATED" ? (
                      <span className="font-bold text-emerald-700 print:text-black print:font-black">[ ✓ VALIDÉ ]</span>
                    ) : item.status === "DISCREPANCY" ? (
                      <span className="font-bold text-rose-700 print:text-black print:font-black print:border-2 print:border-black print:px-1">[ ⚠ ÉCART ]</span>
                    ) : item.status === "NOT_APPLICABLE" ? (
                      <span className="text-slate-500 print:text-black">[ N/A ]</span>
                    ) : (
                      <span className="text-amber-700 font-bold print:text-black">[ À VÉRIFIER ]</span>
                    );

                  return (
                    <tr key={item.key}>
                      <td className="border border-slate-300 print:border-black p-1">
                        <p className="font-bold text-slate-900 print:text-black">{item.label}</p>
                        <p className="text-[9.5px] text-slate-500 print:text-black">{item.description}</p>
                      </td>
                      <td className="border border-slate-300 print:border-black p-1 text-center bg-slate-50/50 print:bg-white font-mono">
                        {statusBadge}
                      </td>
                      <td className="border border-slate-300 print:border-black p-1 text-slate-700 print:text-black italic">
                        {item.note || "—"}
                      </td>
                      <td className="border border-slate-300 print:border-black p-1 text-right text-[9.5px] text-slate-500 print:text-black font-medium">
                        {item.checkedBy || "Opérateur"}
                        {item.checkedAt && (
                          <div className="text-[8.5px]">
                            {new Date(item.checkedAt).toLocaleDateString("fr-DZ")}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* SECTION 6 : ANOMALIES & ÉCARTS DOCUMENTÉS */}
          {discrepancies.length > 0 && (
            <div className="bg-amber-50/60 border border-amber-200 print:bg-white print:border-2 print:border-black print:text-black rounded-lg p-3">
              <h4 className="font-bold text-[11px] text-amber-900 print:text-black uppercase mb-1">
                [ Points d&apos;Arbitrage &amp; Anomalies Détectés ({discrepancies.length}) ]
              </h4>
              <ul className="list-disc list-inside space-y-1 text-[10.5px] text-amber-950 print:text-black">
                {discrepancies.map((d) => (
                  <li key={d.id}>
                    <strong>{d.title}</strong> : {d.details}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* NOTES GÉNÉRALES DU SNAPSHOT */}
          {notes && (
            <div className="border border-slate-200 print:border-2 print:border-black bg-slate-50 print:bg-white p-2.5 rounded-lg text-[10.5px] print:text-black">
              <span className="font-bold text-slate-900 print:text-black">Commentaire de clôture : </span>
              <span className="text-slate-700 print:text-black">{notes}</span>
            </div>
          )}

          {/* ZONE DE SIGNATURE ET VALIDATION */}
          <div className="pt-6 border-t-2 border-slate-900 print:border-black grid grid-cols-2 gap-8 text-center text-xs">
            <div>
              <p className="font-bold text-slate-900 print:text-black uppercase">L&apos;Opérateur Comptable / Gestionnaire</p>
              <p className="text-[10px] text-slate-500 print:text-black mt-0.5">Visa, signature et date</p>
              <div className="h-16 mt-2 border-2 border-dashed border-slate-300 print:border-black rounded-md flex items-end justify-center pb-2 text-[10px] text-slate-400 print:text-black">
                {generatedBy || "Opérateur ERP"}
              </div>
            </div>

            <div>
              <p className="font-bold text-slate-900 print:text-black uppercase">La Direction Générale / Gérant</p>
              <p className="text-[10px] text-slate-500 print:text-black mt-0.5">Bon pour approbation et archivage</p>
              <div className="h-16 mt-2 border-2 border-dashed border-slate-300 print:border-black rounded-md flex items-end justify-center pb-2 text-[10px] text-slate-400 print:text-black font-semibold">
                Signature &amp; Cachet
              </div>
            </div>
          </div>

          {/* PIED DE PAGE */}
          <div className="text-center text-[9px] text-slate-400 print:text-black pt-2 border-t border-slate-100 print:border-black">
            {shopSettings.documentFooter} — Ce document est une synthèse interne arrêtée et certifiée conforme aux écritures du logiciel Shop ERP.
          </div>
        </div>
      </div>
    </div>
    </PrintPortal>
  );
}
