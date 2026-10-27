"use client";

import React from "react";
import { Printer, X, Download, Loader2 } from "lucide-react";
import type { ShopSettingsData } from "@/app/settings/actions";
import { downloadInventoryPdf } from "@/lib/pdf/inventoryPdf";
import { PrintPortal } from "@/components/common/PrintPortal";



// ─── 2. BON DE TRANSFERT INTER-DÉPÔTS (A4) ────────────────────────────────────

export interface PrintableTransferData {
  reference: string;
  date: string | Date;
  fromLocation?: { name: string; code: string; address?: string | null } | null;
  toLocation?: { name: string; code: string; address?: string | null } | null;
  items: Array<{
    product?: { sku?: string; name?: string; model?: string | null; color?: string | null };
    quantity: number;
    unitCost?: number | null;
  }>;
  notes?: string | null;
  reason?: string | null;
}

export function PrintableStockTransfer({
  transfer,
  settings,
  onClose,
  autoPrint,
}: {
  transfer: PrintableTransferData;
  settings?: ShopSettingsData | null;
  onClose: () => void;
  autoPrint?: boolean;
}) {
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

  const totalQuantity = transfer.items.reduce((acc, it) => acc + (it.quantity || 0), 0);

  return (
    <PrintPortal>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center print:static print:inset-auto print:block print:p-0 print:bg-white print:w-full print:overflow-visible"
    >
      <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl p-8 print:p-0 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Aperçu du Bon de Transfert Inter-Dépôts</span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-full bg-cyan-100 text-cyan-800">
              {transfer.reference}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm"
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

        <div className="text-slate-900 leading-relaxed font-sans text-xs print:text-black">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 print:border-black pb-5">
            <div className="flex items-start gap-3">
              {settings?.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt={settings.shopName || "Logo"}
                  className="h-12 w-12 object-contain rounded border border-slate-200 p-0.5 bg-white print:border-none"
                />
              )}
              <div>
                <h1 className="text-xl font-black text-slate-900 print:text-black uppercase tracking-tight">
                  {settings?.shopName || "Shop ERP Mobilier"}
                </h1>
                <p className="text-slate-500 print:text-black font-semibold text-[11px]">
                  Gestion des Stocks &amp; Logistique Interne
                </p>
                <p className="text-slate-500 print:text-black text-[11px]">{settings?.address || "Alger, Algérie"}</p>
                <p className="text-slate-500 print:text-black text-[11px]">Tél : {settings?.phone || "+213 (0) 550 12 34 56"}</p>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block bg-cyan-700 text-white px-3 py-1 rounded text-xs font-black uppercase tracking-wider print:bg-white print:text-black print:border-2 print:border-black">
                Bon de Transfert
              </span>
              <p className="font-mono text-base font-black text-slate-900 print:text-black mt-1">
                {transfer.reference}
              </p>
              <p className="text-slate-600 print:text-black text-[11px] mt-0.5 font-medium">
                Date :{" "}
                <span className="font-bold">
                  {new Date(transfer.date).toLocaleDateString("fr-DZ", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              </p>
            </div>
          </div>

          {/* Dépôts Origine & Destination */}
          <div className="grid grid-cols-2 gap-6 my-5 bg-slate-50 p-4 rounded-lg border border-slate-200 print:bg-white print:border-2 print:border-black print:p-3">
            <div>
              <p className="text-[10px] uppercase font-black text-rose-600 print:text-black tracking-wider mb-1">
                [ DÉPÔT EXPÉDITEUR — ORIGINE ]
              </p>
              <p className="font-black text-sm text-slate-900 print:text-black uppercase">
                {transfer.fromLocation?.name || "Dépôt Principal"}
              </p>
              <p className="text-slate-600 print:text-black text-xs font-mono font-bold">
                Code : {transfer.fromLocation?.code || "DEP-01"}
              </p>
              {transfer.fromLocation?.address && (
                <p className="text-slate-500 print:text-black text-[11px]">{transfer.fromLocation.address}</p>
              )}
            </div>
            <div className="border-l border-slate-200 print:border-l-2 print:border-black pl-6">
              <p className="text-[10px] uppercase font-black text-emerald-600 print:text-black tracking-wider mb-1">
                [ DÉPÔT RÉCEPTIONNAIRE — DESTINATION ]
              </p>
              <p className="font-black text-sm text-slate-900 print:text-black uppercase">
                {transfer.toLocation?.name || "Magasin Showroom"}
              </p>
              <p className="text-slate-600 print:text-black text-xs font-mono font-bold">
                Code : {transfer.toLocation?.code || "SHOW-01"}
              </p>
              {transfer.toLocation?.address && (
                <p className="text-slate-500 print:text-black text-[11px]">{transfer.toLocation.address}</p>
              )}
            </div>
          </div>

          {/* Tableau des Articles Transférés */}
          <div className="mt-4">
            <table className="w-full text-left border-collapse border border-slate-200 print:border-2 print:border-black">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase text-[10px] tracking-wider border-b border-slate-200 print:bg-white print:text-black print:border-b-2 print:border-black">
                  <th className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black w-12 text-center font-bold print:text-black">N°</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black w-32 font-mono font-bold print:text-black">SKU / Code</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black font-bold print:text-black">Désignation du Produit</th>
                  <th className="py-2.5 px-3 w-28 text-center font-bold print:text-black">Quantité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 print:divide-black text-xs">
                {transfer.items.map((it, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 print:hover:bg-transparent">
                    <td className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black text-center text-slate-400 print:text-black font-mono font-bold">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black font-mono font-black text-slate-800 print:text-black">
                      {it.product?.sku || "—"}
                    </td>
                    <td className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black">
                      <span className="font-bold text-slate-900 print:text-black uppercase">{it.product?.name || "Article"}</span>
                      {(it.product?.model || it.product?.color) && (
                        <span className="block text-slate-500 print:text-black text-[11px] font-medium">
                          {[it.product?.model, it.product?.color].filter(Boolean).join(" — ")}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-black font-mono text-sm text-slate-900 print:text-black">
                      {it.quantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total & Observations */}
          <div className="mt-4 flex justify-between items-start">
            <div className="text-[11px] text-slate-500 print:text-black max-w-sm">
              {transfer.reason && (
                <p>
                  <span className="font-bold text-slate-700 print:text-black">Motif du transfert : </span>
                  {transfer.reason}
                </p>
              )}
              {transfer.notes && (
                <p className="mt-0.5">
                  <span className="font-bold text-slate-700 print:text-black">Notes / Chauffeur : </span>
                  {transfer.notes}
                </p>
              )}
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded p-3 text-xs w-60 text-right print:bg-white print:border-2 print:border-black">
              <span className="text-slate-500 print:text-black font-bold uppercase text-[10px]">Total Pièces Transférées : </span>
              <span className="font-mono font-black text-lg text-slate-900 print:text-black ml-1 block">
                {totalQuantity} pièces
              </span>
            </div>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-8 border-t-2 border-slate-300 print:border-black text-center text-xs mt-8">
            <div>
              <p className="font-black text-slate-800 print:text-black uppercase text-[11px]">
                Visa Dépôt Expéditeur
              </p>
              <p className="text-[10px] text-slate-400 print:text-black italic mb-12">Signature et confirmation de sortie</p>
              <div className="w-48 mx-auto border-b-2 border-dashed border-slate-400 print:border-black"></div>
            </div>
            <div>
              <p className="font-black text-slate-800 print:text-black uppercase text-[11px]">
                Visa Dépôt Réceptionnaire
              </p>
              <p className="text-[10px] text-slate-400 print:text-black italic mb-12">Signature et confirmation d&apos;entrée en stock</p>
              <div className="w-48 mx-auto border-b-2 border-dashed border-slate-400 print:border-black"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </PrintPortal>
  );
}

// ─── 3. FICHE DE COMPTAGE PHYSIQUE D'INVENTAIRE (A4) ──────────────────────────

export interface PrintableInventoryItem {
  id: number;
  sku: string;
  name: string;
  category?: string | null;
  unit: string;
  systemStock: number;
  totalStock?: number;
  locationStocks?: Record<number, number>;
}

export function PrintableInventorySheet({
  locationName,
  locationCode,
  items,
  settings,
  onClose,
  autoPrint,
}: {
  locationName: string;
  locationCode?: string;
  items: PrintableInventoryItem[];
  settings?: ShopSettingsData | null;
  onClose: () => void;
  autoPrint?: boolean;
}) {
  const [isDownloading, setIsDownloading] = React.useState(false);
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

  // Group and sort products by category (alphabetically), then by SKU/designation within each category.
  // Uncategorized products placed at the end.
  const sortedItems = React.useMemo(() => {
    return [...items].sort((a, b) => {
      const catA = (a.category || "").trim();
      const catB = (b.category || "").trim();

      if (!catA && catB) return 1;
      if (catA && !catB) return -1;

      if (catA.toLowerCase() !== catB.toLowerCase()) {
        return catA.localeCompare(catB, "fr", { sensitivity: "base" });
      }

      const skuA = (a.sku || "").trim();
      const skuB = (b.sku || "").trim();
      if (skuA && skuB && skuA.toLowerCase() !== skuB.toLowerCase()) {
        return skuA.localeCompare(skuB, "fr", { numeric: true, sensitivity: "base" });
      }

      const nameA = (a.name || "").trim();
      const nameB = (b.name || "").trim();
      return nameA.localeCompare(nameB, "fr", { sensitivity: "base" });
    });
  }, [items]);

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

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);
      await downloadInventoryPdf({
        data: {
          locationName,
          locationCode,
          isGlobal: !locationCode || locationCode === "GLOBAL",
          items: sortedItems,
        },
        settings,
      });
    } catch (err) {
      console.error("Erreur téléchargement PDF inventaire:", err);
      alert("Une erreur est survenue lors de la génération du fichier PDF.");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <PrintPortal>
      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center print:static print:inset-auto print:block print:p-0 print:bg-white print:w-full print:overflow-visible"
    >
      <div className="relative w-full max-w-5xl bg-white rounded-xl shadow-2xl p-8 print:p-0 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Fiche de Comptage Physique d&apos;Inventaire</span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-full bg-amber-100 text-amber-800">
              {locationName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadPdf}
              disabled={isDownloading}
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                  Génération...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 text-amber-400" />
                  Télécharger PDF (A4)
                </>
              )}
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
            >
              <Printer className="h-4 w-4" />
              Imprimer la Fiche (A4)
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="text-slate-900 leading-relaxed font-sans text-xs print:text-black">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 print:border-black pb-5">
            <div className="flex items-start gap-3">
              {settings?.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt={settings.shopName || "Logo"}
                  className="h-12 w-12 object-contain rounded border border-slate-200 p-0.5 bg-white print:border-none"
                />
              )}
              <div>
                <h1 className="text-xl font-black text-slate-900 print:text-black uppercase tracking-tight">
                  {settings?.shopName || "Shop ERP Mobilier"}
                </h1>
                <p className="text-slate-500 print:text-black font-semibold text-[11px]">
                  Audits Périodiques &amp; Contrôle d&apos;Inventaire Physique
                </p>
                <p className="text-slate-500 print:text-black text-[11px]">{settings?.address || "Alger, Algérie"}</p>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-xs font-black uppercase tracking-wider print:bg-white print:text-black print:border-2 print:border-black">
                Fiche d&apos;Inventaire
              </span>
              <p className="font-bold text-sm text-slate-800 print:text-black mt-1">
                Dépôt : <span className="font-black uppercase">{locationName}</span> {locationCode ? `(${locationCode})` : ""}
              </p>
              <p className="text-slate-600 print:text-black text-[11px] mt-0.5 font-medium">
                Date d&apos;audit :{" "}
                <span className="font-bold">
                  {new Date().toLocaleDateString("fr-DZ", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              </p>
            </div>
          </div>

          {/* Consignes pour l'agent */}
          <div className="bg-amber-50 border border-amber-200 rounded p-3 my-4 text-[11px] text-amber-900 print:bg-white print:border-2 print:border-black print:text-black">
            <span className="font-black uppercase">[ Instructions d&apos;audit ] :</span> Veuillez compter physiquement chaque article dans le dépôt sélectionné, inscrire le chiffre compté dans la colonne blanche « Comptage Réel » et noter les éventuelles dégradations ou anomalies dans la colonne « Observations ».
          </div>

          {/* Tableau d'Inventaire */}
          <div className="mt-4">
            <table className="w-full text-left border-collapse border border-slate-300 print:border-2 print:border-black">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase text-[10px] tracking-wider border-b border-slate-300 print:bg-white print:text-black print:border-b-2 print:border-black">
                  <th className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black w-10 text-center font-bold print:text-black">N°</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black w-28 font-mono font-bold print:text-black">Réf. SKU</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black font-bold print:text-black">Désignation de l&apos;Article</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black w-28 font-bold print:text-black">Catégorie</th>
                  <th className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black w-28 text-center font-bold print:text-black">
                    Stock Dépôt ({locationCode || "DÉPÔT"})
                  </th>
                  <th className="py-2 px-2.5 border-r-2 border-slate-300 print:border-r-2 print:border-black w-28 text-center bg-white print:bg-white font-black text-slate-900 print:text-black">
                    Comptage Réel
                  </th>
                  <th className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black w-20 text-center font-bold print:text-black">Écart</th>
                  <th className="py-2 px-2.5 w-36 text-center font-bold print:text-black">Observations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-300 print:divide-black text-xs">
                {sortedItems.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400 print:text-black italic">
                      Aucun article répertorié dans ce dépôt.
                    </td>
                  </tr>
                ) : (
                  sortedItems.map((it, idx) => (
                    <tr key={it.id} className="hover:bg-slate-50 print:hover:bg-transparent">
                      <td className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black text-center text-slate-400 print:text-black font-mono font-bold">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black font-mono font-black text-slate-800 print:text-black">
                        {it.sku}
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black font-bold text-slate-900 print:text-black">
                        {it.name}
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black text-slate-500 print:text-black">
                        {it.category || "Général"}
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black text-center font-mono font-black text-slate-700 print:text-black">
                        {it.systemStock}
                      </td>
                      <td className="py-2 px-2.5 border-r-2 border-slate-300 print:border-r-2 print:border-black bg-white">
                        {/* Zone blanche pour comptage manuscrit */}
                      </td>
                      <td className="py-2 px-2.5 border-r border-slate-300 print:border-r print:border-black"></td>
                      <td className="py-2 px-2.5"></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-8 border-t-2 border-slate-300 print:border-black text-center text-xs mt-8">
            <div>
              <p className="font-black text-slate-800 print:text-black uppercase text-[11px]">
                L&apos;Agent / Équipe d&apos;Inventaire
              </p>
              <p className="text-[10px] text-slate-400 print:text-black italic mb-12">Nom, date et signature</p>
              <div className="w-48 mx-auto border-b-2 border-dashed border-slate-400 print:border-black"></div>
            </div>
            <div>
              <p className="font-black text-slate-800 print:text-black uppercase text-[11px]">
                Le Responsable des Stocks / Direction
              </p>
              <p className="text-[10px] text-slate-400 print:text-black italic mb-12">Visa de validation et clôture d&apos;audit</p>
              <div className="w-48 mx-auto border-b-2 border-dashed border-slate-400 print:border-black"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </PrintPortal>
  );
}

// ─── 4. RELEVÉ DE COMPTE CLIENT / FOURNISSEUR (A4) ────────────────────────────

export interface StatementEntry {
  date: string | Date;
  reference: string;
  label: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface PrintableAccountStatementData {
  type: "customer" | "supplier";
  party: {
    id: number;
    name: string;
    code?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  startDate?: string;
  endDate?: string;
  entries: StatementEntry[];
  totalDebit: number;
  totalCredit: number;
  finalBalance: number;
}

export function PrintableAccountStatement({
  statement,
  settings,
  onClose,
  autoPrint,
}: {
  statement: PrintableAccountStatementData;
  settings?: ShopSettingsData | null;
  onClose: () => void;
  autoPrint?: boolean;
}) {
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

  const isCustomer = statement.type === "customer";
  const title = isCustomer ? "Relevé de Compte Client" : "Relevé de Compte Fournisseur";

  return (
    <PrintPortal>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center print:static print:inset-auto print:block print:p-0 print:bg-white print:w-full print:overflow-visible">
      <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl p-8 print:p-0 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">{title}</span>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-indigo-100 text-indigo-800">
              {statement.party.name}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm"
            >
              <Printer className="h-4 w-4" />
              Imprimer le Relevé (A4)
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="text-slate-900 leading-relaxed font-sans text-xs print:text-black">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 print:border-black pb-5">
            <div className="flex items-start gap-3">
              {settings?.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt={settings.shopName || "Logo"}
                  className="h-12 w-12 object-contain rounded border border-slate-200 p-0.5 bg-white print:border-none"
                />
              )}
              <div>
                <h1 className="text-xl font-black text-slate-900 print:text-black uppercase tracking-tight">
                  {settings?.shopName || "Shop ERP Mobilier"}
                </h1>
                <p className="text-slate-500 print:text-black font-semibold text-[11px]">
                  Direction Commerciale &amp; Comptabilité Tiers
                </p>
                <p className="text-slate-500 print:text-black text-[11px]">{settings?.address || "Alger, Algérie"}</p>
                <p className="text-slate-500 print:text-black text-[11px]">Tél : {settings?.phone || "+213 (0) 550 12 34 56"}</p>
              </div>
            </div>

            <div className="text-right">
              <span className="inline-block bg-indigo-700 text-white px-3 py-1 rounded text-xs font-black uppercase tracking-wider print:bg-white print:text-black print:border-2 print:border-black">
                {title}
              </span>
              <p className="text-slate-600 print:text-black text-[11px] mt-1 font-medium">
                Arrêté au :{" "}
                <span className="font-bold">
                  {new Date().toLocaleDateString("fr-DZ", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              </p>
              {(statement.startDate || statement.endDate) && (
                <p className="text-slate-500 print:text-black text-[10px] font-medium">
                  Période : {statement.startDate || "Début"} au {statement.endDate || "Ce jour"}
                </p>
              )}
            </div>
          </div>

          {/* Fiche Tiers */}
          <div className="my-5 bg-slate-50 p-4 rounded-lg border border-slate-200 print:bg-white print:border-2 print:border-black print:p-3">
            <p className="text-[10px] uppercase font-black text-slate-400 print:text-black tracking-wider mb-1">
              [ {isCustomer ? "COORDONNÉES DU CLIENT" : "COORDONNÉES DU FOURNISSEUR"} ]
            </p>
            <div className="flex justify-between items-center">
              <div>
                <p className="font-black text-base text-slate-900 print:text-black uppercase">{statement.party.name}</p>
                {statement.party.code && (
                  <p className="text-slate-500 print:text-black text-xs font-mono font-bold">Code : {statement.party.code}</p>
                )}
                {statement.party.phone && (
                  <p className="text-slate-600 print:text-black text-xs font-medium">Tél : {statement.party.phone}</p>
                )}
                {statement.party.address && (
                  <p className="text-slate-600 print:text-black text-xs">{statement.party.address}</p>
                )}
              </div>
              <div className="text-right bg-white p-3 rounded border border-slate-200 print:border-2 print:border-black">
                <p className="text-[10px] text-slate-500 print:text-black uppercase font-bold">Solde Net Exigible :</p>
                <p
                  className={`text-lg font-mono font-black ${
                    statement.finalBalance > 0 ? "text-rose-700" : "text-emerald-700"
                  } print:text-black`}
                >
                  {statement.finalBalance.toLocaleString("fr-DZ")} DA
                </p>
              </div>
            </div>
          </div>

          {/* Tableau Chronologique des Opérations */}
          <div className="mt-4">
            <table className="w-full text-left border-collapse border border-slate-200 print:border-2 print:border-black">
              <thead>
                <tr className="bg-slate-100 text-slate-700 uppercase text-[10px] tracking-wider border-b border-slate-200 print:bg-white print:text-black print:border-b-2 print:border-black">
                  <th className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black w-24 font-bold print:text-black">Date</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black w-32 font-mono font-bold print:text-black">N° Pièce</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black font-bold print:text-black">Libellé de l&apos;Opération</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black w-28 text-right font-bold print:text-black">Débit (+)</th>
                  <th className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black w-28 text-right font-bold print:text-black">Crédit (-)</th>
                  <th className="py-2.5 px-3 w-32 text-right font-bold print:text-black">Solde Dû (DA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 print:divide-black text-xs">
                {statement.entries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400 print:text-black italic">
                      Aucune transaction enregistrée pour ce tiers.
                    </td>
                  </tr>
                ) : (
                  statement.entries.map((en, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 print:hover:bg-transparent">
                      <td className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black text-slate-600 print:text-black font-medium">
                        {new Date(en.date).toLocaleDateString("fr-DZ")}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black font-mono font-bold text-slate-800 print:text-black">
                        {en.reference}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black text-slate-800 print:text-black">
                        {en.label}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black text-right font-mono text-slate-900 print:text-black font-bold">
                        {en.debit > 0 ? `${en.debit.toLocaleString("fr-DZ")} DA` : "—"}
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200 print:border-r print:border-black text-right font-mono text-emerald-700 print:text-black font-bold">
                        {en.credit > 0 ? `${en.credit.toLocaleString("fr-DZ")} DA` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 print:text-black">
                        {en.balance.toLocaleString("fr-DZ")} DA
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot className="bg-slate-100 font-bold border-t-2 border-slate-300 print:bg-white print:border-t-2 print:border-b-2 print:border-black text-xs">
                <tr>
                  <td colSpan={3} className="py-2.5 px-3 text-right uppercase font-black print:text-black">
                    Totaux Période :
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-900 print:text-black font-black">
                    {statement.totalDebit.toLocaleString("fr-DZ")} DA
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-700 print:text-black font-black">
                    {statement.totalCredit.toLocaleString("fr-DZ")} DA
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-amber-800 print:text-black font-black text-sm">
                    {statement.finalBalance.toLocaleString("fr-DZ")} DA
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mentions & Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-8 border-t-2 border-slate-300 print:border-black text-center text-xs mt-8">
            <div>
              <p className="font-black text-slate-800 print:text-black uppercase text-[11px] mb-12">
                Visa et Accord du Tiers
              </p>
              <div className="w-48 mx-auto border-b-2 border-dashed border-slate-400 print:border-black"></div>
            </div>
            <div>
              <p className="font-black text-slate-800 print:text-black uppercase text-[11px] mb-12">
                Pour la Direction Shop ERP
              </p>
              <div className="w-48 mx-auto border-b-2 border-dashed border-slate-400 print:border-black"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
    </PrintPortal>
  );
}
