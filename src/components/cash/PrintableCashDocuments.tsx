"use client";

import React from "react";
import { Printer, X } from "lucide-react";
import type { CashLedgerItem } from "@/app/cash/actions";
import type { ShopSettingsData } from "@/app/settings/actions";

// ─── UTILITAIRES DE FORMATAGE ────────────────────────────────────────────────

export function formatDA(val: number): string {
  return `${Math.round(val).toLocaleString("fr-DZ")} DA`;
}

export function formatDate(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString("fr-DZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString("fr-DZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMethodLabel(m: string): string {
  switch (m) {
    case "cash":
      return "Espèces";
    case "cib":
      return "Carte CIB / Edahabia";
    case "check":
      return "Chèque bancaire";
    case "transfer":
      return "Virement bancaire";
    default:
      return m;
  }
}

// ─── 1. JOURNAL JOURNALIER DE CAISSE (A4) ────────────────────────────────────

export function PrintableDailyCashJournal({
  sessionRef,
  date,
  openingAmount,
  items,
  settings,
  onClose,
}: {
  sessionRef?: string;
  date: string | Date;
  openingAmount: number;
  items: CashLedgerItem[];
  settings?: ShopSettingsData | null;
  onClose: () => void;
}) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handlePrint = () => {
    window.print();
  };

  const cashItems = items.filter((i) => i.affectsCash);
  const totalCashIn = cashItems
    .filter((i) => i.type === "encaissement")
    .reduce((acc, i) => acc + i.amount, 0);
  const totalCashOut = cashItems
    .filter((i) => i.type === "decaissement")
    .reduce((acc, i) => acc + i.amount, 0);
  const theoreticalCash = openingAmount + totalCashIn - totalCashOut;

  const nonCashItems = items.filter((i) => !i.affectsCash);
  const nonCashIn = nonCashItems
    .filter((i) => i.type === "encaissement")
    .reduce((acc, i) => acc + i.amount, 0);
  const nonCashOut = nonCashItems
    .filter((i) => i.type === "decaissement")
    .reduce((acc, i) => acc + i.amount, 0);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center print:p-0 print:bg-white print:fixed print:inset-0"
    >
      <div className="relative w-full max-w-5xl bg-white rounded-xl shadow-2xl p-8 print:p-6 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        {/* Navigation Modal TopBar */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Aperçu du Journal de Caisse A4</span>
            {sessionRef && (
              <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-full bg-amber-100 text-amber-800">
                Session {sessionRef}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm"
            >
              <Printer className="h-4 w-4" />
              Imprimer (A4)
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Corps Imprimable */}
        <div className="text-slate-900 leading-relaxed font-sans text-xs">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-5">
            <div className="flex items-start gap-4">
              {settings?.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt={settings.shopName || "Logo"}
                  className="h-14 w-14 object-contain rounded border border-slate-200 p-1 bg-white print:border-none"
                />
              )}
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                  {settings?.shopName || "Shop ERP Mobilier"}
                </h1>
                <p className="text-slate-500 text-xs mt-0.5 font-medium">
                  {settings?.activity || "Magasin d'Ameublement & Salons • Journal Quotidien de Trésorerie"}
                </p>
                <p className="text-slate-400 text-[11px] mt-1">
                  {settings?.address || "Zone Commerciale & Exposition — Alger, Algérie"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-block bg-slate-900 text-white px-3 py-1 font-mono font-bold text-xs tracking-wide rounded-sm uppercase">
                Journal de Caisse
              </div>
              {sessionRef && (
                <p className="font-mono font-bold text-sm mt-2 text-slate-900">
                  Réf: {sessionRef}
                </p>
              )}
              <p className="text-slate-600 text-xs mt-1">
                Date : <span className="font-semibold text-slate-900">{formatDate(date)}</span>
              </p>
            </div>
          </div>

          {/* Synthèse Fond de Caisse & Soldes */}
          <div className="grid grid-cols-4 gap-4 my-5">
            <div className="bg-slate-50 p-3 rounded border border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                Solde Ouverture (Fond)
              </span>
              <p className="font-mono font-bold text-sm text-slate-900">
                {formatDA(openingAmount)}
              </p>
            </div>
            <div className="bg-emerald-50/60 p-3 rounded border border-emerald-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-emerald-800 mb-0.5">
                Encaissements Espèces
              </span>
              <p className="font-mono font-bold text-sm text-emerald-700">
                +{formatDA(totalCashIn)}
              </p>
            </div>
            <div className="bg-rose-50/60 p-3 rounded border border-rose-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-rose-800 mb-0.5">
                Décaissements Espèces
              </span>
              <p className="font-mono font-bold text-sm text-rose-700">
                -{formatDA(totalCashOut)}
              </p>
            </div>
            <div className="bg-amber-50 p-3 rounded border border-amber-300">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-amber-900 mb-0.5">
                Solde Théorique Caisse
              </span>
              <p className="font-mono font-bold text-sm text-amber-900">
                {formatDA(theoreticalCash)}
              </p>
            </div>
          </div>

          {/* Tableau des mouvements */}
          <div className="border border-slate-300 rounded mb-6 print:border-slate-400 overflow-x-auto print:overflow-visible">
            <table className="w-full text-left border-collapse text-xs print:text-[11px]">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 print:table-header-group">
                <tr>
                  <th className="py-2 px-2.5 w-16">Heure</th>
                  <th className="py-2 px-2.5">Réf. Pièce</th>
                  <th className="py-2 px-2.5">Type &amp; Catégorie</th>
                  <th className="py-2 px-2.5">Description &amp; Tiers</th>
                  <th className="py-2 px-2.5">Règlement</th>
                  <th className="py-2 px-2.5 text-right">Encaissement</th>
                  <th className="py-2 px-2.5 text-right">Décaissement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 print:table-row-group">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500 italic bg-slate-50/50">
                      Aucune opération enregistrée pour cette période.
                    </td>
                  </tr>
                ) : (
                  items.map((it) => {
                    const isIncome = it.type === "encaissement";
                    return (
                      <tr key={it.id} className="break-inside-avoid print:break-inside-avoid">
                        <td className="py-2 px-2.5 font-mono text-slate-500 text-[11px]">
                          {new Date(it.date).toLocaleTimeString("fr-DZ", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="py-2 px-2.5 font-mono font-semibold text-slate-800">
                          {it.reference}
                        </td>
                        <td className="py-2 px-2.5">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase mr-1.5 ${
                              isIncome ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {isIncome ? "Entrée" : "Sortie"}
                          </span>
                          <span className="text-slate-600 font-medium">{it.category}</span>
                        </td>
                        <td className="py-2 px-2.5">
                          <span className="text-slate-900 font-medium block">{it.description}</span>
                          <span className="text-slate-500 text-[11px] block">{it.partyName}</span>
                        </td>
                        <td className="py-2 px-2.5">
                          <span
                            className={`text-xs font-medium ${
                              it.affectsCash ? "text-amber-800 font-semibold" : "text-blue-700"
                            }`}
                          >
                            {formatMethodLabel(it.method)}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-emerald-700">
                          {isIncome ? formatDA(it.amount) : "—"}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-semibold text-rose-700">
                          {!isIncome ? formatDA(it.amount) : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="print:table-footer-group bg-slate-50 border-t-2 border-slate-300 font-bold text-slate-900">
                <tr>
                  <td colSpan={5} className="py-2.5 px-3 text-right uppercase text-[11px]">
                    Total Flux de la Période :
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-800">
                    +{formatDA(totalCashIn + nonCashIn)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-rose-800">
                    -{formatDA(totalCashOut + nonCashOut)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Trésorerie Hors Espèces (Bancaire & CIB) */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded mb-8 text-xs">
            <span className="font-bold text-slate-800 block mb-1">
              Synthèse des flux hors espèces (Non imputés au tiroir-caisse physique) :
            </span>
            <div className="flex gap-8 text-slate-600">
              <div>
                Virements / Chèques / CIB Reçus :{" "}
                <span className="font-mono font-semibold text-emerald-700">+{formatDA(nonCashIn)}</span>
              </div>
              <div>
                Règlements Bancaires Émis :{" "}
                <span className="font-mono font-semibold text-rose-700">-{formatDA(nonCashOut)}</span>
              </div>
              <div>
                Solde Net Bancaire / Carte :{" "}
                <span className="font-mono font-bold text-slate-900">{formatDA(nonCashIn - nonCashOut)}</span>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-6 border-t border-slate-300 text-center">
            <div>
              <p className="font-bold text-slate-800 mb-16 uppercase text-[11px]">
                Le Caissier / Vendeur Responsable
              </p>
              <p className="text-[10px] text-slate-400 italic">Visa et signature de service</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 mb-16 uppercase text-[11px]">
                Pour la Direction Shop ERP
              </p>
              <p className="text-[10px] text-slate-400 italic">Visa de contrôle et validation</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 2. FICHE DE CLÔTURE DE CAISSE (A4) ──────────────────────────────────────

export function PrintableCashClosingReport({
  session,
  settings,
  onClose,
  autoPrint,
}: {
  session: {
    reference: string;
    openedAt: string;
    closedAt?: string | null;
    status: string;
    openingAmount: number;
    totalCashIn: number;
    totalCashOut: number;
    theoreticalAmount?: number | null;
    closingAmount?: number | null;
    difference?: number | null;
    openingNotes?: string | null;
    closingNotes?: string | null;
  };
  settings?: ShopSettingsData | null;
  onClose: () => void;
  autoPrint?: boolean;
}) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  React.useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  const handlePrint = () => {
    window.print();
  };

  const diff = session.difference ?? 0;
  const isExact = diff === 0;
  const isSurplus = diff > 0;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center print:p-0 print:bg-white print:fixed print:inset-0"
    >
      <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl p-8 print:p-6 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        {/* Top bar */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Fiche de Clôture de Caisse A4</span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-full bg-slate-900 text-white">
              {session.reference}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm"
            >
              <Printer className="h-4 w-4" />
              Imprimer (A4)
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Corps Imprimable */}
        <div className="text-slate-900 leading-relaxed font-sans text-xs">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-5">
            <div className="flex items-start gap-4">
              {settings?.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt={settings.shopName || "Logo"}
                  className="h-14 w-14 object-contain rounded border border-slate-200 p-1 bg-white print:border-none"
                />
              )}
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                  {settings?.shopName || "Shop ERP Mobilier"}
                </h1>
                <p className="text-slate-500 text-xs mt-0.5 font-medium">
                  {settings?.activity || "Procès-Verbal de Réconciliation & Clôture Journalière"}
                </p>
                <p className="text-slate-400 text-[11px] mt-1">
                  {settings?.address || "Zone Commerciale & Exposition — Alger, Algérie"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-block bg-slate-900 text-white px-3 py-1 font-mono font-bold text-xs tracking-wide rounded-sm uppercase">
                Fiche de Clôture
              </div>
              <p className="font-mono font-bold text-base mt-2 text-slate-900">
                N° {session.reference}
              </p>
            </div>
          </div>

          {/* Horaires et Période */}
          <div className="grid grid-cols-2 gap-6 my-6 bg-slate-50 p-4 rounded border border-slate-200">
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Ouverture de Session :
              </span>
              <p className="font-semibold text-slate-800">
                {formatDateTime(session.openedAt)}
              </p>
              {session.openingNotes && (
                <p className="text-slate-500 text-xs italic mt-0.5">« {session.openingNotes} »</p>
              )}
            </div>
            <div>
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Clôture de Session :
              </span>
              <p className="font-semibold text-slate-800">
                {session.closedAt ? formatDateTime(session.closedAt) : "Session en cours"}
              </p>
              {session.closingNotes && (
                <p className="text-slate-500 text-xs italic mt-0.5">« {session.closingNotes} »</p>
              )}
            </div>
          </div>

          {/* Décomposition comptable */}
          <div className="border border-slate-300 rounded overflow-hidden mb-6">
            <div className="bg-slate-100 px-4 py-2.5 font-bold text-slate-800 border-b border-slate-300 uppercase tracking-wide text-[11px]">
              Décomposition des Flux Physiques (Espèces)
            </div>
            <div className="p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-700">1. Fond de caisse initial (Solde d&apos;ouverture) :</span>
                <span className="font-mono font-semibold text-slate-900">{formatDA(session.openingAmount)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-700">
                <span>2. Total des encaissements physiques perçus :</span>
                <span className="font-mono font-semibold">+{formatDA(session.totalCashIn)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 text-rose-700">
                <span>3. Total des décaissements physiques réalisés :</span>
                <span className="font-mono font-semibold">-{formatDA(session.totalCashOut)}</span>
              </div>
              <div className="flex justify-between py-2 border-t-2 border-slate-300 text-slate-900 font-bold bg-slate-50 px-2 rounded">
                <span>SOLDE THÉORIQUE ATTENDU EN CAISSE :</span>
                <span className="font-mono text-sm text-slate-900">
                  {formatDA(session.theoreticalAmount ?? 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Rapprochement physique & Écart */}
          <div className="border border-slate-300 rounded overflow-hidden mb-8">
            <div className="bg-slate-100 px-4 py-2.5 font-bold text-slate-800 border-b border-slate-300 uppercase tracking-wide text-[11px]">
              Résultat du Comptage Physique &amp; Audit d&apos;Écart
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between items-center text-sm font-bold text-slate-900">
                <span>MONTANT PHYSIQUE RÉELLEMENT COMPTÉ :</span>
                <span className="font-mono text-base text-slate-900 bg-slate-100 px-3 py-1 rounded border border-slate-300">
                  {formatDA(session.closingAmount ?? 0)}
                </span>
              </div>

              <div
                className={`p-3 rounded border flex justify-between items-center ${
                  isExact
                    ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                    : isSurplus
                    ? "bg-blue-50 border-blue-200 text-blue-900"
                    : "bg-rose-50 border-rose-200 text-rose-900"
                }`}
              >
                <div>
                  <span className="font-bold block">
                    {isExact
                      ? "CAISSE EXACTEMENT ÉQUILIBRÉE"
                      : isSurplus
                      ? "EXCÉDENT DE CAISSE CONSTATÉ"
                      : "DÉFICIT / MANQUANT DE CAISSE CONSTATÉ"}
                  </span>
                  <span className="text-[11px] opacity-80">
                    {isExact
                      ? "Le montant physique compté correspond rigoureusement au solde théorique du grand livre."
                      : isSurplus
                      ? "Le tiroir-caisse contient plus de liquidités que prévu par les écritures enregistrées."
                      : "Le tiroir-caisse présente un montant inférieur aux écritures théoriques."}
                  </span>
                </div>
                <div className="font-mono font-bold text-base">
                  {isSurplus ? `+${formatDA(diff)}` : formatDA(diff)}
                </div>
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-6 border-t border-slate-300 text-center">
            <div>
              <p className="font-bold text-slate-800 mb-16 uppercase text-[11px]">
                Le Caissier / Comptable
              </p>
              <p className="text-[10px] text-slate-400 italic">Nom, date et signature</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 mb-16 uppercase text-[11px]">
                Pour la Direction Générale
              </p>
              <p className="text-[10px] text-slate-400 italic">Approbation du procès-verbal de caisse</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 3. REÇU DE PIÈCE DE DÉPENSE / CAISSE (A4 / A5) ──────────────────────────

export function PrintableExpenseVoucher({
  expense,
  settings,
  onClose,
  autoPrint,
}: {
  expense: {
    reference: string;
    type: string;
    category: string;
    description: string;
    amount: number;
    method: string;
    beneficiary?: string | null;
    receiptNumber?: string | null;
    notes?: string | null;
    date: string | Date;
  };
  settings?: ShopSettingsData | null;
  onClose: () => void;
  autoPrint?: boolean;
}) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  React.useEffect(() => {
    if (autoPrint) {
      const timer = setTimeout(() => {
        window.print();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [autoPrint]);

  const handlePrint = () => {
    window.print();
  };

  const isIncome = expense.type === "income";

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center print:p-0 print:bg-white print:fixed print:inset-0"
    >
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl p-8 print:p-6 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        {/* Top Bar */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">
              {isIncome ? "Reçu d'Encaissement" : "Bon de Dépense de Caisse"}
            </span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-full bg-slate-100 text-slate-800">
              {expense.reference}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm"
            >
              <Printer className="h-4 w-4" />
              Imprimer
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Corps Imprimable */}
        <div className="text-slate-900 leading-relaxed font-sans text-xs">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-5">
            <div className="flex items-start gap-3">
              {settings?.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt={settings.shopName || "Logo"}
                  className="h-10 w-10 object-contain rounded border border-slate-200 p-0.5 bg-white print:border-none"
                />
              )}
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                  {settings?.shopName || "Shop ERP Mobilier"}
                </h1>
                <p className="text-slate-500 text-xs mt-0.5">
                  {settings?.activity || "Pièce Comptable de Trésorerie Interne"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div
                className={`inline-block text-white px-3 py-1 font-mono font-bold text-xs tracking-wide rounded-sm uppercase ${
                  isIncome ? "bg-emerald-700" : "bg-rose-800"
                }`}
              >
                {isIncome ? "Reçu d'Entrée Caisse" : "Bon de Décaissement"}
              </div>
              <p className="font-mono font-bold text-sm mt-1.5 text-slate-900">
                N° {expense.reference}
              </p>
              <p className="text-slate-600 text-xs mt-0.5">
                Date : <span className="font-semibold">{formatDate(expense.date)}</span>
              </p>
            </div>
          </div>

          {/* Détails de la pièce */}
          <div className="my-6 bg-slate-50 p-4 rounded border border-slate-200 space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  {isIncome ? "Payeur / Provenance :" : "Bénéficiaire / Destinataire :"}
                </span>
                <p className="font-bold text-sm text-slate-900">
                  {expense.beneficiary || "Interne Magasin"}
                </p>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Catégorie Comptable :
                </span>
                <p className="font-semibold text-slate-800">{expense.category}</p>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                Motif &amp; Description :
              </span>
              <p className="text-slate-800 font-medium">{expense.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Mode de Paiement :
                </span>
                <p className="font-semibold text-slate-900">{formatMethodLabel(expense.method)}</p>
              </div>
              <div>
                <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                  Réf. Pièce Justificative Externe :
                </span>
                <p className="font-mono text-slate-700">{expense.receiptNumber || "—"}</p>
              </div>
            </div>
          </div>

          {/* Montant */}
          <div className="p-4 bg-slate-100 rounded border border-slate-300 flex justify-between items-center mb-8">
            <span className="font-bold text-slate-800 uppercase tracking-wide text-xs">
              {isIncome ? "MONTANT TOTAL ENCAISSÉ :" : "MONTANT TOTAL DÉCAISSÉ :"}
            </span>
            <span className="font-mono text-lg font-black text-slate-900">
              {formatDA(expense.amount)}
            </span>
          </div>

          {expense.notes && (
            <div className="p-3 bg-white border border-slate-200 rounded mb-8 text-xs text-slate-600">
              <span className="font-bold text-slate-700 block mb-0.5">Notes complémentaires :</span>
              <p>{expense.notes}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-300 text-center">
            <div>
              <p className="font-bold text-slate-800 mb-16 uppercase text-[11px]">
                {isIncome ? "Le Déposant" : "Le Bénéficiaire (Pour acquit)"}
              </p>
              <p className="text-[10px] text-slate-400 italic">Signature</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 mb-16 uppercase text-[11px]">
                Le Caissier / Direction (Bon à payer)
              </p>
              <p className="text-[10px] text-slate-400 italic">Cachet &amp; Visa</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 4. RELEVÉ DE COMPTE DE TRÉSORERIE (A4) ──────────────────────────────────

export function PrintableTreasuryAccountStatement({
  account,
  items,
  settings,
  onClose,
}: {
  account: {
    id: number;
    name: string;
    code: string;
    type: string;
    openingBalance: number;
    currentBalance: number;
  };
  items: {
    id: string;
    date: string;
    reference: string;
    type: string;
    typeLabel: string;
    description: string;
    party: string;
    inflow: number;
    outflow: number;
    runningBalance: number;
    method?: string;
  }[];
  settings?: ShopSettingsData | null;
  onClose: () => void;
}) {
  const totalInflows = items.reduce((acc, i) => acc + i.inflow, 0);
  const totalOutflows = items.reduce((acc, i) => acc + i.outflow, 0);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl overflow-hidden print-card">
        {/* Actions bar (non imprimée) */}
        <div className="no-print bg-slate-900 text-white px-6 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold flex items-center gap-2">
            <Printer className="h-4 w-4" />
            Aperçu avant impression &bull; Relevé de Trésorerie
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.print()}
              className="px-3 py-1.5 text-xs font-bold bg-amber-500 text-slate-950 rounded hover:bg-amber-400 transition"
            >
              Imprimer (A4)
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Contenu A4 */}
        <div className="p-8 text-slate-900">
          {/* En-tête officiel */}
          <div className="border-b border-slate-300 pb-4 mb-6 flex justify-between items-start">
            <div>
              <h1 className="text-xl font-black text-slate-900 uppercase tracking-tight">
                {settings?.shopName || "SHOP ERP MOBILIER"}
              </h1>
              <p className="text-xs text-slate-600 mt-0.5">{settings?.activity || "Commerce de Meubles & Décoration"}</p>
              <p className="text-xs text-slate-500">{settings?.address}</p>
              <p className="text-xs text-slate-500">Tél : {settings?.phone}</p>
            </div>
            <div className="text-right">
              <span className="inline-block px-3 py-1 rounded bg-slate-100 border border-slate-300 font-bold text-xs uppercase tracking-wider">
                Relevé de Compte
              </span>
              <p className="font-mono font-bold text-sm text-slate-900 mt-2">{account.name}</p>
              <p className="text-xs text-slate-500 font-mono">Code : {account.code}</p>
              <p className="text-xs text-slate-400 mt-1">Édité le {formatDateTime(new Date().toISOString())}</p>
            </div>
          </div>

          {/* Synthèse soldes */}
          <div className="grid grid-cols-4 gap-3 mb-6 bg-slate-50 p-3.5 rounded border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block">Solde d&apos;ouverture :</span>
              <span className="font-mono font-bold text-slate-900">{formatDA(account.openingBalance)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Total Entrées :</span>
              <span className="font-mono font-bold text-emerald-700">+{formatDA(totalInflows)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Total Sorties :</span>
              <span className="font-mono font-bold text-rose-700">-{formatDA(totalOutflows)}</span>
            </div>
            <div>
              <span className="text-slate-500 block">Solde Actuel :</span>
              <span className="font-mono font-black text-slate-900 text-sm">{formatDA(account.currentBalance)}</span>
            </div>
          </div>

          {/* Table des mouvements */}
          <div className="border border-slate-200 rounded mb-6 overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-700 font-bold uppercase border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Réf</th>
                  <th className="py-2.5 px-3">Type &amp; Description</th>
                  <th className="py-2.5 px-3">Tiers / Info</th>
                  <th className="py-2.5 px-3 text-right">Entrée (+)</th>
                  <th className="py-2.5 px-3 text-right">Sortie (-)</th>
                  <th className="py-2.5 px-3 text-right">Solde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500">
                      Aucun mouvement sur ce compte.
                    </td>
                  </tr>
                ) : (
                  items.map((it) => (
                    <tr key={it.id}>
                      <td className="py-2 px-3 font-mono text-slate-600">
                        {new Date(it.date).toLocaleDateString("fr-DZ")}
                      </td>
                      <td className="py-2 px-3 font-mono font-bold text-slate-800">{it.reference}</td>
                      <td className="py-2 px-3">
                        <span className="font-semibold block">{it.typeLabel}</span>
                        <span className="text-[11px] text-slate-500">{it.description}</span>
                      </td>
                      <td className="py-2 px-3 text-slate-600">{it.party}</td>
                      <td className="py-2 px-3 text-right font-mono text-emerald-700">
                        {it.inflow > 0 ? `+${formatDA(it.inflow)}` : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-rose-700">
                        {it.outflow > 0 ? `-${formatDA(it.outflow)}` : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                        {formatDA(it.runningBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 pt-6 border-t border-slate-300 text-center">
            <div>
              <p className="font-bold text-slate-800 mb-14 uppercase text-[11px]">Le Responsable Trésorerie</p>
              <p className="text-[10px] text-slate-400 italic">Signature</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 mb-14 uppercase text-[11px]">La Direction Générale</p>
              <p className="text-[10px] text-slate-400 italic">Cachet &amp; Visa</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
