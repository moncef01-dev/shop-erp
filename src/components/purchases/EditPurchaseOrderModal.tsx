"use client";

import React, { useState, useTransition, useMemo } from "react";
import { X, Plus, Trash2, AlertTriangle, CheckCircle2, Save, ShoppingBag, PackageCheck, AlertCircle } from "lucide-react";
import type { PrintablePurchase, PrintablePurchaseItem } from "@/components/purchases/PrintablePurchaseDocuments";
import type { ProductItem, LocationOption } from "@/app/purchases/PurchasesClient";
import { updatePurchaseOrderAction, type UpdatePurchaseItemInput } from "@/app/purchases/actions";

interface EditPurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  purchase: PrintablePurchase;
  products: ProductItem[];
  locations: LocationOption[];
  onSuccess: (message: string) => void;
}

interface EditableLine {
  id?: number;
  productId: number;
  locationId: number;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  name: string;
  sku: string;
  model: string;
  color: string;
}

export function EditPurchaseOrderModal({
  isOpen,
  onClose,
  purchase,
  products,
  locations,
  onSuccess,
}: EditPurchaseOrderModalProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [purchaseDate, setPurchaseDate] = useState<string>(
    typeof purchase.purchaseDate === "string"
      ? purchase.purchaseDate.split("T")[0]
      : new Date(purchase.purchaseDate).toISOString().split("T")[0]
  );
  const [expectedDate, setExpectedDate] = useState<string>(
    purchase.expectedDeliveryDate
      ? typeof purchase.expectedDeliveryDate === "string"
        ? purchase.expectedDeliveryDate.split("T")[0]
        : new Date(purchase.expectedDeliveryDate).toISOString().split("T")[0]
      : ""
  );
  const [discount, setDiscount] = useState<number>(purchase.discount || 0);
  const [notes, setNotes] = useState<string>(purchase.notes || "");

  // Editable lines
  const defaultLocId = locations[0]?.id || 1;
  const [lines, setLines] = useState<EditableLine[]>(() => {
    return (purchase.items || []).map((it) => ({
      id: it.id,
      productId: it.productId,
      locationId: (it as any).locationId || defaultLocId,
      quantity: it.quantity,
      receivedQuantity: it.receivedQuantity || 0,
      unitCost: it.unitCost,
      name: it.product?.name || "",
      sku: it.product?.sku || "",
      model: it.product?.model || "",
      color: it.product?.color || "",
    }));
  });

  // Calculations
  const subtotal = useMemo(() => {
    return lines.reduce((acc, l) => acc + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  }, [lines]);

  const totalAmount = useMemo(() => {
    return Math.max(0, subtotal - (Number(discount) || 0));
  }, [subtotal, discount]);

  const paidAmount = purchase.paidAmount || 0;
  const newBalance = Math.max(0, totalAmount - paidAmount);
  const isTotalLowerThanPaid = totalAmount < paidAmount;

  const wasReceived =
    purchase.receiptStatus === "received" ||
    purchase.receiptStatus === "partial" ||
    lines.some((l) => l.receivedQuantity > 0);

  // Line operations
  const handleAddLine = () => {
    const firstProd = products[0];
    setLines((prev) => [
      ...prev,
      {
        productId: firstProd?.id || 1,
        locationId: defaultLocId,
        quantity: 1,
        receivedQuantity: 0,
        unitCost: firstProd?.costPrice || 0,
        name: firstProd?.name || "",
        sku: firstProd?.sku || "",
        model: firstProd?.model || "",
        color: firstProd?.color || "",
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length <= 1) {
      setErrorMessage("La commande doit comporter au moins une ligne d'article.");
      return;
    }
    const lineToRemove = lines[index];
    if (lineToRemove.receivedQuantity > 0) {
      const confirmRemove = window.confirm(
        `Attention : Cet article a déjà été réceptionné (${lineToRemove.receivedQuantity} pièce(s) en stock). Sa suppression déstockera automatiquement cette quantité. Confirmer la suppression ?`
      );
      if (!confirmRemove) return;
    }
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductChange = (index: number, newProductId: number) => {
    const p = products.find((prod) => prod.id === newProductId);
    if (!p) return;
    setLines((prev) =>
      prev.map((l, i) =>
        i === index
          ? {
              ...l,
              productId: p.id,
              name: p.name,
              sku: p.sku,
              model: p.model || "",
              color: p.color || "",
              unitCost: l.unitCost > 0 ? l.unitCost : p.costPrice || 0,
            }
          : l
      )
    );
  };

  const handleLineFieldChange = (index: number, field: keyof EditableLine, value: any) => {
    setLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value } : l))
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (lines.length === 0) {
      setErrorMessage("Veuillez ajouter au moins une ligne d'article.");
      return;
    }

    if (isTotalLowerThanPaid) {
      setErrorMessage(
        `Le nouveau total (${totalAmount.toLocaleString(
          "fr-DZ"
        )} DA) ne peut pas être inférieur au montant déjà payé (${paidAmount.toLocaleString(
          "fr-DZ"
        )} DA).`
      );
      return;
    }

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.quantity || l.quantity <= 0) {
        setErrorMessage(`Ligne ${i + 1} : La quantité doit être supérieure à zéro.`);
        return;
      }
      if (l.unitCost < 0) {
        setErrorMessage(`Ligne ${i + 1} : Le prix unitaire ne peut pas être négatif.`);
        return;
      }
    }

    const payloadItems: UpdatePurchaseItemInput[] = lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      locationId: l.locationId,
      quantity: Number(l.quantity),
      unitCost: Number(l.unitCost),
      name: l.name,
      model: l.model,
      color: l.color,
    }));

    startTransition(async () => {
      const res = await updatePurchaseOrderAction({
        purchaseId: purchase.id,
        purchaseDate,
        expectedDeliveryDate: expectedDate || null,
        notes: notes.trim() || null,
        discount: Number(discount) || 0,
        items: payloadItems,
      });

      if (!res.success) {
        setErrorMessage(res.error || "Erreur lors de la modification de la commande.");
      } else {
        onSuccess(res.message || "Commande modifiée avec succès.");
        onClose();
      }
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full p-6 my-8 border border-slate-100 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 border border-amber-200">
              <ShoppingBag className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-slate-900">Modifier le Bon de Commande</h3>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-800">
                  {purchase.reference}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-slate-100 text-slate-700">
                  {purchase.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Fournisseur : <span className="font-semibold text-slate-800">{purchase.supplier?.name || "Comptoir libre"}</span> ({purchase.supplier?.code || "—"})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isPending}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit} className="mt-4 flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Alerte Commande déjà réceptionnée */}
          {wasReceived && (
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-2.5">
              <PackageCheck className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Commande réceptionnée / partiellement réceptionnée</p>
                <p className="text-blue-700 mt-0.5">
                  La mise à jour des prix unitaires réajustera la facture et la dette sans recréer de mouvement de stock. Toute réduction de quantité en-dessous du volume réceptionné ajustera le stock disponible.
                </p>
              </div>
            </div>
          )}

          {/* Erreur bloquante */}
          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Date de Commande
              </label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Livraison Prévue
              </label>
              <input
                type="date"
                value={expectedDate}
                onChange={(e) => setExpectedDate(e.target.value)}
                className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                Remise Globale (DA)
              </label>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="w-full text-xs font-mono font-bold bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Lignes d'articles */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <span>Lignes d&apos;articles ({lines.length})</span>
              </h4>
              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1 px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold cursor-pointer transition"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter un article
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Article / SKU</th>
                    <th className="py-2.5 px-3">Modèle & Couleur</th>
                    <th className="py-2.5 px-3 w-28 text-center">Qté</th>
                    <th className="py-2.5 px-3 w-36 text-right">P.U. Achat (DA)</th>
                    <th className="py-2.5 px-3 w-36 text-right">Sous-Total (DA)</th>
                    <th className="py-2.5 px-2 text-center w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {lines.map((line, idx) => {
                    const lineSubtotal = (Number(line.quantity) || 0) * (Number(line.unitCost) || 0);
                    return (
                      <tr key={line.id ? `line-${line.id}` : `new-${idx}`} className="hover:bg-slate-50/80">
                        {/* Produit */}
                        <td className="py-2 px-3">
                          <select
                            value={line.productId}
                            onChange={(e) => handleProductChange(idx, Number(e.target.value))}
                            className="w-full text-xs bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium"
                          >
                            {products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.sku} - {p.name}
                              </option>
                            ))}
                          </select>
                          {line.receivedQuantity > 0 && (
                            <span className="text-[10px] text-emerald-700 font-semibold block mt-0.5">
                              Reçu : {line.receivedQuantity} unité(s)
                            </span>
                          )}
                        </td>

                        {/* Modèle & Couleur */}
                        <td className="py-2 px-3">
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              placeholder="Modèle"
                              value={line.model}
                              onChange={(e) => handleLineFieldChange(idx, "model", e.target.value)}
                              className="w-1/2 text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-800"
                            />
                            <input
                              type="text"
                              placeholder="Couleur"
                              value={line.color}
                              onChange={(e) => handleLineFieldChange(idx, "color", e.target.value)}
                              className="w-1/2 text-[11px] bg-white border border-slate-200 rounded px-2 py-1 text-slate-800"
                            />
                          </div>
                        </td>

                        {/* Quantité */}
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={line.quantity}
                            onChange={(e) => handleLineFieldChange(idx, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                            className="w-full text-center text-xs font-mono font-black bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            required
                          />
                        </td>

                        {/* Prix unitaire */}
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={line.unitCost}
                            onChange={(e) => handleLineFieldChange(idx, "unitCost", Math.max(0, parseFloat(e.target.value) || 0))}
                            className="w-full text-right text-xs font-mono font-bold bg-white border border-slate-200 rounded-md px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-amber-500"
                            required
                          />
                        </td>

                        {/* Total ligne */}
                        <td className="py-2 px-3 text-right font-mono font-black text-slate-900">
                          {lineSubtotal.toLocaleString("fr-DZ")} DA
                        </td>

                        {/* Action supprimer */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition"
                            title="Supprimer la ligne"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
              Notes / Instructions
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Précisions de commande..."
              className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Résumé financier recalculé en direct */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-xs space-y-1">
              <p className="text-slate-600">
                Sous-total HT : <span className="font-mono font-bold text-slate-900">{subtotal.toLocaleString("fr-DZ")} DA</span>
              </p>
              {discount > 0 && (
                <p className="text-slate-600">
                  Remise : <span className="font-mono font-bold text-rose-600">-{discount.toLocaleString("fr-DZ")} DA</span>
                </p>
              )}
              <p className="text-slate-600">
                Montant déjà réglé : <span className="font-mono font-bold text-slate-900">{paidAmount.toLocaleString("fr-DZ")} DA</span>
              </p>
            </div>

            <div className="text-right border-t sm:border-t-0 sm:border-l border-slate-200 pt-3 sm:pt-0 sm:pl-6">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                Nouveau Total Commande
              </span>
              <span className="text-xl font-black font-mono text-slate-900 block">
                {totalAmount.toLocaleString("fr-DZ")} DA
              </span>
              <span className="text-xs font-semibold text-rose-600 block mt-0.5">
                Reste dû : {newBalance.toLocaleString("fr-DZ")} DA
              </span>
            </div>
          </div>

          {isTotalLowerThanPaid && (
            <div className="p-3 rounded-lg bg-rose-100 border border-rose-300 text-xs font-bold text-rose-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
              <span>
                Attention : Le total ({totalAmount.toLocaleString("fr-DZ")} DA) est inférieur au montant déjà payé ({paidAmount.toLocaleString("fr-DZ")} DA). Enregistrement bloqué.
              </span>
            </div>
          )}

          {/* Footer actions */}
          <div className="pt-3 border-t border-slate-200 flex justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 border border-slate-200 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-100 transition cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isPending || isTotalLowerThanPaid}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg shadow-sm transition cursor-pointer"
            >
              <Save className="h-4 w-4" />
              {isPending ? "Enregistrement..." : "Valider les modifications"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
