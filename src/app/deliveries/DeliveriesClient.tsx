"use client";

import { useState, useTransition } from "react";
import {
  PackageCheck,
  Truck,
  Store,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Search,
  Printer,
  ChevronDown,
  MapPin,
  Phone,
  X,
} from "lucide-react";
import {
  updateDeliveryStatusAction,
  updateDeliveryMethodAction,
} from "./actions";
import { STATUS_LABELS } from "./types";
import { PrintableDeliveryNote } from "@/components/documents/PrintableNewDocuments";
import type { ShopSettingsData } from "@/app/settings/actions";

interface DeliveryItem {
  id: number;
  reference: string;
  status: string;
  method: string;
  address: string | null;
  fee: number;
  deliveryDate: Date | string | null;
  deliveredAt: Date | string | null;
  carrierName: string | null;
  recipientName: string | null;
  notes: string | null;
  createdAt: Date | string;
  saleRef: string;
  saleDate: Date | string | null;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  totalAmount: number;
  paidAmount: number;
  isPickup: boolean;
  isToday: boolean;
  items: Array<{
    quantity: number;
    product?: {
      sku: string | null;
      name: string;
      model: string | null;
      color: string | null;
    } | null;
  }>;
}

interface DeliveriesClientProps {
  deliveries: DeliveryItem[];
  settings: ShopSettingsData | null;
  metrics: {
    totalDeliveries: number;
    pendingHomeCount: number;
    plannedTodayCount: number;
    storePickupsCount: number;
    completedCount: number;
  };
}

export function DeliveriesClient({
  deliveries: initialDeliveries,
  settings,
  metrics,
}: DeliveriesClientProps) {
  const [activeFilter, setActiveFilter] = useState<
    "all" | "pending_home" | "today" | "pickup" | "completed" | "postponed"
  >("pending_home");
  const [searchQuery, setSearchQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Modal pour mise à jour détaillée
  const [statusModalDelivery, setStatusModalDelivery] = useState<DeliveryItem | null>(null);
  const [newStatus, setNewStatus] = useState<string>("to_prepare");
  const [carrierInput, setCarrierInput] = useState("");
  const [recipientInput, setRecipientInput] = useState("");
  const [notesInput, setNotesInput] = useState("");

  // Impression Bon de Livraison
  const [printingDelivery, setPrintingDelivery] = useState<DeliveryItem | null>(null);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  const openStatusModal = (del: DeliveryItem) => {
    setStatusModalDelivery(del);
    setNewStatus(del.status === "pending" ? "to_prepare" : del.status);
    setCarrierInput(del.carrierName || "");
    setRecipientInput(del.recipientName || "");
    setNotesInput(del.notes || "");
  };

  const handleUpdateStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalDelivery) return;

    startTransition(async () => {
      const res = await updateDeliveryStatusAction(statusModalDelivery.id, newStatus, {
        carrierName: carrierInput,
        recipientName: recipientInput,
        notes: notesInput,
      });

      if (res.success) {
        showNotification("success", res.message || "Statut de livraison mis à jour.");
        setStatusModalDelivery(null);
        window.location.reload();
      } else {
        showNotification("error", res.error || "Erreur lors de la mise à jour.");
      }
    });
  };


  const handleSwitchMethod = (del: DeliveryItem) => {
    const targetMethod = del.isPickup ? "home_delivery" : "store_pickup";
    const promptMsg = del.isPickup
      ? "Basculer cette commande en Livraison à domicile ?"
      : "Basculer cette commande en Retrait au magasin ?";

    if (!confirm(promptMsg)) return;

    startTransition(async () => {
      const res = await updateDeliveryMethodAction(
        del.id,
        targetMethod,
        targetMethod === "home_delivery" ? del.customerAddress || "Adresse client" : undefined
      );
      if (res.success) {
        showNotification("success", res.message || "Mode mis à jour.");
        window.location.reload();
      } else {
        showNotification("error", res.error || "Erreur.");
      }
    });
  };

  // Filtrage des livraisons
  const filteredDeliveries = initialDeliveries.filter((d) => {
    // 1. Filtre par recherche
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const matchRef = d.reference.toLowerCase().includes(q);
      const matchSale = d.saleRef.toLowerCase().includes(q);
      const matchCustomer = d.customerName.toLowerCase().includes(q);
      const matchPhone = d.customerPhone && d.customerPhone.includes(q);
      const matchAddress = d.address && d.address.toLowerCase().includes(q);
      if (!matchRef && !matchSale && !matchCustomer && !matchPhone && !matchAddress) {
        return false;
      }
    }

    // 2. Filtre par onglet d'état
    if (activeFilter === "pending_home") {
      return !d.isPickup && ["to_prepare", "pending", "ready", "in_transit"].includes(d.status);
    }
    if (activeFilter === "today") {
      return d.isToday && ["to_prepare", "pending", "ready", "in_transit"].includes(d.status);
    }
    if (activeFilter === "pickup") {
      return d.isPickup;
    }
    if (activeFilter === "completed") {
      return d.status === "delivered";
    }
    if (activeFilter === "postponed") {
      return d.status === "postponed" || d.status === "cancelled";
    }

    return true;
  });

  return (
    <div className="space-y-6">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
            Suivi des Expéditions &amp; Livraisons
          </h1>
          <p className="text-sm sm:text-base text-slate-600 mt-1">
            Gestion des livraisons à domicile, retraits au comptoir et bons de livraison conformes au Décret 05-468.
          </p>
        </div>
      </div>

      {/* ── Notification Banner ─────────────────────────────────────────────── */}
      {notification && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-sm sm:text-base font-medium shadow-xs ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
              : "bg-rose-50 text-rose-900 border border-rose-200"
          }`}
        >
          <div className="flex items-center gap-3">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            )}
            <span>{notification.text}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* ── KPI Metrics Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div
          onClick={() => setActiveFilter("pending_home")}
          className={`rounded-xl border p-5 shadow-xs cursor-pointer transition-all ${
            activeFilter === "pending_home"
              ? "border-amber-500 bg-amber-50/50 ring-2 ring-amber-500/20"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500">
              À Domicile en Attente
            </span>
            <Truck className="h-5 w-5 text-amber-600" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-black text-slate-900">
            {metrics.pendingHomeCount}
          </p>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">À préparer / en cours</p>
        </div>

        <div
          onClick={() => setActiveFilter("today")}
          className={`rounded-xl border p-5 shadow-xs cursor-pointer transition-all ${
            activeFilter === "today"
              ? "border-blue-500 bg-blue-50/50 ring-2 ring-blue-500/20"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500">
              Prévues Aujourd&apos;hui
            </span>
            <Calendar className="h-5 w-5 text-blue-600" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-black text-slate-900">
            {metrics.plannedTodayCount}
          </p>
          <p className="text-xs sm:text-sm text-blue-600 font-medium mt-1">Planifiées ce jour</p>
        </div>

        <div
          onClick={() => setActiveFilter("pickup")}
          className={`rounded-xl border p-5 shadow-xs cursor-pointer transition-all ${
            activeFilter === "pickup"
              ? "border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/20"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500">
              Retraits au Magasin
            </span>
            <Store className="h-5 w-5 text-indigo-600" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-black text-slate-900">
            {metrics.storePickupsCount}
          </p>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">Exclus des tournées</p>
        </div>

        <div
          onClick={() => setActiveFilter("completed")}
          className={`rounded-xl border p-5 shadow-xs cursor-pointer transition-all ${
            activeFilter === "completed"
              ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20"
              : "border-slate-200 bg-white hover:border-slate-300"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-500">
              Livrées / Clôturées
            </span>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-black font-mono text-emerald-700">
            {metrics.completedCount}
          </p>
          <p className="text-xs sm:text-sm text-emerald-600 mt-1">Délivrées aux clients</p>
        </div>
      </div>

      {/* ── Search Bar & Filter Tabs ────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveFilter("pending_home")}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                activeFilter === "pending_home"
                  ? "bg-amber-500 text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              À Domicile ({metrics.pendingHomeCount})
            </button>
            <button
              onClick={() => setActiveFilter("today")}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                activeFilter === "today"
                  ? "bg-amber-500 text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Aujourd&apos;hui ({metrics.plannedTodayCount})
            </button>
            <button
              onClick={() => setActiveFilter("pickup")}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                activeFilter === "pickup"
                  ? "bg-amber-500 text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Retrait Magasin ({metrics.storePickupsCount})
            </button>
            <button
              onClick={() => setActiveFilter("completed")}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                activeFilter === "completed"
                  ? "bg-amber-500 text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Livrées ({metrics.completedCount})
            </button>
            <button
              onClick={() => setActiveFilter("postponed")}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                activeFilter === "postponed"
                  ? "bg-amber-500 text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Reportées / Annulées
            </button>
            <button
              onClick={() => setActiveFilter("all")}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                activeFilter === "all"
                  ? "bg-amber-500 text-slate-900"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              Toutes ({metrics.totalDeliveries})
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher client, réf BL, facture..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm focus:border-amber-500 focus:outline-hidden bg-slate-50"
            />
          </div>
        </div>
      </div>

      {/* ── Table des Livraisons ────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                <th className="py-3 px-4">Réf BL</th>
                <th className="py-3 px-4">Facture Liée</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4">Destinataire &amp; Contact</th>
                <th className="py-3 px-4">Adresse / Destination</th>
                <th className="py-3 px-4">Date Prévue</th>
                <th className="py-3 px-4 text-right">Frais (DA)</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDeliveries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <PackageCheck className="mx-auto h-10 w-10 text-slate-300 mb-2" />
                    Aucune fiche de livraison trouvée pour cette sélection.
                  </td>
                </tr>
              ) : (
                filteredDeliveries.map((del) => {
                  const statusInfo = STATUS_LABELS[del.status] || {
                    label: del.status,
                    color: "bg-slate-100 text-slate-700 border-slate-200",
                  };

                  return (
                    <tr key={del.id} className="hover:bg-slate-50 transition-colors">
                      {/* Réf BL */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {del.reference}
                      </td>

                      {/* Facture Liée */}
                      <td className="py-3 px-4 font-mono text-slate-700 font-medium">
                        {del.saleRef}
                      </td>

                      {/* Mode de délivrance */}
                      <td className="py-3 px-4">
                        {del.isPickup ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            <Store className="h-3.5 w-3.5" />
                            Retrait Magasin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            <Truck className="h-3.5 w-3.5" />
                            À Domicile
                          </span>
                        )}
                      </td>

                      {/* Client & Phone */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{del.customerName}</div>
                        {del.customerPhone ? (
                          <div className="flex items-center gap-1 text-xs text-slate-500 font-mono mt-0.5">
                            <Phone className="h-3 w-3 text-slate-400" />
                            <span>{del.customerPhone}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">Sans téléphone</span>
                        )}
                      </td>

                      {/* Adresse */}
                      <td className="py-3 px-4 max-w-xs">
                        <div className="flex items-start gap-1 text-slate-700 text-xs sm:text-sm">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                          <span className="line-clamp-2">
                            {del.isPickup ? "Retrait au comptoir du magasin" : (del.address || "Adresse client")}
                          </span>
                        </div>
                        {del.carrierName && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            Livreur : <span className="font-semibold">{del.carrierName}</span>
                          </p>
                        )}
                        {del.notes && (
                          <p className="text-xs text-slate-400 italic mt-0.5 line-clamp-1">
                            Note : {del.notes}
                          </p>
                        )}
                      </td>

                      {/* Date prévue */}
                      <td className="py-3 px-4 text-slate-700 text-xs sm:text-sm whitespace-nowrap">
                        {del.deliveryDate ? (
                          <div>
                            <span className="font-medium">
                              {new Date(del.deliveryDate).toLocaleDateString("fr-DZ")}
                            </span>
                            {del.isToday && (
                              <span className="block text-[11px] font-bold text-blue-600 uppercase">
                                Aujourd&apos;hui
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Non planifiée</span>
                        )}
                      </td>

                      {/* Frais */}
                      <td className="py-3 px-4 text-right font-mono font-medium text-slate-800 whitespace-nowrap">
                        {del.fee > 0 ? `${del.fee.toLocaleString("fr-DZ")} DA` : "0 DA"}
                      </td>

                      {/* Statut */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold border ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        {/* Bouton Impression BL */}
                        <button
                          onClick={() => setPrintingDelivery(del)}
                          title="Imprimer le Bon de Livraison A4"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs cursor-pointer"
                        >
                          <Printer className="h-3.5 w-3.5 text-slate-500" />
                          <span>BL (A4)</span>
                        </button>

                        {/* Bouton Mise à jour statut */}
                        <button
                          onClick={() => openStatusModal(del)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-semibold shadow-xs cursor-pointer"
                        >
                          <span>Statut</span>
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── MODAL DE MISE À JOUR DE STATUT ──────────────────────────────────── */}
      {statusModalDelivery && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Mettre à Jour la Livraison : {statusModalDelivery.reference}
                </h2>
                <p className="text-xs text-slate-500">
                  Facture {statusModalDelivery.saleRef} — Client : {statusModalDelivery.customerName}
                </p>
              </div>
              <button
                onClick={() => setStatusModalDelivery(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStatus} className="mt-4 space-y-4">
              {/* Statut de livraison */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Nouveau Statut
                </label>
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white font-medium focus:border-amber-500 focus:outline-hidden"
                >
                  <option value="to_prepare">À préparer</option>
                  <option value="ready">Prête à livrer / Prêt au retrait</option>
                  <option value="in_transit">En cours de livraison</option>
                  <option value="delivered">Livrée (Marchandise remise au client)</option>
                  <option value="postponed">Reportée</option>
                  <option value="cancelled">Annulée</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  {newStatus === "delivered"
                    ? "Marquer comme livrée enregistre l'heure de livraison sans modifier le stock ou la facture."
                    : "La modification du statut n'a aucun impact sur les écritures comptables ou de stock."}
                </p>
              </div>

              {/* Mode de distribution */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase">Mode actuel</span>
                  <p className="text-sm font-bold text-slate-800">
                    {statusModalDelivery.isPickup ? "Retrait au magasin" : "Livraison à domicile"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    handleSwitchMethod(statusModalDelivery);
                    setStatusModalDelivery(null);
                  }}
                  className="px-2.5 py-1 text-xs font-semibold rounded bg-slate-200 hover:bg-slate-300 text-slate-700 cursor-pointer"
                >
                  Basculer en {statusModalDelivery.isPickup ? "Livraison" : "Retrait"}
                </button>
              </div>

              {/* Livreur / Transporteur */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Chauffeur / Livreur (optionnel)
                </label>
                <input
                  type="text"
                  value={carrierInput}
                  onChange={(e) => setCarrierInput(e.target.value)}
                  placeholder="Nom du transporteur ou livreur interne"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              {/* Réceptionnaire */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Nom du Réceptionnaire (optionnel)
                </label>
                <input
                  type="text"
                  value={recipientInput}
                  onChange={(e) => setRecipientInput(e.target.value)}
                  placeholder="Nom de la personne ayant réceptionné les meubles"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              {/* Observations / Notes */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1">
                  Observations / Remarques
                </label>
                <textarea
                  value={notesInput}
                  onChange={(e) => setNotesInput(e.target.value)}
                  rows={2}
                  placeholder="Instructions d'accès, motif de report, réserves..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:border-amber-500 focus:outline-hidden"
                />
              </div>

              {/* Boutons d'action */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setStatusModalDelivery(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 text-sm font-bold rounded-lg cursor-pointer"
                >
                  {isPending ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL D'IMPRESSION DU BON DE LIVRAISON (A4) ─────────────────────── */}
      {printingDelivery && (
        <PrintableDeliveryNote
          delivery={{
            id: printingDelivery.id,
            reference: printingDelivery.reference,
            status: printingDelivery.status,
            method: printingDelivery.method,
            address: printingDelivery.address,
            fee: printingDelivery.fee,
            deliveryDate: printingDelivery.deliveryDate,
            deliveredAt: printingDelivery.deliveredAt,
            carrierName: printingDelivery.carrierName,
            recipientName: printingDelivery.recipientName,
            notes: printingDelivery.notes,
            createdAt: printingDelivery.createdAt,
            sale: {
              reference: printingDelivery.saleRef,
              saleDate: printingDelivery.saleDate || new Date(),
              totalAmount: printingDelivery.totalAmount,
              customer: {
                name: printingDelivery.customerName,
                phone: printingDelivery.customerPhone,
                address: printingDelivery.customerAddress,
              },
              items: printingDelivery.items.map((it) => ({
                quantity: it.quantity,
                product: it.product
                  ? {
                      sku: it.product.sku || undefined,
                      name: it.product.name,
                      model: it.product.model,
                      color: it.product.color,
                    }
                  : undefined,
              })),
            },
          }}
          settings={settings}
          onClose={() => setPrintingDelivery(null)}
        />
      )}
    </div>
  );
}
