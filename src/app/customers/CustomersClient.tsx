"use client";

import React, { useState, useTransition } from "react";
import {
  Users,
  Search,
  Plus,
  Phone,
  MapPin,
  FileText,
  AlertCircle,
  CheckCircle2,
  Edit2,
  Trash2,
  Power,
  CreditCard,
  ShoppingBag,
  X,
} from "lucide-react";
import {
  createCustomerAction,
  updateCustomerAction,
  toggleCustomerStatusAction,
  deleteCustomerAction,
  getCustomerDetailsAction,
} from "./actions";

export interface CustomerItem {
  id: number;
  code?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive: boolean;
  totalPurchases: number;
  totalPaid: number;
  outstandingBalance: number;
  confirmedSalesCount?: number;
  lastPurchaseDate?: string | Date | null;
}

export interface CustomerSaleItem {
  id: number;
  product?: {
    sku: string;
    name: string;
    model?: string | null;
    color?: string | null;
  };
}

export interface CustomerSale {
  id: number;
  reference: string;
  saleDate: string | Date;
  status: string;
  totalAmount: number;
  paidAmount: number;
  items?: CustomerSaleItem[];
}

export interface CustomerDetails extends CustomerItem {
  sales: CustomerSale[];
}

interface CustomersClientProps {
  initialCustomers: CustomerItem[];
}

export function CustomersClient({ initialCustomers }: CustomersClientProps) {
  const [customers, setCustomers] = useState<CustomerItem[]>(initialCustomers);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "debt" | "active" | "inactive">("all");
  
  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerItem | null>(null);
  const [selectedCustomerDetails, setSelectedCustomerDetails] = useState<CustomerDetails | null>(null);
  const [deleteConfirmCustomer, setDeleteConfirmCustomer] = useState<CustomerItem | null>(null);

  // Notifications & loading
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  // Metrics
  const totalCustomers = customers.length;
  const activeCustomers = customers.filter((c) => c.isActive).length;
  const debtorCustomers = customers.filter((c) => c.outstandingBalance > 0);
  const totalOutstandingDebt = debtorCustomers.reduce((acc, c) => acc + c.outstandingBalance, 0);

  // Filtered list
  const filteredCustomers = customers.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      c.name.toLowerCase().includes(q) ||
      (c.phone && c.phone.includes(q)) ||
      (c.code && c.code.toLowerCase().includes(q)) ||
      (c.address && c.address.toLowerCase().includes(q));

    if (!matchesSearch) return false;

    if (activeFilter === "debt") return c.outstandingBalance > 0;
    if (activeFilter === "active") return c.isActive;
    if (activeFilter === "inactive") return !c.isActive;
    return true;
  });

  const handleCreateCustomer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createCustomerAction(formData);
      if (res.success) {
        showNotification("success", res.message || "Client créé avec succès.");
        setIsCreateOpen(false);
        // Refresh local state
        if (res.data) {
          const newCustomer = res.data as CustomerItem;
          setCustomers([
            {
              ...newCustomer,
              totalPurchases: 0,
              totalPaid: 0,
              outstandingBalance: 0,
              confirmedSalesCount: 0,
              lastPurchaseDate: null,
            },
            ...customers,
          ]);
        }
      } else {
        showNotification("error", res.error || "Erreur de création.");
      }
    });
  };

  const handleUpdateCustomer = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editingCustomer) return;
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateCustomerAction(editingCustomer.id, formData);
      if (res.success) {
        showNotification("success", res.message || "Client mis à jour.");
        const updatedData = res.data as Partial<CustomerItem>;
        setCustomers((prev) =>
          prev.map((c) => (c.id === editingCustomer.id ? { ...c, ...updatedData } : c))
        );
        setEditingCustomer(null);
      } else {
        showNotification("error", res.error || "Erreur de mise à jour.");
      }
    });
  };

  const handleToggleStatus = (customer: CustomerItem) => {
    startTransition(async () => {
      const res = await toggleCustomerStatusAction(customer.id);
      if (res.success) {
        showNotification("success", res.message || "Statut mis à jour.");
        setCustomers((prev) =>
          prev.map((c) => (c.id === customer.id ? { ...c, isActive: !c.isActive } : c))
        );
      } else {
        showNotification("error", res.error || "Erreur.");
      }
    });
  };

  const handleDeleteCustomer = (customerId: number) => {
    startTransition(async () => {
      const res = await deleteCustomerAction(customerId);
      if (res.success) {
        showNotification("success", res.message || "Client supprimé.");
        setCustomers((prev) => prev.filter((c) => c.id !== customerId));
        setDeleteConfirmCustomer(null);
      } else {
        showNotification("error", res.error || "Erreur.");
      }
    });
  };

  const handleOpenDetails = async (customerId: number) => {
    const details = await getCustomerDetailsAction(customerId);
    setSelectedCustomerDetails(details as unknown as CustomerDetails);
  };

  return (
    <div className="space-y-6">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Gestion du Répertoire Clients
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Fiches contacts, suivi des achats de mobilier, facturation et créances clients (DA).
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nouveau Client
        </button>
      </div>

      {/* ── Notification Banner ─────────────────────────────────────────────── */}
      {notification && (
        <div
          className={`p-4 rounded-lg flex items-center justify-between text-sm ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
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
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Metric KPI Cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Clients
            </span>
            <Users className="h-5 w-5 text-amber-500" />
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{totalCustomers}</p>
          <p className="text-xs text-slate-500 mt-1">Fiches enregistrées en base</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Clients Actifs
            </span>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">{activeCustomers}</p>
          <p className="text-xs text-emerald-600 mt-1">Éligibles aux ventes & factures</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Clients avec Crédit
            </span>
            <CreditCard className="h-5 w-5 text-rose-500" />
          </div>
          <p className="mt-3 text-2xl font-black text-rose-700">{debtorCustomers.length}</p>
          <p className="text-xs text-rose-600 mt-1">Factures avec solde restant dû</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Créances Clients
            </span>
            <span className="text-xs font-bold font-mono text-rose-600 bg-rose-50 px-2 py-0.5 rounded">
              DZD / DA
            </span>
          </div>
          <p className="mt-3 text-2xl font-black font-mono text-rose-700">
            {totalOutstandingDebt.toLocaleString("fr-DZ")} DA
          </p>
          <p className="text-xs text-slate-500 mt-1">Reste à encaisser sur ventes</p>
        </div>
      </div>

      {/* ── Search & Filters Bar ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher par nom, téléphone, code client ou ville..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:bg-white"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            onClick={() => setActiveFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeFilter === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Tous ({customers.length})
          </button>
          <button
            onClick={() => setActiveFilter("debt")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeFilter === "debt"
                ? "bg-rose-700 text-white"
                : "bg-rose-50 text-rose-700 hover:bg-rose-100"
            }`}
          >
            Avec Crédit ({debtorCustomers.length})
          </button>
          <button
            onClick={() => setActiveFilter("active")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeFilter === "active"
                ? "bg-emerald-700 text-white"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            }`}
          >
            Actifs ({activeCustomers})
          </button>
          <button
            onClick={() => setActiveFilter("inactive")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeFilter === "inactive"
                ? "bg-slate-700 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Inactifs ({customers.length - activeCustomers})
          </button>
        </div>
      </div>

      {/* ── Customers Table ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700 uppercase tracking-wider">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Client</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4 text-center">Ventes</th>
                <th className="py-3 px-4 text-right">Total Achats (DA)</th>
                <th className="py-3 px-4 text-right">Total Versé (DA)</th>
                <th className="py-3 px-4 text-right">Solde Dû (Crédit)</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Users className="mx-auto h-8 w-8 opacity-40 mb-2" />
                    Aucun client ne correspond à votre recherche.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-sm text-slate-800">
                      {customer.code || `CLI-${customer.id}`}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleOpenDetails(customer.id)}
                        className="text-base font-bold text-slate-900 hover:text-amber-600 text-left transition-colors cursor-pointer"
                      >
                        {customer.name}
                      </button>
                      {customer.address && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                          <MapPin className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-xs">{customer.address}</span>
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {customer.phone ? (
                        <a
                          href={`tel:${customer.phone}`}
                          className="font-mono text-sm text-slate-700 hover:text-amber-600 flex items-center gap-1.5"
                        >
                          <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {customer.phone}
                        </a>
                      ) : (
                        <span className="text-slate-400 text-xs">Non renseigné</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">
                      {customer.confirmedSalesCount || 0}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-slate-900">
                      {(customer.totalPurchases || 0).toLocaleString("fr-DZ")} DA
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-700 font-medium">
                      {(customer.totalPaid || 0).toLocaleString("fr-DZ")} DA
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {customer.outstandingBalance > 0 ? (
                        <span className="inline-block bg-rose-50 text-rose-700 font-bold px-2 py-0.5 rounded text-sm">
                          {customer.outstandingBalance.toLocaleString("fr-DZ")} DA
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">0 DA (À jour)</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          customer.isActive
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {customer.isActive ? "Actif" : "Inactif"}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenDetails(customer.id)}
                          title="Fiche & Historique"
                          className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <FileText className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setEditingCustomer(customer)}
                          title="Modifier"
                          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleStatus(customer)}
                          title={customer.isActive ? "Désactiver" : "Activer"}
                          className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                            customer.isActive
                              ? "text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                              : "text-emerald-600 hover:bg-emerald-50"
                          }`}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirmCustomer(customer)}
                          title="Supprimer"
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal: Nouveau Client ───────────────────────────────────────────── */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">Ajouter un Nouveau Client</h2>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nom et Prénom / Entreprise <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Ex : M. Benali Karim"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Numéro de Téléphone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    placeholder="Ex : 0550 12 34 56"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Adresse Email (Optionnelle)
                  </label>
                  <input
                    type="email"
                    name="email"
                    placeholder="client@mail.com"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Adresse & Ville de Livraison
                </label>
                <input
                  type="text"
                  name="address"
                  placeholder="Ex : Cité 500 Logements, Bab Ezzouar, Alger"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Notes / Observations Particulières
                </label>
                <textarea
                  name="notes"
                  rows={2}
                  placeholder="Préférences de livraison, instructions spécifiques..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Enregistrement..." : "Enregistrer le Client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Modifier Client ─────────────────────────────────────────── */}
      {editingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <h2 className="text-lg font-bold text-slate-900">
                Modifier la Fiche : {editingCustomer.name}
              </h2>
              <button
                onClick={() => setEditingCustomer(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateCustomer} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nom du Client <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingCustomer.name}
                  required
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Numéro de Téléphone
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    defaultValue={editingCustomer.phone || ""}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    name="email"
                    defaultValue={editingCustomer.email || ""}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Adresse de Livraison
                </label>
                <input
                  type="text"
                  name="address"
                  defaultValue={editingCustomer.address || ""}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={editingCustomer.notes || ""}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Mise à jour..." : "Enregistrer les modifications"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Fiche Complète & Historique Client ────────────────────────── */}
      {selectedCustomerDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-3xl bg-white rounded-xl shadow-2xl p-6 my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  {selectedCustomerDetails.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {selectedCustomerDetails.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Code : {selectedCustomerDetails.code || `CLI-${selectedCustomerDetails.id}`} •
                    Statut : {selectedCustomerDetails.isActive ? "Actif" : "Inactif"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedCustomerDetails(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 overflow-y-auto py-4 space-y-6">
              {/* Financial summary bar */}
              <div className="grid grid-cols-3 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-center">
                <div>
                  <span className="text-xs text-slate-500">Total Achats Mobilier</span>
                  <p className="text-lg font-mono font-bold text-slate-900 mt-0.5">
                    {(selectedCustomerDetails.totalPurchases || 0).toLocaleString("fr-DZ")} DA
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Total Règlements Versés</span>
                  <p className="text-lg font-mono font-bold text-emerald-700 mt-0.5">
                    {(selectedCustomerDetails.totalPaid || 0).toLocaleString("fr-DZ")} DA
                  </p>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Solde Restant Dû (Crédit)</span>
                  <p
                    className={`text-lg font-mono font-black mt-0.5 ${
                      selectedCustomerDetails.outstandingBalance > 0
                        ? "text-rose-700"
                        : "text-emerald-700"
                    }`}
                  >
                    {(selectedCustomerDetails.outstandingBalance || 0).toLocaleString("fr-DZ")} DA
                  </p>
                </div>
              </div>

              {/* Coordonnées */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="font-bold text-slate-500 uppercase">Téléphone</span>
                  <p className="font-mono text-sm text-slate-800 mt-1">
                    {selectedCustomerDetails.phone || "Non renseigné"}
                  </p>
                </div>
                <div className="p-3 bg-white border border-slate-200 rounded-lg">
                  <span className="font-bold text-slate-500 uppercase">Adresse</span>
                  <p className="text-sm text-slate-800 mt-1">
                    {selectedCustomerDetails.address || "Non renseignée"}
                  </p>
                </div>
              </div>

              {/* Historique des achats */}
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-amber-500" />
                  Historique des Ventes & Factures ({selectedCustomerDetails.sales?.length || 0})
                </h3>

                {selectedCustomerDetails.sales?.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center bg-slate-50 rounded-lg border border-dashed border-slate-200">
                    Aucun achat enregistré pour ce client.
                  </p>
                ) : (
                  <div className="overflow-hidden border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <tr>
                          <th className="py-2 px-3">Réf Facture</th>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Articles</th>
                          <th className="py-2 px-3 text-right">Montant (DA)</th>
                          <th className="py-2 px-3 text-right">Versé</th>
                          <th className="py-2 px-3 text-right">Reste</th>
                          <th className="py-2 px-3 text-center">Statut</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedCustomerDetails.sales.map((s: CustomerSale) => (
                          <tr key={s.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono font-bold text-slate-900">
                              {s.reference}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {new Date(s.saleDate).toLocaleDateString("fr-DZ")}
                            </td>
                            <td className="py-2 px-3 text-slate-600">
                              {s.items?.length || 0} article(s)
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold">
                              {s.totalAmount.toLocaleString("fr-DZ")} DA
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-emerald-700">
                              {s.paidAmount.toLocaleString("fr-DZ")}
                            </td>
                            <td className="py-2 px-3 text-right font-mono text-rose-700 font-semibold">
                              {(s.totalAmount - s.paidAmount).toLocaleString("fr-DZ")}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span
                                className={`inline-block px-2.5 py-1 rounded text-xs font-bold ${
                                  s.status === "confirmed"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : s.status === "draft"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {s.status === "confirmed"
                                  ? "Confirmée"
                                  : s.status === "draft"
                                  ? "Brouillon"
                                  : "Annulée"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedCustomerDetails(null)}
                className="px-4 py-2 text-sm font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Fermer la fiche
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmation Suppression Protégée ────────────────────────── */}
      {deleteConfirmCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 text-rose-600 pb-3 border-b border-slate-200">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <h2 className="text-base font-bold text-slate-900">Confirmation de suppression</h2>
            </div>

            <p className="text-sm text-slate-600 mt-4 leading-relaxed">
              Êtes-vous sûr de vouloir supprimer définitivement le client{" "}
              <strong className="text-slate-900">{deleteConfirmCustomer.name}</strong> ?
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-2">
              Note : Si ce client possède des factures ou des ventes enregistrées, la suppression sera
              strictement bloquée par le système pour préserver la comptabilité. Vous pourrez alors
              choisir de le désactiver.
            </p>

            <div className="flex justify-end gap-3 pt-5 border-t border-slate-200 mt-4">
              <button
                onClick={() => setDeleteConfirmCustomer(null)}
                className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDeleteCustomer(deleteConfirmCustomer.id)}
                disabled={isPending}
                className="px-4 py-2 text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
              >
                {isPending ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
