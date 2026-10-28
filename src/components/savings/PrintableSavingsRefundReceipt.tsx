"use client";

import React, { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { PrintPortal } from "@/components/common/PrintPortal";
import type { PrintableSavingsReceiptData } from "@/app/savings/actions";

interface PrintableSavingsRefundReceiptProps {
  data: PrintableSavingsReceiptData;
  onClose: () => void;
  autoPrint?: boolean;
}

export function PrintableSavingsRefundReceipt({
  data,
  onClose,
  autoPrint,
}: PrintableSavingsRefundReceiptProps) {
  const { transaction: tx, customer, settings } = data;

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

  const methodLabel =
    tx.paymentMethod === "cash"
      ? "Espèces (Comptant)"
      : tx.paymentMethod === "cib"
      ? "Carte CIB / Edahabia"
      : tx.paymentMethod === "check"
      ? "Chèque bancaire"
      : tx.paymentMethod === "transfer"
      ? "Virement bancaire"
      : tx.paymentMethod;

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
        <div className="relative w-full max-w-2xl bg-white text-slate-900 rounded-xl shadow-2xl p-8 my-8 print:my-0 print:p-0 print:shadow-none print:w-full print:max-w-none print:rounded-none">
          {/* Actions Bar */}
          <div className="no-print flex items-center justify-between pb-4 mb-6 border-b border-slate-200">
            <span className="font-bold text-slate-900 text-sm">
              Reçu de Remboursement d&apos;Épargne Client — {tx.reference}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handlePrint}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                <Printer className="h-4 w-4" />
                Imprimer le reçu
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

          {/* Body */}
          <div className="print-card font-sans text-xs border-2 border-slate-900 print:border-2 print:border-black p-6 rounded-lg print:rounded-none">
            {/* Header */}
            <div className="flex justify-between items-start pb-4 border-b-2 border-slate-900 print:border-black">
              <div className="flex items-start gap-3">
                {settings?.logoUrl && (
                  <img
                    src={settings.logoUrl}
                    alt={settings.shopName || "Logo"}
                    className="h-12 w-12 object-contain rounded border border-slate-200 p-0.5 bg-white print:border-none"
                  />
                )}
                <div>
                  <h2 className="text-xl font-black text-slate-900 print:text-black uppercase">
                    {settings?.shopName || "Shop ERP Mobilier"}
                  </h2>
                  <p className="text-[11px] text-slate-600 print:text-black font-semibold">
                    {settings?.activity || "Magasin d'Ameublement & Décoration d'Intérieur"}
                  </p>
                  <p className="text-[11px] text-slate-600 print:text-black">
                    {settings?.address || "Zone Commerciale — Alger, Algérie"}
                  </p>
                  <p className="text-[11px] text-slate-600 print:text-black font-mono font-bold">
                    Tél : {settings?.phone || "+213 (0) 550 12 34 56"}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="bg-rose-900 text-white print:bg-white print:text-black print:border-2 print:border-black px-2.5 py-1 rounded text-[11px] font-black uppercase tracking-wider">
                  Reçu de Restitution d&apos;Épargne
                </span>
                <p className="text-sm font-mono font-black mt-2 text-slate-900 print:text-black">
                  {tx.reference}
                </p>
                <p className="text-[11px] text-slate-600 print:text-black font-semibold">
                  Date :{" "}
                  {new Date(tx.date).toLocaleDateString("fr-DZ", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
              </div>
            </div>

            {/* Client & Movement Info */}
            <div className="my-4 space-y-2 text-xs">
              <div className="p-3 bg-slate-50 print:bg-white border border-slate-300 print:border-black rounded">
                <p className="text-[11px] text-slate-500 print:text-black font-bold uppercase mb-0.5">
                  Bénéficiaire de la restitution :
                </p>
                <p className="font-black text-slate-900 print:text-black text-base uppercase">
                  {customer.name}
                </p>
                <p className="text-xs text-slate-700 print:text-black font-mono font-bold">
                  Code Client : {customer.code || `CLI-${customer.id}`}
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

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <span className="text-slate-500 print:text-black font-bold uppercase text-[11px]">
                    Mode de restitution :
                  </span>
                  <p className="font-bold text-slate-900 print:text-black uppercase">
                    {methodLabel}
                  </p>
                </div>
                {tx.sessionReference && (
                  <div>
                    <span className="text-slate-500 print:text-black font-bold uppercase text-[11px]">
                      Session de caisse :
                    </span>
                    <p className="font-mono font-bold text-slate-900 print:text-black">
                      {tx.sessionReference}
                    </p>
                  </div>
                )}
              </div>

              {tx.notes && (
                <div className="pt-1">
                  <span className="text-slate-500 print:text-black font-bold uppercase text-[11px]">
                    Motif de restitution :
                  </span>
                  <p className="text-slate-800 print:text-black font-medium">{tx.notes}</p>
                </div>
              )}
            </div>

            {/* Financial Box */}
            <div className="bg-slate-50 print:bg-white border-2 border-slate-900 print:border-black rounded-lg p-4 my-4 space-y-2">
              <div className="flex justify-between items-center text-xs text-slate-700 print:text-black">
                <span className="font-medium">Solde d&apos;épargne avant restitution :</span>
                <span className="font-mono font-bold text-slate-900 print:text-black">
                  {tx.balanceBefore.toLocaleString("fr-DZ")} DA
                </span>
              </div>

              <div className="flex justify-between items-center py-2 border-y-2 border-slate-900 print:border-black">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-wider text-rose-800 print:text-black">
                    MONTANT RESTITUÉ / REMBOURSÉ :
                  </span>
                </div>
                <span className="text-2xl font-mono font-black text-rose-700 print:text-black">
                  -{tx.amount.toLocaleString("fr-DZ")} DA
                </span>
              </div>

              <div className="flex justify-between items-center text-sm font-black pt-1 text-slate-900 print:text-black">
                <span className="uppercase">SOLDE D&apos;ÉPARGNE RESTANT DISPONIBLE :</span>
                <span className="font-mono text-lg font-black text-slate-900 print:text-black">
                  {tx.balanceAfter.toLocaleString("fr-DZ")} DA
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-600 print:text-black italic text-center mt-2">
              Je soussigné(e) confirme avoir reçu l&apos;intégralité de la somme mentionnée ci-dessus
              au titre de la restitution de mon épargne client non consommée.
            </p>

            {/* Signatures */}
            <div className="mt-8 pt-4 border-t-2 border-slate-900 print:border-black grid grid-cols-2 text-center text-xs">
              <div>
                <p className="font-bold text-slate-900 print:text-black mb-10 uppercase text-[11px]">
                  Signature &amp; Mention « Pour acquit » du Client
                </p>
                <div className="w-40 mx-auto border-b-2 border-dashed border-slate-400 print:border-black"></div>
              </div>
              <div>
                <p className="font-bold text-slate-900 print:text-black mb-10 uppercase text-[11px]">
                  Cachet &amp; Signature Caisse
                </p>
                <div className="w-40 mx-auto border-b-2 border-dashed border-slate-400 print:border-black"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PrintPortal>
  );
}

