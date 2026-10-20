"use client";

import React, { useState, useEffect } from "react";
import { Printer, Download, X } from "lucide-react";
import type { ShopSettingsData } from "@/app/settings/actions";
import { downloadInvoicePdf, type InvoiceCopyType } from "@/lib/pdf/invoicePdf";

export interface PrintableSaleItem {
  id?: number;
  product?: {
    sku?: string;
    name?: string;
    model?: string | null;
    color?: string | null;
  };
  location?: {
    name?: string;
  } | null;
  quantity: number;
  unitPrice: number;
  discount?: number;
  subtotal: number;
}

export interface PrintablePayment {
  id?: number;
  reference?: string | null;
  amount: number;
  method?: string;
  paymentDate: string | Date;
  notes?: string | null;
}

export interface PrintableDelivery {
  id: number;
  reference: string;
  status: string;
  method?: string;
  fee: number;
  address?: string | null;
  deliveryDate?: string | Date | null;
  deliveredAt?: string | Date | null;
  carrierName?: string | null;
  recipientName?: string | null;
  notes?: string | null;
}

export interface PrintableSale {
  id: number;
  reference: string;
  status: string;
  paymentStatus: string;
  deliveryStatus?: string;
  saleDate: string | Date;
  subtotal?: number;
  discount?: number;
  deliveryFee: number;
  includeDeliveryFee?: boolean;
  totalAmount: number;
  paidAmount: number;
  notes?: string | null;
  customer?: {
    id: number;
    code?: string | null;
    name: string;
    phone?: string | null;
    phone2?: string | null;
    address?: string | null;
  } | null;
  items?: PrintableSaleItem[];
  payments?: PrintablePayment[];
  deliveries?: PrintableDelivery[];
}

interface PrintableInvoiceProps {
  sale: PrintableSale;
  settings?: ShopSettingsData | null;
  onClose: () => void;
}

export function PrintableInvoice({ sale, settings, onClose }: PrintableInvoiceProps) {
  const [copyType, setCopyType] = useState<InvoiceCopyType>("client");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async (type: InvoiceCopyType) => {
    try {
      setIsDownloadingPdf(true);
      await downloadInvoicePdf(sale, settings, type);
    } catch (err) {
      console.error("Erreur téléchargement PDF facture:", err);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const isDraft = sale.status === "draft";
  const isCancelled = sale.status === "cancelled";
  const docTitle = isCancelled
    ? "FACTURE ANNULÉE"
    : isDraft
    ? "DEVIS / BON DE COMMANDE"
    : "FACTURE DE VENTE";

  const remainingBalance = Math.max(0, (sale.totalAmount || 0) - (sale.paidAmount || 0));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-4xl bg-white text-slate-900 rounded-xl shadow-2xl p-8 my-8 print:my-0 print:p-0 print:shadow-none print:w-full max-h-[92vh] flex flex-col">
        {/* Actions bar (hidden in print) */}
        <div className="no-print flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-xs uppercase tracking-wider text-slate-500 mr-1">Version :</span>
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs">
              <button
                type="button"
                onClick={() => setCopyType("client")}
                className={`px-3 py-1 font-bold rounded-md transition cursor-pointer ${
                  copyType === "client"
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Exemplaire Client
              </button>
              <button
                type="button"
                onClick={() => setCopyType("internal")}
                className={`px-3 py-1 font-bold rounded-md transition cursor-pointer ${
                  copyType === "internal"
                    ? "bg-amber-600 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Exemplaire Interne
              </button>
              <button
                type="button"
                onClick={() => setCopyType("both")}
                className={`px-3 py-1 font-bold rounded-md transition cursor-pointer ${
                  copyType === "both"
                    ? "bg-slate-700 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Les 2 Exemplaires
              </button>
            </div>

            {isDraft && (
              <span className="rounded-full bg-amber-100 text-amber-800 text-[11px] px-2.5 py-0.5 font-bold">
                Brouillon / Devis
              </span>
            )}
            {isCancelled && (
              <span className="rounded-full bg-rose-100 text-rose-800 text-[11px] px-2.5 py-0.5 font-bold">
                Vente Annulée
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleDownloadPdf(copyType)}
              disabled={isDownloadingPdf}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
              title="Télécharger le fichier PDF directement"
            >
              <Download className="h-3.5 w-3.5 text-slate-600" />
              {isDownloadingPdf ? "Génération PDF..." : "Télécharger PDF"}
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-slate-900 px-3.5 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimer
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Fermer (Échap)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Printable Container to prevent clipping */}
        <div className="overflow-y-auto flex-1 pr-1">

        {/* ── Document Printable Body ────────────────────────────────────────── */}
        <div className="print-card font-sans text-sm">
          {/* Header */}
          <div className="flex justify-between items-start pb-6 border-b border-slate-300">
            <div className="flex items-start gap-4">
              {settings?.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt={settings.shopName || "Logo"}
                  className="h-16 w-16 object-contain rounded border border-slate-200 p-1 bg-white print:border-none"
                />
              )}
              <div>
                <h1 className="text-2xl font-black tracking-tight text-slate-900 uppercase">
                  {settings?.shopName || "Shop ERP Mobilier"}
                </h1>
                <p className="text-xs text-slate-600 font-medium mt-0.5">
                  {settings?.activity || "Magasin d'Ameublement, Salons & Décoration d'Intérieur"}
                </p>
                <div className="text-xs text-slate-500 mt-2 space-y-0.5">
                  <p>{settings?.address || "Zone Commerciale & Exposition — Alger, Algérie"}</p>
                  <p>Tél : {settings?.phone || "+213 (0) 550 12 34 56 / +213 (0) 23 45 67 89"}</p>
                  {settings?.email && <p>Email : {settings.email}</p>}
                  <p>NIF / Registre de Commerce : {settings?.nifRc || "002416000000000"}</p>
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="mb-2">
                <span className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-xs font-bold uppercase tracking-wider">
                  {docTitle}
                </span>
              </div>
              <p className="text-lg font-mono font-bold text-slate-900">{sale.reference}</p>
              <p className="text-xs text-slate-500 mt-1">
                Date :{" "}
                <span className="font-semibold text-slate-800">
                  {new Date(sale.saleDate).toLocaleDateString("fr-DZ", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                Statut règlement :{" "}
                <span className="font-semibold text-slate-800">
                  {sale.paymentStatus === "paid"
                    ? "Payée (Comptant)"
                    : sale.paymentStatus === "partial"
                    ? "Partiellement réglée"
                    : "À crédit / Non réglée"}
                </span>
              </p>
            </div>
          </div>

          {/* Client & Livraison Info */}
          <div className="grid grid-cols-2 gap-6 my-6 p-4 rounded-lg bg-slate-50 border border-slate-200">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Client / Destinataire :
              </p>
              {sale.customer ? (
                <div>
                  <p className="font-bold text-base text-slate-900">{sale.customer.name}</p>
                  <p className="text-xs text-slate-600">
                    <span className="font-medium text-slate-500">Réf : </span>
                    {sale.customer.code || `CLI-${sale.customer.id}`}
                  </p>
                  {sale.customer.phone && (
                    <p className="text-xs text-slate-600">
                      <span className="font-medium text-slate-500">Tél : </span>
                      {sale.customer.phone}
                      {sale.customer.phone2 && (
                        <span className="ml-1 text-slate-500">/ {sale.customer.phone2}</span>
                      )}
                    </p>
                  )}
                  {sale.customer.address && (
                    <p className="text-xs text-slate-600">
                      <span className="font-medium text-slate-500">Adresse : </span>
                      {sale.customer.address}
                    </p>
                  )}
                </div>
              ) : (
                <div>
                  <p className="font-bold text-base text-slate-800">Client Passager / Comptoir</p>
                  <p className="text-xs text-slate-500">Vente directe en magasin</p>
                </div>
              )}
            </div>

            <div className="border-l border-slate-200 pl-6">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                Modalités de Livraison :
              </p>
              {sale.deliveryFee > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-800">
                    Livraison facturée
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">
                    <span className="font-medium text-slate-500">Frais de livraison : </span>
                    <span className="font-mono font-bold text-slate-900">
                      {sale.deliveryFee.toLocaleString("fr-DZ")} DA
                    </span>
                    {sale.includeDeliveryFee === false && (
                      <span className="text-slate-500 text-[11px] ml-1">(non inclus au total)</span>
                    )}
                  </p>
                  {sale.customer?.address && (
                    <p className="text-xs text-slate-600">
                      <span className="font-medium text-slate-500">Adresse client : </span>
                      {sale.customer.address}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  Enlèvement immédiat par le client en magasin / dépôt.
                </p>
              )}
            </div>
          </div>

          {/* Table des articles */}
          <div className="overflow-hidden border border-slate-300 rounded-lg">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-xs font-semibold text-slate-700">
                  <th className="py-2.5 px-3 w-10 text-center">N°</th>
                  <th className="py-2.5 px-3">Réf / SKU</th>
                  <th className="py-2.5 px-3">Désignation du Meuble</th>
                  {copyType === "internal" && <th className="py-2.5 px-3">Dépôt</th>}
                  <th className="py-2.5 px-3 text-center">Qté</th>
                  <th className="py-2.5 px-3 text-right">P.U (DA)</th>
                  <th className="py-2.5 px-3 text-right">Remise</th>
                  <th className="py-2.5 px-3 text-right">Total (DA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-xs">
                {sale.items?.map((item: PrintableSaleItem, idx: number) => (
                  <tr key={item.id || idx}>
                    <td className="py-2.5 px-3 text-center text-slate-500">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-900">
                      {item.product?.sku || "MEUBLE"}
                    </td>
                    <td className="py-2.5 px-3">
                      <p className="font-semibold text-slate-900">{item.product?.name}</p>
                      {(item.product?.model || item.product?.color) && (
                        <p className="text-[11px] text-slate-500">
                          {[item.product?.model, item.product?.color].filter(Boolean).join(" • ")}
                        </p>
                      )}
                    </td>
                    {copyType === "internal" && (
                      <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">
                        {item.location?.name || "Dépôt principal"}
                      </td>
                    )}
                    <td className="py-2.5 px-3 text-center font-bold text-slate-800">
                      {item.quantity}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">
                      {item.unitPrice.toLocaleString("fr-DZ")}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-500">
                      {item.discount && item.discount > 0 ? `-${item.discount.toLocaleString("fr-DZ")}` : "—"}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                      {item.subtotal.toLocaleString("fr-DZ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totaux & Règlements */}
          <div className="grid grid-cols-2 gap-8 my-6">
            {/* Notes ou versements */}
            <div className="text-xs space-y-2">
              {copyType === "internal" && sale.notes && (
                <div className="p-3 bg-amber-50/70 border border-amber-300 rounded">
                  <p className="font-bold text-amber-900 mb-0.5">Observations &amp; Directives Internes Magasin :</p>
                  <p className="text-slate-700 whitespace-pre-line">{sale.notes}</p>
                </div>
              )}

              {sale.payments && sale.payments.length > 0 && (
                <div>
                  <p className="font-bold text-slate-700 mb-1">Règlements enregistrés :</p>
                  <div className="space-y-1">
                    {sale.payments.map((p: PrintablePayment) => (
                      <div
                        key={p.id}
                        className="flex justify-between items-center text-[11px] p-1.5 bg-slate-50 rounded border border-slate-200"
                      >
                        <div>
                          <span className="font-semibold text-slate-800">
                            {new Date(p.paymentDate).toLocaleDateString("fr-DZ")}
                          </span>
                          <span className="text-slate-500 ml-1">
                            ({p.method === "cash" ? "Espèces" : p.method === "cib" ? "CIB" : p.method === "check" ? "Chèque" : "Virement"})
                          </span>
                          <span className="font-mono text-slate-400 ml-1">[{p.reference}]</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900">
                          {p.amount.toLocaleString("fr-DZ")} DA
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Total box */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Sous-total articles :</span>
                <span className="font-mono font-semibold">
                  {(sale.subtotal || 0).toLocaleString("fr-DZ")} DA
                </span>
              </div>

              {sale.deliveryFee > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>
                    Frais de livraison{sale.includeDeliveryFee === false ? " (hors facture)" : ""} :
                  </span>
                  <span className="font-mono font-semibold">
                    {sale.includeDeliveryFee === false ? "" : "+"}
                    {sale.deliveryFee.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
              )}

              {Boolean(sale.discount && sale.discount > 0) && (
                <div className="flex justify-between text-emerald-700">
                  <span>Remise accordée :</span>
                  <span className="font-mono font-semibold">
                    -{(sale.discount || 0).toLocaleString("fr-DZ")} DA
                  </span>
                </div>
              )}

              <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-300">
                <span>TOTAL GÉNÉRAL TTC :</span>
                <span className="font-mono text-lg text-amber-700">
                  {(sale.totalAmount || 0).toLocaleString("fr-DZ")} DA
                </span>
              </div>

              <div className="flex justify-between text-slate-700 pt-1">
                <span>Montant réglé / Acompte :</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {(sale.paidAmount || 0).toLocaleString("fr-DZ")} DA
                </span>
              </div>

              <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-300">
                <span className={remainingBalance > 0 ? "text-rose-700" : "text-emerald-700"}>
                  RESTE À PAYER (SOLDE) :
                </span>
                <span
                  className={`font-mono text-base ${
                    remainingBalance > 0 ? "text-rose-700 font-black" : "text-emerald-700"
                  }`}
                >
                  {remainingBalance.toLocaleString("fr-DZ")} DA
                </span>
              </div>
            </div>
          </div>

          {/* Mentions & Signatures */}
          <div className="mt-8 pt-6 border-t border-slate-300 text-xs">
            <p className="text-slate-500 italic text-center mb-4">
              Arrêté la présente facture à la somme de{" "}
              <span className="font-semibold text-slate-800">
                {(sale.totalAmount || 0).toLocaleString("fr-DZ")} {settings?.currency || "DA"}
              </span>
              . Les marchandises livrées demeurent la propriété du vendeur jusqu&apos;au paiement intégral.
            </p>

            {settings?.documentFooter && (
              <p className="text-slate-600 text-[11px] text-center mb-6 px-4 font-medium">
                {settings.documentFooter}
              </p>
            )}

            <div className="grid grid-cols-2 gap-12 text-center">
              <div>
                <p className="font-bold text-slate-700 mb-12">Signature et accord du Client</p>
                <div className="w-48 mx-auto border-b border-slate-400"></div>
              </div>
              <div>
                <p className="font-bold text-slate-700 mb-12">Cachet et Signature du Magasin</p>
                <div className="w-48 mx-auto border-b border-slate-400"></div>
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}

interface PrintablePaymentReceiptProps {
  payment: PrintablePayment;
  sale: PrintableSale;
  settings?: ShopSettingsData | null;
  onClose: () => void;
}

export function PrintablePaymentReceipt({
  payment,
  sale,
  settings,
  onClose,
}: PrintablePaymentReceiptProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!payment || !sale) return null;

  const handlePrint = () => {
    window.print();
  };

  const remainingBalance = Math.max(0, (sale.totalAmount || 0) - (sale.paidAmount || 0));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-2xl bg-white text-slate-900 rounded-xl shadow-2xl p-8 my-8 print:my-0 print:p-0 print:shadow-none print:w-full">
        {/* Actions bar */}
        <div className="no-print flex items-center justify-between pb-4 mb-6 border-b border-slate-200">
          <span className="font-semibold text-slate-800">Reçu de Versement Client</span>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg font-medium shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              Imprimer le reçu
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Fermer (Échap)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Reçu Body */}
        <div className="print-card font-sans text-xs border-2 border-slate-300 p-6 rounded-lg">
          <div className="flex justify-between items-start pb-4 border-b border-slate-200">
            <div className="flex items-start gap-3">
              {settings?.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt={settings.shopName || "Logo"}
                  className="h-10 w-10 object-contain rounded border border-slate-200 p-0.5 bg-white print:border-none"
                />
              )}
              <div>
                <h2 className="text-lg font-black text-slate-900 uppercase">
                  {settings?.shopName || "Shop ERP Mobilier"}
                </h2>
                <p className="text-[11px] text-slate-500">{settings?.address || "Zone Commerciale — Alger, Algérie"}</p>
                <p className="text-[11px] text-slate-500">Tél : {settings?.phone || "+213 (0) 550 12 34 56"}</p>
              </div>
            </div>
            <div className="text-right">
              <span className="bg-emerald-700 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
                Bon de Versement
              </span>
              <p className="text-sm font-mono font-bold mt-1 text-slate-900">{payment.reference}</p>
              <p className="text-[11px] text-slate-500">
                Date :{" "}
                {new Date(payment.paymentDate).toLocaleDateString("fr-DZ", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </p>
            </div>
          </div>

          <div className="my-4 space-y-2 text-xs">
            <p>
              <span className="text-slate-500 font-medium">Reçu de : </span>
              <span className="font-bold text-slate-900 text-sm">
                {sale.customer ? sale.customer.name : "Client Passager / Comptoir"}
              </span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Pour règlement de la facture : </span>
              <span className="font-mono font-bold text-slate-800">{sale.reference}</span>
            </p>
            <p>
              <span className="text-slate-500 font-medium">Mode de règlement : </span>
              <span className="font-semibold text-slate-800">
                {payment.method === "cash"
                  ? "Espèces (Comptant)"
                  : payment.method === "cib"
                  ? "Carte CIB / Edahabia"
                  : payment.method === "check"
                  ? "Chèque bancaire"
                  : "Virement"}
              </span>
            </p>
            {payment.notes && (
              <p>
                <span className="text-slate-500 font-medium">Observation : </span>
                <span className="text-slate-700">{payment.notes}</span>
              </p>
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 my-4 flex justify-between items-center">
            <div>
              <p className="text-[11px] text-emerald-800 font-medium">MONTANT ENCAISSÉ :</p>
              <p className="text-xl font-mono font-black text-emerald-800">
                {payment.amount.toLocaleString("fr-DZ")} DA
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-500">Solde restant après versement :</p>
              <p
                className={`text-sm font-mono font-bold ${
                  remainingBalance > 0 ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {remainingBalance.toLocaleString("fr-DZ")} DA
              </p>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-200 grid grid-cols-2 text-center text-xs">
            <div>
              <p className="font-medium text-slate-600 mb-8">Signature du Client</p>
              <div className="w-32 mx-auto border-b border-slate-300"></div>
            </div>
            <div>
              <p className="font-medium text-slate-600 mb-8">Cachet et Signature Caissier</p>
              <div className="w-32 mx-auto border-b border-slate-300"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
