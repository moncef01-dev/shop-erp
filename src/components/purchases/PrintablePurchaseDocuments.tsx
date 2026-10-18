"use client";

import { Printer, X } from "lucide-react";
import type { ShopSettingsData } from "@/app/settings/actions";

export interface PrintablePurchaseItem {
  id: number;
  productId: number;
  product?: {
    sku?: string;
    name?: string;
    model?: string | null;
    color?: string | null;
  };
  location?: {
    name?: string;
    code?: string;
  } | null;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  subtotal: number;
}

export interface PrintableReceiptItem {
  id: number;
  productId?: number;
  quantity: number;
  unitCost?: number | null;
  product?: {
    id?: number;
    sku?: string;
    name?: string;
    model?: string | null;
    color?: string | null;
    costPrice?: number | null;
  } | null;
  location?: {
    id?: number;
    name?: string;
    code?: string;
  } | null;
  purchaseItem?: {
    id?: number;
    quantity?: number;
    unitCost?: number | null;
  } | null;
}

export interface PrintablePurchaseReceipt {
  id: number;
  reference: string;
  receiptDate: string | Date;
  notes?: string | null;
  items?: PrintableReceiptItem[];
}

export interface PrintableSupplierPayment {
  id?: number;
  reference?: string | null;
  amount: number;
  method?: string;
  paymentDate: string | Date;
  notes?: string | null;
}

export interface PrintablePurchase {
  id: number;
  reference: string;
  status: string;
  receiptStatus: string;
  paymentStatus: string;
  purchaseDate: string | Date;
  expectedDeliveryDate?: string | Date | null;
  subtotal: number;
  discount: number;
  totalAmount: number;
  paidAmount: number;
  notes?: string | null;
  supplierId?: number | null;
  supplier?: {
    id: number;
    code?: string | null;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  } | null;
  items?: PrintablePurchaseItem[];
  receipts?: PrintablePurchaseReceipt[];
  payments?: PrintableSupplierPayment[];
}

// ─── BON DE COMMANDE FOURNISSEUR A4 ──────────────────────────────────────────

export function PrintablePurchaseOrder({
  purchase,
  settings,
  onClose,
}: {
  purchase: PrintablePurchase;
  settings?: ShopSettingsData | null;
  onClose: () => void;
}) {
  const handlePrint = () => {
    window.print();
  };

  const balance = Math.max(0, purchase.totalAmount - purchase.paidAmount);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl p-8 print:p-6 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        {/* Actions bar (invisible à l'impression) */}
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Aperçu du Bon de Commande Fournisseur</span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-full bg-slate-100 text-slate-700">
              {purchase.reference}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm"
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

        {/* ── CONTENU DU BON DE COMMANDE A4 ── */}
        <div className="text-slate-900 leading-relaxed font-sans text-xs">
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-slate-900 pb-6">
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
                <p className="text-slate-500 text-xs mt-1">
                  {settings?.activity || "Magasin & Entrepôt de Mobilier • Algérie"}
                </p>
                <p className="text-slate-500 text-xs">
                  {settings?.address || "Showroom • Vente • Ameublement & Décoration"}
                </p>
                {settings?.phone && (
                  <p className="text-slate-500 text-[11px]">Tél : {settings.phone}</p>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="inline-block bg-slate-900 text-white px-3 py-1 font-mono font-bold text-sm tracking-wide rounded-sm uppercase">
                Bon de Commande
              </div>
              <p className="font-mono font-bold text-base mt-2 text-slate-900">
                N° {purchase.reference}
              </p>
              <p className="text-slate-600 text-xs mt-0.5">
                Date :{" "}
                <span className="font-semibold">
                  {new Date(purchase.purchaseDate).toLocaleDateString("fr-DZ")}
                </span>
              </p>
              {purchase.expectedDeliveryDate && (
                <p className="text-slate-600 text-xs">
                  Livraison prévue :{" "}
                  <span className="font-semibold">
                    {new Date(purchase.expectedDeliveryDate).toLocaleDateString("fr-DZ")}
                  </span>
                </p>
              )}
            </div>
          </div>

          {/* Supplier & Order Info */}
          <div className="grid grid-cols-2 gap-8 my-6">
            <div className="bg-slate-50 p-4 rounded border border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Destinataire / Fournisseur :
              </span>
              {purchase.supplier ? (
                <div className="space-y-0.5">
                  <p className="font-bold text-sm text-slate-900">
                    {purchase.supplier.name}
                  </p>
                  {purchase.supplier.code && (
                    <p className="font-mono text-[11px] text-slate-500">
                      Réf: {purchase.supplier.code}
                    </p>
                  )}
                  {purchase.supplier.phone && (
                    <p className="text-slate-600">
                      Tél : <span className="font-mono">{purchase.supplier.phone}</span>
                    </p>
                  )}
                  {purchase.supplier.address && (
                    <p className="text-slate-600">{purchase.supplier.address}</p>
                  )}
                  {purchase.supplier.email && (
                    <p className="text-slate-600">{purchase.supplier.email}</p>
                  )}
                </div>
              ) : (
                <p className="italic text-slate-500">Fournisseur non spécifié</p>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded border border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Informations Commande &amp; Statuts :
              </span>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">Statut commande :</span>
                  <span className="font-bold uppercase text-[10px] px-2 py-0.5 rounded bg-slate-200 text-slate-800">
                    {purchase.status === "received"
                      ? "Reçue"
                      : purchase.status === "partially_received"
                      ? "Partiellement reçue"
                      : purchase.status === "ordered"
                      ? "Commandée"
                      : purchase.status === "cancelled"
                      ? "Annulée"
                      : "Brouillon"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Statut réception :</span>
                  <span className="font-bold text-slate-800">
                    {purchase.receiptStatus === "received"
                      ? "Marchandises Reçues"
                      : purchase.receiptStatus === "partial"
                      ? "Réception Partielle"
                      : "En attente de livraison"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Statut règlement :</span>
                  <span className="font-bold text-slate-800">
                    {purchase.paymentStatus === "paid"
                      ? "Payé intégralement"
                      : purchase.paymentStatus === "partial"
                      ? "Partiellement payé"
                      : "Non payé"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Table of items */}
          <div className="overflow-hidden border border-slate-300 rounded mb-6">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300">
                  <th className="py-2.5 px-3">Réf / SKU</th>
                  <th className="py-2.5 px-3">Désignation du Meuble</th>
                  <th className="py-2.5 px-3">Modèle / Finition</th>
                  <th className="py-2.5 px-3 text-center">Quantité</th>
                  <th className="py-2.5 px-3 text-right">Prix Unitaire (DA)</th>
                  <th className="py-2.5 px-3 text-right">Total Ligne (DA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(purchase.items || []).map((it, idx) => (
                  <tr key={it.id || idx} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-mono font-medium text-slate-600">
                      {it.product?.sku || "—"}
                    </td>
                    <td className="py-2 px-3 font-semibold text-slate-900">
                      {it.product?.name || "Article"}
                    </td>
                    <td className="py-2 px-3 text-slate-600">
                      {[it.product?.model, it.product?.color].filter(Boolean).join(" - ") || "—"}
                    </td>
                    <td className="py-2 px-3 text-center font-mono font-bold">
                      {it.quantity}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      {it.unitCost.toLocaleString("fr-DZ")} DA
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-bold">
                      {it.subtotal.toLocaleString("fr-DZ")} DA
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial summary */}
          <div className="flex justify-end mb-8">
            <div className="w-72 bg-slate-50 p-4 rounded border border-slate-200 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Sous-total HT :</span>
                <span className="font-mono font-semibold">
                  {(purchase.subtotal || purchase.totalAmount).toLocaleString("fr-DZ")} DA
                </span>
              </div>
              {purchase.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Remise accordée :</span>
                  <span className="font-mono font-semibold">
                    -{purchase.discount.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-300">
                <span>TOTAL COMMANDE :</span>
                <span className="font-mono text-base text-amber-800">
                  {purchase.totalAmount.toLocaleString("fr-DZ")} DA
                </span>
              </div>
              <div className="flex justify-between text-slate-700 pt-1">
                <span>Acompte / Montant réglé :</span>
                <span className="font-mono font-semibold text-emerald-700">
                  {purchase.paidAmount.toLocaleString("fr-DZ")} DA
                </span>
              </div>
              <div className="flex justify-between text-rose-800 font-bold pt-1 border-t border-slate-200">
                <span>Solde restant dû :</span>
                <span className="font-mono text-sm">
                  {balance.toLocaleString("fr-DZ")} DA
                </span>
              </div>
            </div>
          </div>

          {/* Observations */}
          {purchase.notes && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded mb-8 text-xs text-slate-600">
              <span className="font-bold text-slate-800 block mb-0.5">Observations / Conditions :</span>
              <p>{purchase.notes}</p>
            </div>
          )}

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-12 pt-8 border-t border-slate-300 text-center">
            <div>
              <p className="font-bold text-slate-800 mb-16 uppercase text-[11px]">
                Visa &amp; Signature Fournisseur
              </p>
              <p className="text-[10px] text-slate-400 italic">Mention « Bon pour accord »</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 mb-16 uppercase text-[11px]">
                Pour la Direction Shop ERP
              </p>
              <p className="text-[10px] text-slate-400 italic">Cachet et signature autorisée</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── BON DE RÉCEPTION FOURNISSEUR A4 ──────────────────────────────────────────

export function PrintableGoodsReceipt({
  receipt,
  purchase,
  settings,
  onClose,
}: {
  receipt: PrintablePurchaseReceipt;
  purchase: PrintablePurchase;
  settings?: ShopSettingsData | null;
  onClose: () => void;
}) {
  const handlePrint = () => {
    window.print();
  };

  const linkedPurchase = purchase || (receipt as unknown as { purchase?: PrintablePurchase })?.purchase;
  const purchaseRef = linkedPurchase?.reference || "—";
  const supplier = linkedPurchase?.supplier;
  const items = receipt.items || [];

  const totalQty = items.reduce((acc, it) => acc + (it.quantity || 0), 0);
  const totalValue = items.reduce((acc, it) => {
    const cost = it.unitCost ?? it.purchaseItem?.unitCost ?? it.product?.costPrice ?? 0;
    return acc + (it.quantity || 0) * cost;
  }, 0);

  const destinationLocations = Array.from(
    new Set(items.map((it) => it.location?.name).filter(Boolean))
  );

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl p-8 print:p-6 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Aperçu du Bon de Réception</span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-full bg-emerald-100 text-emerald-800">
              {receipt.reference}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm"
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

        <div className="text-slate-900 leading-relaxed font-sans text-xs">
          <div className="flex justify-between items-start border-b-2 border-emerald-800 pb-6">
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
                <p className="text-slate-500 text-xs mt-1">
                  {settings?.activity || "Contrôle Réception • Entrée en Stock Magasin"}
                </p>
                <p className="text-slate-500 text-[11px]">
                  {settings?.address || "Showroom & Entrepôt Central"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="inline-block bg-emerald-700 text-white px-3 py-1 font-mono font-bold text-sm tracking-wide rounded-sm uppercase">
                Bon de Réception
              </div>
              <p className="font-mono font-bold text-base mt-2 text-slate-900">
                N° {receipt.reference}
              </p>
              <p className="text-slate-600 text-xs mt-0.5">
                Date réception :{" "}
                <span className="font-semibold">
                  {new Date(receipt.receiptDate).toLocaleDateString("fr-DZ")}
                </span>
              </p>
              <p className="text-slate-600 text-xs">
                Commande liée :{" "}
                <span className="font-mono font-semibold">{purchaseRef}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 my-6">
            <div className="bg-slate-50 p-4 rounded border border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Provenance / Fournisseur :
              </span>
              <p className="font-bold text-sm text-slate-900">
                {supplier?.name || "Fournisseur standard"}
              </p>
              {supplier?.code && (
                <p className="font-mono text-[11px] text-slate-500">
                  Réf: {supplier.code}
                </p>
              )}
              {supplier?.phone && (
                <p className="text-slate-600 text-xs mt-0.5">
                  Tél : <span className="font-mono">{supplier.phone}</span>
                </p>
              )}
              {supplier?.address && (
                <p className="text-slate-600 text-xs mt-0.5">{supplier.address}</p>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded border border-slate-200">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                Entrepôt de destination &amp; Observations :
              </span>
              <p className="text-slate-800 font-semibold mb-1">
                {destinationLocations.length > 0
                  ? `Dépôt(s) : ${destinationLocations.join(", ")}`
                  : "Dépôt de stockage principal"}
              </p>
              <p className="text-slate-600 italic">
                {receipt.notes || "Marchandises conformes et réceptionnées en bon état."}
              </p>
            </div>
          </div>

          {/* Table of received lines */}
          <div className="border border-slate-300 rounded mb-8 print:border-slate-400 overflow-x-auto print:overflow-visible">
            <table className="w-full text-left border-collapse text-xs print:text-[11px]">
              <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 print:table-header-group">
                <tr>
                  <th className="py-2.5 px-3">Réf / SKU</th>
                  <th className="py-2.5 px-3">Désignation Produit</th>
                  <th className="py-2.5 px-3">Dépôt Destination</th>
                  <th className="py-2.5 px-3 text-center">Quantité Réceptionnée</th>
                  <th className="py-2.5 px-3 text-right">P.U Achat (DA)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 print:table-row-group">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 italic bg-slate-50/50">
                      Aucun article n&apos;est enregistré sur ce bon de réception.
                    </td>
                  </tr>
                ) : (
                  items.map((it, idx) => {
                    const unitCost = it.unitCost ?? it.purchaseItem?.unitCost ?? it.product?.costPrice ?? 0;
                    return (
                      <tr key={it.id || idx} className="break-inside-avoid print:break-inside-avoid">
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {it.product?.sku || "—"}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-slate-900 block">
                            {it.product?.name || (it.productId ? `Produit #${it.productId}` : "Article")}
                          </span>
                          {(it.product?.model || it.product?.color) && (
                            <span className="text-[11px] text-slate-500 font-normal block">
                              {[it.product?.model, it.product?.color].filter(Boolean).join(" - ")}
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-slate-700 font-medium">
                          {it.location?.name || (it.location?.code ? `Dépôt (${it.location.code})` : "Dépôt standard")}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-emerald-800">
                          +{it.quantity}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-slate-800">
                          {unitCost.toLocaleString("fr-DZ")} DA
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot className="print:table-footer-group">
                  <tr className="bg-slate-50 font-bold border-t-2 border-slate-300 text-slate-800">
                    <td colSpan={3} className="py-2.5 px-3 text-right text-xs uppercase tracking-wide">
                      Total Articles Réceptionnés :
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono text-emerald-800 text-sm">
                      +{totalQty}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-xs">
                      {totalValue.toLocaleString("fr-DZ")} DA
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <div className="grid grid-cols-2 gap-12 pt-8 border-t border-slate-300 text-center">
            <div>
              <p className="font-bold text-slate-800 mb-16 uppercase text-[11px]">
                Le Livreur / Transporteur
              </p>
              <p className="text-[10px] text-slate-400 italic">Nom et émargement</p>
            </div>
            <div>
              <p className="font-bold text-slate-800 mb-16 uppercase text-[11px]">
                Le Responsable Entrepôt / Magasinier
              </p>
              <p className="text-[10px] text-slate-400 italic">Confirmation entrée en stock</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── REÇU DE PAIEMENT FOURNISSEUR (A4/A5) ───────────────────────────────────

export function PrintableSupplierPaymentReceipt({
  payment,
  purchase,
  settings,
  onClose,
}: {
  payment: PrintableSupplierPayment;
  purchase: PrintablePurchase;
  settings?: ShopSettingsData | null;
  onClose: () => void;
}) {
  const handlePrint = () => {
    window.print();
  };

  const balance = Math.max(0, purchase.totalAmount - purchase.paidAmount);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-xs flex items-center justify-center print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl p-8 print:p-6 print:shadow-none print:w-full print:max-w-none print:rounded-none">
        <div className="flex items-center justify-between pb-3 mb-6 border-b border-slate-200 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800">Reçu de Règlement Fournisseur</span>
            <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-full bg-emerald-100 text-emerald-800">
              {payment.reference || "REÇU"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-sm"
            >
              <Printer className="h-4 w-4" />
              Imprimer le Reçu
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="border border-slate-300 rounded p-6 text-slate-900 leading-relaxed font-sans text-xs">
          <div className="flex justify-between items-start border-b border-slate-200 pb-4">
            <div className="flex items-start gap-3">
              {settings?.logoUrl && (
                <img
                  src={settings.logoUrl}
                  alt={settings.shopName || "Logo"}
                  className="h-10 w-10 object-contain rounded border border-slate-200 p-0.5 bg-white print:border-none"
                />
              )}
              <div>
                <h2 className="text-lg font-black tracking-tight text-slate-900 uppercase">
                  {settings?.shopName || "Shop ERP Mobilier"}
                </h2>
                <p className="text-slate-500 text-[11px]">Bordereau de Décaissement Fournisseur</p>
                {settings?.address && <p className="text-slate-400 text-[10px]">{settings.address}</p>}
              </div>
            </div>
            <div className="text-right">
              <span className="font-mono font-bold text-sm bg-slate-900 text-white px-2.5 py-0.5 rounded">
                {payment.reference || "PAYF-DIRECT"}
              </span>
              <p className="text-slate-500 text-xs mt-1">
                Date : {new Date(payment.paymentDate).toLocaleDateString("fr-DZ")}
              </p>
            </div>
          </div>

          <div className="my-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">Bénéficiaire / Fournisseur :</span>
              <span className="font-bold text-slate-900">{purchase.supplier?.name || "Fournisseur"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Commande fournisseur liée :</span>
              <span className="font-mono font-bold text-slate-900">{purchase.reference}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Mode de paiement :</span>
              <span className="font-semibold text-slate-800 uppercase text-[11px]">
                {payment.method === "cash"
                  ? "Espèces"
                  : payment.method === "check"
                  ? "Chèque bancaire"
                  : payment.method === "transfer"
                  ? "Virement bancaire"
                  : payment.method || "Espèces"}
              </span>
            </div>
            {payment.notes && (
              <div className="flex justify-between">
                <span className="text-slate-500">Observation / Réf Chèque :</span>
                <span className="text-slate-800 italic">{payment.notes}</span>
              </div>
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-center my-4">
            <span className="text-xs font-bold text-emerald-800 uppercase block mb-1">
              Montant Réglé
            </span>
            <span className="text-2xl font-mono font-black text-emerald-700">
              {payment.amount.toLocaleString("fr-DZ")} DA
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded border border-slate-200 text-xs space-y-1 mb-6">
            <div className="flex justify-between">
              <span className="text-slate-500">Total commande :</span>
              <span className="font-mono font-semibold">{purchase.totalAmount.toLocaleString("fr-DZ")} DA</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total cumulé réglé :</span>
              <span className="font-mono font-semibold text-emerald-700">
                {purchase.paidAmount.toLocaleString("fr-DZ")} DA
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-200 font-bold text-rose-700">
              <span>Nouveau solde restant dû :</span>
              <span className="font-mono">{balance.toLocaleString("fr-DZ")} DA</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-4 border-t border-slate-200 text-center">
            <div>
              <p className="font-bold text-slate-700 mb-10 text-[11px] uppercase">
                Pour Acquit Fournisseur
              </p>
              <p className="text-[10px] text-slate-400">Signature</p>
            </div>
            <div>
              <p className="font-bold text-slate-700 mb-10 text-[11px] uppercase">
                La Caisse / Comptabilité
              </p>
              <p className="text-[10px] text-slate-400">Cachet</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
