"use client";

import React, { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { PrintPortal } from "@/components/common/PrintPortal";
import type { PrintableSavingsStatementData, SavingsStatementEntry } from "@/app/savings/actions";

interface PrintableSavingsStatementProps {
  data: PrintableSavingsStatementData;
  onClose: () => void;
  autoPrint?: boolean;
}

export function PrintableSavingsStatement({
  data,
  onClose,
  autoPrint,
}: PrintableSavingsStatementProps) {
  const { customer, account, startDate, endDate, entries, totalInflows, totalOutflows, currentBalance, settings } = data;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
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

  return (
    <PrintPortal>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static print:overflow-visible print:w-full print:max-w-none print:inset-auto print:block"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        <div className="relative w-full max-w-4xl bg-white text-slate-900 rounded-xl shadow-2xl p-8 my-8 print:my-0 print:p-0 print:shadow-none print:w-full max-h-[92vh] flex flex-col print:max-h-none print:block">
          {/* Actions Bar */}
          <div className="no-print flex items-center justify-between pb-4 mb-4 border-b border-slate-200 shrink-0">
            <span className="font-bold text-slate-900 text-sm">
              Relevé de Compte d&apos;Épargne Client — {customer.name}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                Imprimer le relevé
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Fermer (Échap)"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Statement Printable Container */}
          <div className="overflow-y-auto flex-1 pr-1 print:overflow-visible print:p-0">
            <div className="print-card font-sans text-xs">
              {/* Header */}
              <div className="flex justify-between items-start pb-6 border-b-2 border-slate-900 print:border-black">
                <div className="flex items-start gap-4">
                  {settings?.logoUrl && (
                    <img
                      src={settings.logoUrl}
                      alt={settings.shopName || "Logo"}
                      className="h-14 w-14 object-contain rounded border border-slate-200 p-1 bg-white print:border-none"
                    />
                  )}
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-slate-900 print:text-black uppercase">
                      {settings?.shopName || "Shop ERP Mobilier"}
                    </h1>
                    <p className="text-xs text-slate-700 print:text-black font-semibold mt-0.5">
                      {settings?.activity || "Magasin d'Ameublement, Salons & Décoration d'Intérieur"}
                    </p>
                    <div className="text-[11px] text-slate-600 print:text-black mt-1 space-y-0.5">
                      <p>{settings?.address || "Zone Commerciale & Exposition — Alger, Algérie"}</p>
                      <p>
                        Tél : <span className="font-mono font-bold">{settings?.phone || "+213 (0) 550 12 34 56"}</span>
                      </p>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-xs font-black uppercase tracking-wider print:bg-white print:text-black print:border-2 print:border-black">
                    RELEVÉ DE COMPTE ÉPARGNE &amp; AVOIRS
                  </span>
                  <p className="text-xs text-slate-600 print:text-black mt-2 font-medium">
                    Date d&apos;édition :{" "}
                    <span className="font-bold text-slate-900 print:text-black">
                      {new Date().toLocaleDateString("fr-DZ", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                  </p>
                  {(startDate || endDate) && (
                    <p className="text-[11px] text-slate-600 print:text-black font-medium">
                      Période : {startDate ? new Date(startDate).toLocaleDateString("fr-DZ") : "Origine"} au{" "}
                      {endDate ? new Date(endDate).toLocaleDateString("fr-DZ") : "Ce jour"}
                    </p>
                  )}
                </div>
              </div>

              {/* Customer Box */}
              <div className="grid grid-cols-2 gap-6 my-5 p-4 rounded-lg bg-slate-50 border border-slate-300 print:bg-white print:border-black print:border-2">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 print:text-black mb-1">
                    Client Titulaire du Compte :
                  </p>
                  <p className="font-black text-base text-slate-900 print:text-black uppercase">
                    {customer.name}
                  </p>
                  <p className="text-xs text-slate-700 print:text-black">
                    <span className="font-bold">Code Client : </span>
                    <span className="font-mono font-bold">{customer.code || `CLI-${customer.id}`}</span>
                  </p>
                  {customer.phone && (
                    <p
                      className="text-[16px] print:text-[16px] font-bold text-black print:text-black"
                      style={{ fontSize: "16px", color: "#000000" }}
                    >
                      <span className="font-bold">Tél : </span>
                      <span className="font-mono font-bold">{customer.phone}</span>
                    </p>
                  )}
                  {customer.phone2 && (
                    <p
                      className="text-[16px] print:text-[16px] font-bold text-black print:text-black"
                      style={{ fontSize: "16px", color: "#000000" }}
                    >
                      <span className="font-bold">Tél 2 : </span>
                      <span className="font-mono font-bold">{customer.phone2}</span>
                    </p>
                  )}
                  {customer.address && (
                    <p className="text-xs text-slate-700 print:text-black">
                      <span className="font-bold">Adresse : </span>
                      {customer.address}
                    </p>
                  )}
                </div>

                <div className="border-l border-slate-300 print:border-black pl-6 flex flex-col justify-center">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 print:text-black mb-1">
                    Situation du Compte d&apos;Épargne :
                  </span>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600 print:text-black">Total Dépôts Cumulés :</span>
                      <span className="font-mono font-bold text-slate-900 print:text-black">
                        {account.totalDeposited.toLocaleString("fr-DZ")} DA
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 print:text-black">Utilisations sur Achats :</span>
                      <span className="font-mono font-bold text-slate-900 print:text-black">
                        -{account.totalUsed.toLocaleString("fr-DZ")} DA
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600 print:text-black">Remboursements Effectués :</span>
                      <span className="font-mono font-bold text-slate-900 print:text-black">
                        -{account.totalRefunded.toLocaleString("fr-DZ")} DA
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-300 print:border-black font-black text-sm">
                      <span className="uppercase text-slate-900 print:text-black">SOLDE DISPONIBLE :</span>
                      <span className="font-mono text-base text-slate-900 print:text-black">
                        {currentBalance.toLocaleString("fr-DZ")} DA
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Transactions Table */}
              <div className="overflow-hidden border border-slate-300 print:border-black print:border-2 rounded-lg print:rounded-none my-4">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 print:bg-white border-b-2 border-slate-300 print:border-black text-[11px] font-black text-slate-900 print:text-black">
                      <th className="py-2.5 px-3 print:border-r print:border-black">Date</th>
                      <th className="py-2.5 px-3 print:border-r print:border-black">Référence</th>
                      <th className="py-2.5 px-3 print:border-r print:border-black">Type d&apos;Opération</th>
                      <th className="py-2.5 px-3 print:border-r print:border-black">Désignation / Pièce</th>
                      <th className="py-2.5 px-3 text-right print:border-r print:border-black">Entrée / Dépôt (DA)</th>
                      <th className="py-2.5 px-3 text-right print:border-r print:border-black">Sortie / Déduction (DA)</th>
                      <th className="py-2.5 px-3 text-right">Solde Cumulé (DA)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 print:divide-black text-xs">
                    {entries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-500 italic">
                          Aucun mouvement d&apos;épargne enregistré pour cette période.
                        </td>
                      </tr>
                    ) : (
                      entries.map((entry: SavingsStatementEntry) => (
                        <tr key={entry.id} className="print:border-b print:border-black">
                          <td className="py-2 px-3 text-slate-700 print:text-black font-medium print:border-r print:border-black">
                            {new Date(entry.date).toLocaleDateString("fr-DZ", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                            })}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-slate-900 print:text-black print:border-r print:border-black">
                            {entry.reference}
                          </td>
                          <td className="py-2 px-3 print:border-r print:border-black font-semibold text-slate-800 print:text-black">
                            {entry.typeLabel}
                          </td>
                          <td className="py-2 px-3 print:border-r print:border-black text-slate-700 print:text-black">
                            {entry.description}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700 print:text-black print:border-r print:border-black">
                            {entry.inflow > 0 ? `+${entry.inflow.toLocaleString("fr-DZ")}` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-rose-700 print:text-black print:border-r print:border-black">
                            {entry.outflow > 0 ? `-${entry.outflow.toLocaleString("fr-DZ")}` : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-black text-slate-900 print:text-black">
                            {entry.runningBalance.toLocaleString("fr-DZ")}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 print:bg-white border-t-2 border-slate-900 print:border-black font-black text-xs text-slate-900 print:text-black">
                      <td colSpan={4} className="py-2.5 px-3 uppercase text-right print:border-r print:border-black">
                        Totaux Période :
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono print:border-r print:border-black">
                        +{totalInflows.toLocaleString("fr-DZ")} DA
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono print:border-r print:border-black">
                        -{totalOutflows.toLocaleString("fr-DZ")} DA
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-sm">
                        {currentBalance.toLocaleString("fr-DZ")} DA
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Signatures */}
              <div className="mt-8 pt-6 border-t-2 border-slate-900 print:border-black grid grid-cols-2 text-center text-xs">
                <div>
                  <p className="font-bold text-slate-900 print:text-black mb-12 uppercase text-[11px]">
                    Signature du Client
                  </p>
                  <div className="w-52 mx-auto border-b-2 border-dashed border-slate-400 print:border-black"></div>
                  <p className="text-[10px] text-slate-500 print:text-black mt-1">Mention « Lu et certifié conforme »</p>
                </div>
                <div>
                  <p className="font-bold text-slate-900 print:text-black mb-12 uppercase text-[11px]">
                    Cachet et Signature de la Direction
                  </p>
                  <div className="w-52 mx-auto border-b-2 border-dashed border-slate-400 print:border-black"></div>
                  <p className="text-[10px] text-slate-500 print:text-black mt-1">Pour la direction financière</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PrintPortal>
  );
}

