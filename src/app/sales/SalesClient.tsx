"use client";

import React, { useState, useMemo, useTransition } from "react";
import {
  Receipt,
  Search,
  Plus,
  Printer,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  Truck,
  FileText,
  DollarSign,
  Trash2,
  Ban,
} from "lucide-react";
import {
  createSaleAction,
  confirmDraftSaleAction,
  cancelSaleAction,
  recordSalePaymentAction,
  updateDeliveryStatusAction,
} from "./actions";
import {
  PrintableInvoice,
  PrintablePaymentReceipt,
  type PrintableSale,
  type PrintablePayment,
} from "@/components/sales/PrintableInvoice";
import {
  PrintableDeliveryNote,
  type PrintableDeliveryNoteData,
} from "@/components/documents/PrintableNewDocuments";
import type { ShopSettingsData } from "@/app/settings/actions";
import { NewCustomerModal, type CreatedCustomerData } from "@/components/customers/NewCustomerModal";

export interface ProductStockInfo {
  id: number;
  locationId: number;
  quantity: number;
}

export interface ProductItem {
  id: number;
  sku: string;
  name: string;
  model?: string | null;
  color?: string | null;
  sellingPrice?: number | null;
  stocks?: ProductStockInfo[];
}

export interface CustomerOption {
  id: number;
  code?: string | null;
  name: string;
  phone?: string | null;
  address?: string | null;
  isActive: boolean;
}

export interface LocationOption {
  id: number;
  code: string;
  name: string;
  isDefault: boolean;
}

export interface SalesMetrics {
  totalRevenue: number;
  totalCollected: number;
  totalOutstandingCredit: number;
  totalSalesCount: number;
  pendingDeliveriesCount: number;
}

interface SalesClientProps {
  initialData: {
    sales: PrintableSale[];
    customers: CustomerOption[];
    products: ProductItem[];
    locations: LocationOption[];
    settings?: ShopSettingsData | null;
    metrics: SalesMetrics;
  };
}

export function SalesClient({ initialData }: SalesClientProps) {
  const sales = initialData.sales;
  const metrics = initialData.metrics;
  const [createdCustomers, setCreatedCustomers] = useState<CustomerOption[]>([]);
  const customers = useMemo(() => {
    const list = [...createdCustomers];
    for (const c of initialData.customers) {
      if (!list.some((item) => item.id === c.id)) {
        list.push(c);
      }
    }
    return list;
  }, [initialData.customers, createdCustomers]);
  const products = initialData.products;
  const locations = initialData.locations;

  // New Client Modal state
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);

  // Active Main Tab
  const [activeTab, setActiveTab] = useState<"list" | "create" | "credits" | "deliveries">("list");

  // Search & Filters on list
  const [searchQuery, setSearchQuery] = useState("");
  const [saleStatusFilter, setSaleStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");

  // Notifications & loading
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modals
  const [printingSale, setPrintingSale] = useState<PrintableSale | null>(null);
  const [printingDeliveryNote, setPrintingDeliveryNote] = useState<PrintableDeliveryNoteData | null>(null);
  const [paymentModalSale, setPaymentModalSale] = useState<PrintableSale | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>("");
  const [paymentInputError, setPaymentInputError] = useState<string | null>(null);
  const [printingReceipt, setPrintingReceipt] = useState<{ payment: PrintablePayment; sale: PrintableSale } | null>(null);
  const [cancelModalSale, setCancelModalSale] = useState<PrintableSale | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const openPaymentModal = (sale: PrintableSale) => {
    setPaymentModalSale(sale);
    setPaymentAmountInput("");
    setPaymentInputError(null);
  };

  const closePaymentModal = () => {
    setPaymentModalSale(null);
    setPaymentAmountInput("");
    setPaymentInputError(null);
  };

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  // ─── FORMULAIRE DE CRÉATION DE VENTE ──────────────────────────────────────
  interface FormLine {
    productId: number;
    locationId: number;
    quantity: number;
    unitPrice: number;
    discount: number;
  }

  const defaultLocation = locations.find((l) => l.isDefault)?.id || locations[0]?.id || 0;

  const [formCustomerId, setFormCustomerId] = useState<string>("walkin");
  const [formSaleDate, setFormSaleDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formStatus, setFormStatus] = useState<"confirmed" | "draft">("confirmed");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formDeliveryFee, setFormDeliveryFee] = useState<number>(0);
  const [formGlobalDiscount, setFormGlobalDiscount] = useState<number>(0);
  const [formLines, setFormLines] = useState<FormLine[]>([
    {
      productId: products[0]?.id || 0,
      locationId: defaultLocation,
      quantity: 1,
      unitPrice: products[0]?.sellingPrice || 0,
      discount: 0,
    },
  ]);

  // Payment form state
  const [formPaymentType, setFormPaymentType] = useState<"full" | "partial" | "credit">("full");
  const [formPaidAmount, setFormPaidAmount] = useState<number>(0);
  const [formPaymentMethod, setFormPaymentMethod] = useState<"cash" | "cib" | "check" | "transfer">("cash");
  const [formPaymentNotes, setFormPaymentNotes] = useState<string>("");

  // Delivery form state
  const [formHasDelivery, setFormHasDelivery] = useState<boolean>(false);
  const [formDeliveryMethod, setFormDeliveryMethod] = useState<"home_delivery" | "store_pickup">("home_delivery");
  const [formDeliveryAddress, setFormDeliveryAddress] = useState<string>("");
  const [formDeliveryPlannedDate, setFormDeliveryPlannedDate] = useState<string>("");
  const [formDeliveryNotes, setFormDeliveryNotes] = useState<string>("");

  const handleNewCustomerCreated = (newCust: CreatedCustomerData) => {
    const newOption: CustomerOption = {
      id: newCust.id,
      code: newCust.code || `CLI-${newCust.id}`,
      name: newCust.name,
      phone: newCust.phone || null,
      address: newCust.address || null,
      isActive: newCust.isActive ?? true,
    };
    setCreatedCustomers((prev) => {
      if (prev.some((c) => c.id === newCust.id)) return prev;
      return [newOption, ...prev];
    });
    setFormCustomerId(String(newCust.id));
    if (newCust.address && !formDeliveryAddress) {
      setFormDeliveryAddress(newCust.address);
    }
    showNotification("success", "Client créé et sélectionné pour cette vente.");
  };

  // Calculate live totals
  const subtotal = formLines.reduce((sum, line) => {
    const lineTotal = Math.max(0, line.quantity * line.unitPrice - (line.discount || 0));
    return sum + lineTotal;
  }, 0);
  const grandTotal = Math.max(0, subtotal + (formDeliveryFee || 0) - (formGlobalDiscount || 0));
  const remainingDue = Math.max(0, grandTotal - formPaidAmount);

  // Helper to get available stock for a product at a location
  const getAvailableStock = (prodId: number, locId: number): number => {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return 0;
    const stockRow = prod.stocks?.find((s: ProductStockInfo) => s.locationId === locId);
    return stockRow?.quantity ?? 0;
  };

  const handleProductChange = (index: number, newProductId: number) => {
    const prod = products.find((p) => p.id === newProductId);
    const newUnitPrice = prod?.sellingPrice ?? 0;
    setFormLines((prev) =>
      prev.map((l, i) => (i === index ? { ...l, productId: newProductId, unitPrice: newUnitPrice } : l))
    );
  };

  const handleAddLine = () => {
    const firstProd = products[0];
    setFormLines((prev) => [
      ...prev,
      {
        productId: firstProd?.id || 0,
        locationId: defaultLocation,
        quantity: 1,
        unitPrice: firstProd?.sellingPrice || 0,
        discount: 0,
      },
    ]);
  };

  const handleRemoveLine = (index: number) => {
    if (formLines.length === 1) {
      showNotification("error", "Une vente doit comporter au moins un meuble.");
      return;
    }
    setFormLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePaymentTypeChange = (type: "full" | "partial" | "credit") => {
    setFormPaymentType(type);
    if (type === "full") {
      setFormPaidAmount(grandTotal);
    } else if (type === "credit") {
      setFormPaidAmount(0);
    } else {
      setFormPaidAmount(Math.round(grandTotal / 2));
    }
  };

  const handleCreateSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validations client préalables
    if (formLines.length === 0) {
      showNotification("error", "Veuillez ajouter au moins un meuble.");
      return;
    }

    for (let i = 0; i < formLines.length; i++) {
      const line = formLines[i];
      if (line.quantity <= 0 || !Number.isInteger(line.quantity)) {
        showNotification("error", `Ligne ${i + 1} : La quantité doit être un nombre entier positif.`);
        return;
      }
      if (formStatus === "confirmed") {
        const available = getAvailableStock(line.productId, line.locationId);
        if (available < line.quantity) {
          const prod = products.find((p) => p.id === line.productId);
          const loc = locations.find((l) => l.id === line.locationId);
          showNotification(
            "error",
            `Stock insuffisant pour "${prod?.name}" à "${loc?.name}" : ${available} unité(s) disponible(s), ${line.quantity} demandée(s).`
          );
          return;
        }
      }
    }

    const payload = {
      customerId: formCustomerId === "walkin" ? null : parseInt(formCustomerId, 10),
      saleDate: formSaleDate,
      status: formStatus,
      notes: formNotes?.trim() || null,
      deliveryFee: formDeliveryFee,
      discount: formGlobalDiscount,
      items: formLines.map((l) => ({
        productId: l.productId,
        locationId: l.locationId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
      })),
      initialPayment:
        formStatus === "confirmed" && formPaidAmount > 0
          ? {
              amount: formPaidAmount,
              method: formPaymentMethod,
              notes: formPaymentNotes,
            }
          : undefined,
      delivery: formHasDelivery
        ? {
            hasDelivery: true,
            method: formDeliveryMethod,
            fee: formDeliveryMethod === "store_pickup" ? 0 : formDeliveryFee,
            address: formDeliveryMethod === "store_pickup" ? "Retrait au magasin" : formDeliveryAddress,
            plannedDate: formDeliveryPlannedDate || undefined,
            notes: formDeliveryNotes,
          }
        : undefined,
    };

    startTransition(async () => {
      const res = await createSaleAction(payload);
      if (res.success) {
        showNotification("success", res.message || "Vente enregistrée avec succès.");
        // Reset form & go to list
        setActiveTab("list");
        window.location.reload();
      } else {
        showNotification("error", res.error || "Erreur lors de la vente.");
      }
    });
  };

  // ─── ACTION RÈGLEMENT COMPLÉMENTAIRE ──────────────────────────────────────
  const handleRecordPayment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!paymentModalSale) return;

    const remainingBalance = Math.max(0, paymentModalSale.totalAmount - paymentModalSale.paidAmount);
    const trimmedVal = paymentAmountInput.trim();

    if (!trimmedVal) {
      setPaymentInputError("Veuillez saisir le montant du versement.");
      return;
    }

    const amount = parseFloat(trimmedVal);
    if (isNaN(amount) || amount <= 0) {
      setPaymentInputError("Le montant du règlement doit être un nombre strictement supérieur à 0 DA.");
      return;
    }

    if (amount > remainingBalance) {
      setPaymentInputError(
        `Le montant saisi (${amount.toLocaleString("fr-DZ")} DA) dépasse le solde restant dû (${remainingBalance.toLocaleString("fr-DZ")} DA).`
      );
      return;
    }

    setPaymentInputError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("amount", trimmedVal);
    formData.append("saleId", String(paymentModalSale.id));

    startTransition(async () => {
      const res = await recordSalePaymentAction(formData);
      if (res.success) {
        showNotification("success", res.message || "Paiement validé.");
        const paymentRecord = res.data as PrintablePayment;
        const currentSale = paymentModalSale;
        closePaymentModal();
        // Show print receipt
        if (paymentRecord) {
          setPrintingReceipt({ payment: paymentRecord, sale: currentSale });
        }
        window.location.reload();
      } else {
        showNotification("error", res.error || "Erreur de règlement.");
        setPaymentInputError(res.error || "Erreur de règlement.");
      }
    });
  };

  // ─── CONFIRMATION BROUILLON ───────────────────────────────────────────────
  const handleConfirmDraft = (saleId: number) => {
    startTransition(async () => {
      const res = await confirmDraftSaleAction(saleId);
      if (res.success) {
        showNotification("success", res.message || "Vente confirmée.");
        window.location.reload();
      } else {
        showNotification("error", res.error || "Erreur de confirmation.");
      }
    });
  };

  // ─── ANNULATION VENTE ─────────────────────────────────────────────────────
  const handleCancelSale = () => {
    if (!cancelModalSale) return;
    if (!cancelReason.trim()) {
      showNotification("error", "Veuillez renseigner un motif d'annulation.");
      return;
    }

    startTransition(async () => {
      const res = await cancelSaleAction(cancelModalSale.id, cancelReason);
      if (res.success) {
        showNotification("success", res.message || "Vente annulée.");
        setCancelModalSale(null);
        setCancelReason("");
        window.location.reload();
      } else {
        showNotification("error", res.error || "Erreur d'annulation.");
      }
    });
  };

  // ─── MISE À JOUR LIVRAISON ────────────────────────────────────────────────
  const handleUpdateDeliveryStatus = (deliveryId: number, newStatus: string) => {
    startTransition(async () => {
      const res = await updateDeliveryStatusAction(deliveryId, newStatus);
      if (res.success) {
        showNotification("success", res.message || "Statut livraison mis à jour.");
        window.location.reload();
      } else {
        showNotification("error", res.error || "Erreur.");
      }
    });
  };

  // Filtered sales
  const filteredSales = sales.filter((s) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      s.reference.toLowerCase().includes(q) ||
      (s.customer?.name && s.customer.name.toLowerCase().includes(q)) ||
      (s.customer?.phone && s.customer.phone.includes(q));

    if (!matchesSearch) return false;

    if (saleStatusFilter !== "all" && s.status !== saleStatusFilter) return false;
    if (paymentStatusFilter !== "all" && s.paymentStatus !== paymentStatusFilter) return false;

    return true;
  });

  const creditSales = sales.filter((s) => s.status === "confirmed" && s.totalAmount > s.paidAmount);

  const allDeliveries = sales
    .flatMap((s) =>
      (s.deliveries || []).map((d) => ({
        ...d,
        saleRef: s.reference,
        saleDate: s.saleDate,
        customerName: s.customer?.name || "Client Passager",
        customerPhone: s.customer?.phone || null,
        customerAddress: s.customer?.address || null,
        totalAmount: s.totalAmount,
        items: s.items || [],
        isPickup: d.method === "store_pickup",
      }))
    )
    .sort((a, b) => new Date(b.deliveryDate || 0).getTime() - new Date(a.deliveryDate || 0).getTime());

  return (
    <div className="space-y-6">
      {/* ── Top Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Facturation &amp; Ventes de Mobilier
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Émission des factures, déduction atomique du stock, gestion des acomptes et créances en Dinars (DA).
          </p>
        </div>

        <button
          onClick={() => {
            setActiveTab("create");
            handlePaymentTypeChange("full");
          }}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 hover:bg-amber-600 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nouvelle Vente / Facture
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

      {/* ── KPI Metrics Cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Chiffre d&apos;Affaires Réalisé
            </span>
            <DollarSign className="h-5 w-5 text-amber-500" />
          </div>
          <p className="mt-3 text-2xl font-black font-mono text-slate-900">
            {metrics.totalRevenue.toLocaleString("fr-DZ")} DA
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {metrics.totalSalesCount} facture(s) confirmée(s)
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Total Encaissé
            </span>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <p className="mt-3 text-2xl font-black font-mono text-emerald-700">
            {metrics.totalCollected.toLocaleString("fr-DZ")} DA
          </p>
          <p className="text-xs text-emerald-600 mt-1">Versements perçus en caisse</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Crédits Clients en Cours
            </span>
            <CreditCard className="h-5 w-5 text-rose-500" />
          </div>
          <p className="mt-3 text-2xl font-black font-mono text-rose-700">
            {metrics.totalOutstandingCredit.toLocaleString("fr-DZ")} DA
          </p>
          <p className="text-xs text-rose-600 mt-1">Reste à recouvrer</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Livraisons en Cours
            </span>
            <Truck className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">
            {metrics.pendingDeliveriesCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">Colis en préparation / acheminement</p>
        </div>
      </div>

      {/* ── Main Tab Navigation ─────────────────────────────────────────────── */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab("list")}
            className={`py-3 px-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer ${
              activeTab === "list"
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Factures &amp; Ventes ({sales.length})
          </button>
          <button
            onClick={() => setActiveTab("create")}
            className={`py-3 px-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer ${
              activeTab === "create"
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            + Nouvelle Vente / Facture
          </button>
          <button
            onClick={() => setActiveTab("credits")}
            className={`py-3 px-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer ${
              activeTab === "credits"
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Suivi des Crédits ({creditSales.length})
          </button>
          <button
            onClick={() => setActiveTab("deliveries")}
            className={`py-3 px-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer ${
              activeTab === "deliveries"
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Suivi des Livraisons ({allDeliveries.length})
          </button>
        </nav>
      </div>

      {/* ── TAB 1: LISTE DES VENTES ─────────────────────────────────────────── */}
      {activeTab === "list" && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par N° facture (ex: FAC-...), nom client, tél..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 focus:bg-white"
              />
            </div>

            <div className="flex items-center gap-3">
              <select
                value={saleStatusFilter}
                onChange={(e) => setSaleStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium"
              >
                <option value="all">Tous les statuts de vente</option>
                <option value="confirmed">Confirmées (Facturées)</option>
                <option value="draft">Brouillons (Devis)</option>
                <option value="cancelled">Annulées</option>
              </select>

              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium"
              >
                <option value="all">Tous les statuts de paiement</option>
                <option value="paid">Payées (Comptant)</option>
                <option value="partial">Partiellement payées</option>
                <option value="unpaid">À crédit (Non payées)</option>
              </select>
            </div>
          </div>

          {/* Sales Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">N° Facture</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Client</th>
                    <th className="py-3 px-4 text-center">Articles</th>
                    <th className="py-3 px-4 text-right">Montant Total</th>
                    <th className="py-3 px-4 text-right">Versé</th>
                    <th className="py-3 px-4 text-right">Reste Dû</th>
                    <th className="py-3 px-4 text-center">Paiement</th>
                    <th className="py-3 px-4 text-center">Livraison</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400">
                        <Receipt className="mx-auto h-8 w-8 opacity-40 mb-2" />
                        Aucune vente ne correspond aux critères sélectionnés.
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((sale) => {
                      const balance = Math.max(0, sale.totalAmount - sale.paidAmount);
                      return (
                        <tr key={sale.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-sm">
                            {sale.reference}
                            {sale.status === "draft" && (
                              <span className="block text-xs text-amber-600 font-semibold">
                                (Brouillon)
                              </span>
                            )}
                            {sale.status === "cancelled" && (
                              <span className="block text-xs text-rose-600 font-semibold">
                                (Annulée)
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-sm text-slate-600">
                            {new Date(sale.saleDate).toLocaleDateString("fr-DZ")}
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="font-semibold text-slate-900 text-sm block">
                              {sale.customer ? sale.customer.name : "Client Passager / Comptoir"}
                            </span>
                            {sale.customer?.phone && (
                              <span className="text-xs font-mono text-slate-500">
                                {sale.customer.phone}
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center text-sm font-semibold text-slate-700">
                            {sale.items?.length || 0}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                            {sale.totalAmount.toLocaleString("fr-DZ")} DA
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-emerald-700 font-medium text-sm">
                            {sale.paidAmount.toLocaleString("fr-DZ")} DA
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-sm">
                            {balance > 0 ? (
                              <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded">
                                {balance.toLocaleString("fr-DZ")} DA
                              </span>
                            ) : (
                              <span className="text-slate-400">0 DA</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wider ${
                                sale.paymentStatus === "paid"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : sale.paymentStatus === "partial"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {sale.paymentStatus === "paid"
                                ? "Payée"
                                : sale.paymentStatus === "partial"
                                ? "Partiel"
                                : "À Crédit"}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center text-xs">
                            <span
                              className={`inline-block px-2.5 py-1 rounded text-xs font-bold ${
                                sale.deliveryStatus === "delivered"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : sale.deliveryStatus === "in_transit"
                                  ? "bg-indigo-100 text-indigo-800"
                                  : sale.deliveryStatus === "ready"
                                  ? "bg-blue-100 text-blue-800"
                                  : sale.deliveryStatus === "pending" || sale.deliveryStatus === "to_prepare"
                                  ? "bg-amber-100 text-amber-800"
                                  : "text-slate-400"
                              }`}
                            >
                              {sale.deliveryStatus === "delivered"
                                ? "Livrée"
                                : sale.deliveryStatus === "in_transit"
                                ? "En route"
                                : sale.deliveryStatus === "pending"
                                ? "En attente"
                                : "Magasin"}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setPrintingSale(sale)}
                                title="Imprimer la Facture (A4)"
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                              >
                                <Printer className="h-4 w-4" />
                              </button>

                              {sale.status === "draft" && (
                                <button
                                  onClick={() => handleConfirmDraft(sale.id)}
                                  title="Confirmer la vente et déduire le stock"
                                  className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                </button>
                              )}

                              {sale.status === "confirmed" && balance > 0 && (
                                <button
                                  onClick={() => openPaymentModal(sale)}
                                  title="Enregistrer un versement"
                                  className="p-1.5 text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                                >
                                  <CreditCard className="h-4 w-4" />
                                </button>
                              )}

                              <button
                                onClick={() => setPrintingSale(sale)}
                                title="Voir détails"
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                              >
                                <FileText className="h-4 w-4" />
                              </button>

                              {sale.status !== "cancelled" && (
                                <button
                                  onClick={() => {
                                    setCancelModalSale(sale);
                                    setCancelReason("");
                                  }}
                                  title="Annuler la vente"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                >
                                  <Ban className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: CRÉATION NOUVELLE VENTE ──────────────────────────────────── */}
      {activeTab === "create" && (
        <form onSubmit={handleCreateSaleSubmit} className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Création d&apos;une Vente &amp; Émission de Facture
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sélectionnez les meubles, leurs dépôts de prélèvement et appliquez les conditions de paiement.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-600 uppercase">Statut :</span>
                <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setFormStatus("confirmed")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      formStatus === "confirmed"
                        ? "bg-amber-500 text-slate-900 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Vente Confirmée (Sortie de stock)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormStatus("draft")}
                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      formStatus === "draft"
                        ? "bg-slate-800 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Brouillon / Devis (Sans déduction)
                  </button>
                </div>
              </div>
            </div>

            {/* Client & Date Selector */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Client <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsNewCustomerModalOpen(true)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Nouveau client</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <select
                    value={formCustomerId}
                    onChange={(e) => setFormCustomerId(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="walkin">Client Passager / Comptoir (Vente Directe)</option>
                    {customers
                      .filter((c) => c.isActive)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ""} [{c.code || `CLI-${c.id}`}]
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setIsNewCustomerModalOpen(true)}
                    title="Ajouter un nouveau client"
                    className="px-2.5 py-2 text-xs font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer shrink-0 inline-flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Nouveau</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Date de Vente
                </label>
                <input
                  type="date"
                  value={formSaleDate}
                  onChange={(e) => setFormSaleDate(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Frais de Livraison (DA)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={formDeliveryFee}
                  onChange={(e) => setFormDeliveryFee(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0 DA"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>
            </div>

            {/* Articles Table Builder */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Articles de Mobilier Commandés
                </h3>
                <span className="text-xs text-slate-400">
                  Les stocks affichés correspondent au dépôt sélectionné
                </span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-3">Meuble / Référence</th>
                      <th className="py-2.5 px-3">Dépôt Source</th>
                      <th className="py-2.5 px-3 w-28 text-center">Qté</th>
                      <th className="py-2.5 px-3 w-36 text-right">Prix Unitaire (DA)</th>
                      <th className="py-2.5 px-3 w-28 text-right">Remise (DA)</th>
                      <th className="py-2.5 px-3 w-36 text-right">Total Ligne (DA)</th>
                      <th className="py-2.5 px-2 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {formLines.map((line, idx) => {
                      const available = getAvailableStock(line.productId, line.locationId);
                      const isStockExceeded = formStatus === "confirmed" && line.quantity > available;
                      const lineTotal = Math.max(0, line.quantity * line.unitPrice - (line.discount || 0));

                      return (
                        <tr key={idx} className={isStockExceeded ? "bg-rose-50/60" : ""}>
                          <td className="py-2.5 px-3">
                            <select
                              value={line.productId}
                              onChange={(e) => handleProductChange(idx, parseInt(e.target.value, 10))}
                              className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-medium"
                            >
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name} [{p.sku}] — {p.sellingPrice !== null && p.sellingPrice !== undefined ? `${p.sellingPrice.toLocaleString("fr-DZ")} DA` : "Prix non fixé"}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="flex flex-col gap-1">
                              <select
                                value={line.locationId}
                                onChange={(e) =>
                                  setFormLines((prev) =>
                                    prev.map((l, i) =>
                                      i === idx ? { ...l, locationId: parseInt(e.target.value, 10) } : l
                                    )
                                  )
                                }
                                className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded focus:outline-hidden focus:ring-1 focus:ring-amber-500 font-medium"
                              >
                                {locations.map((loc) => (
                                  <option key={loc.id} value={loc.id}>
                                    {loc.name}
                                  </option>
                                ))}
                              </select>
                              <span
                                className={`text-xs font-mono font-semibold ${
                                  available <= 0
                                    ? "text-rose-600 font-bold"
                                    : available < 3
                                    ? "text-amber-600 font-semibold"
                                    : "text-emerald-700"
                                }`}
                              >
                                Dispo : {available} unité(s)
                              </span>
                            </div>
                          </td>

                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={line.quantity}
                              onChange={(e) =>
                                setFormLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx
                                      ? { ...l, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) }
                                      : l
                                  )
                                )
                              }
                              className={`w-full px-2 py-1.5 text-xs text-center border rounded font-bold font-mono ${
                                isStockExceeded
                                  ? "border-rose-400 bg-rose-50 text-rose-700"
                                  : "border-slate-300 bg-white"
                              }`}
                            />
                            {isStockExceeded && (
                              <span className="block text-xs text-rose-600 text-center font-bold mt-0.5">
                                Dépasse stock ({available})
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="0"
                              step="500"
                              value={line.unitPrice}
                              onChange={(e) =>
                                setFormLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx
                                      ? { ...l, unitPrice: Math.max(0, parseFloat(e.target.value) || 0) }
                                      : l
                                  )
                                )
                              }
                              className="w-full px-2 py-1.5 text-xs text-right border border-slate-300 rounded bg-white font-mono"
                            />
                          </td>

                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={line.discount}
                              onChange={(e) =>
                                setFormLines((prev) =>
                                  prev.map((l, i) =>
                                    i === idx
                                      ? { ...l, discount: Math.max(0, parseFloat(e.target.value) || 0) }
                                      : l
                                  )
                                )
                              }
                              className="w-full px-2 py-1.5 text-xs text-right border border-slate-300 rounded bg-white font-mono text-slate-500"
                            />
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {lineTotal.toLocaleString("fr-DZ")} DA
                          </td>

                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(idx)}
                              className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
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

              <button
                type="button"
                onClick={handleAddLine}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 hover:text-amber-700 p-1 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                Ajouter une autre ligne d&apos;article
              </button>
            </div>

            {/* Financial Summary & Règlement Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-slate-200">
              {/* Left: Modalités de règlement */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    Modalités de Règlement Initial
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => handlePaymentTypeChange("full")}
                      className={`px-2 py-1 text-xs font-bold rounded cursor-pointer ${
                        formPaymentType === "full"
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      Comptant (100%)
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePaymentTypeChange("partial")}
                      className={`px-2 py-1 text-xs font-bold rounded cursor-pointer ${
                        formPaymentType === "partial"
                          ? "bg-amber-600 text-white"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      Acompte
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePaymentTypeChange("credit")}
                      className={`px-2 py-1 text-xs font-bold rounded cursor-pointer ${
                        formPaymentType === "credit"
                          ? "bg-rose-700 text-white"
                          : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      À Crédit (0 DA)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                      Montant Versé Immédiat (DA)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max={grandTotal}
                      step="1"
                      value={formPaidAmount}
                      onChange={(e) => {
                        const val = Math.max(0, parseFloat(e.target.value) || 0);
                        setFormPaidAmount(Math.min(val, grandTotal));
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono font-bold text-emerald-700"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                      Mode d&apos;Encaissement
                    </label>
                    <select
                      value={formPaymentMethod}
                      onChange={(e) => setFormPaymentMethod(e.target.value as "cash" | "cib" | "check" | "transfer")}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="cash">Espèces (Comptant)</option>
                      <option value="cib">Carte CIB / Edahabia</option>
                      <option value="check">Chèque bancaire</option>
                      <option value="transfer">Virement bancaire</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                    Note ou Référence du Règlement
                  </label>
                  <input
                    type="text"
                    value={formPaymentNotes}
                    onChange={(e) => setFormPaymentNotes(e.target.value)}
                    placeholder="Ex : N° chèque 049812 ou acompte réservation salon"
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>

                {/* Delivery options */}
                <div className="pt-3 border-t border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer mb-2">
                    <input
                      type="checkbox"
                      checked={formHasDelivery}
                      onChange={(e) => setFormHasDelivery(e.target.checked)}
                      className="rounded text-amber-500 focus:ring-amber-500 h-4 w-4"
                    />
                    <span className="text-xs font-bold text-slate-800">
                      Expédition ou Retrait programmé
                    </span>
                  </label>

                  {formHasDelivery && (
                    <div className="space-y-3 mt-2 text-xs">
                      {/* Mode selection */}
                      <div className="flex gap-4">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="deliveryMethod"
                            checked={formDeliveryMethod === "home_delivery"}
                            onChange={() => setFormDeliveryMethod("home_delivery")}
                            className="text-amber-500 focus:ring-amber-500 h-3.5 w-3.5"
                          />
                          <span className="font-semibold text-slate-700">Livraison à domicile</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="deliveryMethod"
                            checked={formDeliveryMethod === "store_pickup"}
                            onChange={() => {
                              setFormDeliveryMethod("store_pickup");
                              setFormDeliveryFee(0);
                            }}
                            className="text-amber-500 focus:ring-amber-500 h-3.5 w-3.5"
                          />
                          <span className="font-semibold text-slate-700">Retrait au magasin</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block font-medium text-slate-600 mb-0.5">
                            {formDeliveryMethod === "store_pickup" ? "Lieu de mise à disposition" : "Adresse exacte"}
                          </label>
                          <input
                            type="text"
                            value={formDeliveryMethod === "store_pickup" ? "Retrait au comptoir magasin" : formDeliveryAddress}
                            disabled={formDeliveryMethod === "store_pickup"}
                            onChange={(e) => setFormDeliveryAddress(e.target.value)}
                            placeholder="Adresse et quartier de livraison"
                            className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white disabled:bg-slate-100"
                          />
                        </div>
                        <div>
                          <label className="block font-medium text-slate-600 mb-0.5">
                            Date prévue
                          </label>
                          <input
                            type="date"
                            value={formDeliveryPlannedDate}
                            onChange={(e) => setFormDeliveryPlannedDate(e.target.value)}
                            className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block font-medium text-slate-600 mb-0.5">
                          Instructions / Remarques
                        </label>
                        <input
                          type="text"
                          value={formDeliveryNotes}
                          onChange={(e) => setFormDeliveryNotes(e.target.value)}
                          placeholder="Ex: Étage 3, contacter le client avant le départ..."
                          className="w-full px-2 py-1.5 border border-slate-300 rounded bg-white text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Synthesis Totals Box */}
              <div className="bg-slate-900 text-white p-5 rounded-xl flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Sous-total meubles :</span>
                    <span className="font-mono">{subtotal.toLocaleString("fr-DZ")} DA</span>
                  </div>

                  {formDeliveryFee > 0 && (
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Frais de livraison :</span>
                      <span className="font-mono">+{formDeliveryFee.toLocaleString("fr-DZ")} DA</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-xs text-slate-300">
                    <span>Remise globale (DA) :</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={formGlobalDiscount}
                      onChange={(e) => setFormGlobalDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-24 px-2 py-1 bg-slate-800 border border-slate-700 rounded text-right text-emerald-400 font-mono text-xs"
                    />
                  </div>

                  <div className="pt-2">
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Notes / Observations Facture :
                    </label>
                    <textarea
                      rows={2}
                      value={formNotes}
                      onChange={(e) => setFormNotes(e.target.value)}
                      placeholder="Conditions particulières de vente, garantie..."
                      className="w-full p-2 bg-slate-800 border border-slate-700 rounded text-xs text-white"
                    ></textarea>
                  </div>

                  <div className="flex justify-between text-base font-bold pt-3 border-t border-slate-700">
                    <span>TOTAL FACTURE :</span>
                    <span className="font-mono text-xl text-amber-400">
                      {grandTotal.toLocaleString("fr-DZ")} DA
                    </span>
                  </div>

                  <div className="flex justify-between text-xs text-emerald-400 pt-1">
                    <span>Montant réglé immédiatement :</span>
                    <span className="font-mono font-bold">
                      {formPaidAmount.toLocaleString("fr-DZ")} DA
                    </span>
                  </div>

                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-slate-800">
                    <span className={remainingDue > 0 ? "text-rose-400" : "text-emerald-400"}>
                      RESTE À PAYER (SOLDE) :
                    </span>
                    <span
                      className={`font-mono text-base ${
                        remainingDue > 0 ? "text-rose-400 font-black" : "text-emerald-400"
                      }`}
                    >
                      {remainingDue.toLocaleString("fr-DZ")} DA
                    </span>
                  </div>
                </div>

                <div className="pt-6">
                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-lg transition-colors cursor-pointer shadow-md disabled:opacity-50 text-sm"
                  >
                    {isPending
                      ? "Validation de la vente en cours..."
                      : formStatus === "confirmed"
                      ? "Valider la Vente et Générer la Facture"
                      : "Enregistrer le Brouillon / Devis"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ── TAB 3: SUIVI DES CRÉDITS CLIENTS ────────────────────────────────── */}
      {activeTab === "credits" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Factures avec Solde Restant Dû (Créances Actives)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enregistrez rapidement les versements partiels ou intégraux sur les ventes à terme.
              </p>
            </div>
            <span className="text-xs font-bold font-mono text-rose-700 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
              Total créances : {metrics.totalOutstandingCredit.toLocaleString("fr-DZ")} DA
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="py-2.5 px-4">Facture</th>
                  <th className="py-2.5 px-4">Date Vente</th>
                  <th className="py-2.5 px-4">Client</th>
                  <th className="py-2.5 px-4">Téléphone</th>
                  <th className="py-2.5 px-4 text-right">Total Facture (DA)</th>
                  <th className="py-2.5 px-4 text-right">Déjà Versé (DA)</th>
                  <th className="py-2.5 px-4 text-right text-rose-700">Reste Dû (DA)</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {creditSales.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-400">
                      Toutes les factures sont intégralement réglées. Aucune créance en attente.
                    </td>
                  </tr>
                ) : (
                  creditSales.map((sale) => {
                    const balance = Math.max(0, sale.totalAmount - sale.paidAmount);
                    return (
                      <tr key={sale.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {sale.reference}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {new Date(sale.saleDate).toLocaleDateString("fr-DZ")}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {sale.customer ? sale.customer.name : "Client Passager / Comptoir"}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {sale.customer?.phone || "—"}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium">
                          {sale.totalAmount.toLocaleString("fr-DZ")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-emerald-700">
                          {sale.paidAmount.toLocaleString("fr-DZ")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-rose-700">
                          {balance.toLocaleString("fr-DZ")} DA
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => openPaymentModal(sale)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                          >
                            Encaisser un versement
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
      )}

      {/* ── TAB 4: SUIVI DES LIVRAISONS ─────────────────────────────────────── */}
      {activeTab === "deliveries" && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Tableau de Bord des Livraisons de Mobilier
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Suivi logistique des expéditions et livraison aux domiciles des clients.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                  <th className="py-2.5 px-4">Réf Livraison</th>
                  <th className="py-2.5 px-4">Facture Liée</th>
                  <th className="py-2.5 px-4">Mode</th>
                  <th className="py-2.5 px-4">Destinataire</th>
                  <th className="py-2.5 px-4">Adresse &amp; Téléphone</th>
                  <th className="py-2.5 px-4">Date Prévue</th>
                  <th className="py-2.5 px-4 text-right">Frais (DA)</th>
                  <th className="py-2.5 px-4 text-center">Statut Actuel</th>
                  <th className="py-2.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {allDeliveries.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400">
                      Aucune livraison enregistrée.
                    </td>
                  </tr>
                ) : (
                  allDeliveries.map((del) => (
                    <tr key={del.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {del.reference}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {del.saleRef}
                      </td>
                      <td className="py-3 px-4">
                        {del.isPickup ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                            Retrait Magasin
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            À Domicile
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">
                        {del.customerName}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        <p>{del.isPickup ? "Retrait au comptoir magasin" : (del.address || "Adresse client")}</p>
                        {del.customerPhone && (
                          <p className="text-[11px] font-mono text-slate-400">{del.customerPhone}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {del.deliveryDate
                          ? new Date(del.deliveryDate).toLocaleDateString("fr-DZ")
                          : "Non planifiée"}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-medium">
                        {(del.fee || 0).toLocaleString("fr-DZ")} DA
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            del.status === "delivered"
                              ? "bg-emerald-100 text-emerald-800"
                              : del.status === "in_transit"
                              ? "bg-indigo-100 text-indigo-800"
                              : del.status === "ready"
                              ? "bg-blue-100 text-blue-800"
                              : del.status === "postponed"
                              ? "bg-orange-100 text-orange-800"
                              : del.status === "cancelled"
                              ? "bg-rose-100 text-rose-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {del.status === "delivered"
                            ? "Livrée"
                            : del.status === "in_transit"
                            ? "En cours"
                            : del.status === "ready"
                            ? "Prête à livrer"
                            : del.status === "postponed"
                            ? "Reportée"
                            : del.status === "cancelled"
                            ? "Annulée"
                            : "À préparer"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                        <button
                          type="button"
                          onClick={() =>
                            setPrintingDeliveryNote({
                              ...del,
                              sale: {
                                reference: del.saleRef,
                                saleDate: del.saleDate || new Date(),
                                customer: {
                                  name: del.customerName,
                                  phone: del.customerPhone,
                                  address: del.customerAddress,
                                },
                                items: del.items || [],
                              },
                            })
                          }
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                        >
                          <Printer className="h-3 w-3" />
                          <span>BL</span>
                        </button>
                        <select
                          value={del.status === "pending" ? "to_prepare" : del.status}
                          onChange={(e) => handleUpdateDeliveryStatus(del.id, e.target.value)}
                          className="text-xs bg-white border border-slate-300 rounded px-2 py-1 font-medium"
                        >
                          <option value="to_prepare">À préparer</option>
                          <option value="ready">Prête à livrer</option>
                          <option value="in_transit">En cours</option>
                          <option value="delivered">Livrée</option>
                          <option value="postponed">Reportée</option>
                          <option value="cancelled">Annulée</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MODAL: ENREGISTREMENT PAIEMENT / RÈGLEMENT ───────────────────────── */}
      {paymentModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                Enregistrer un Versement : Facture {paymentModalSale.reference}
              </h2>
              <button
                onClick={closePaymentModal}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="mt-4 space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Client :</span>
                  <span className="font-semibold text-slate-800">
                    {paymentModalSale.customer?.name || "Client Passager"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Facture :</span>
                  <span className="font-mono font-bold text-slate-900">
                    {paymentModalSale.totalAmount.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Déjà réglé :</span>
                  <span className="font-mono text-emerald-700 font-semibold">
                    {paymentModalSale.paidAmount.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="font-bold text-rose-700">Reste à payer :</span>
                  <span className="font-mono font-black text-rose-700">
                    {(paymentModalSale.totalAmount - paymentModalSale.paidAmount).toLocaleString("fr-DZ")} DA
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700 uppercase">
                    Montant de l&apos;encaissement (DA) <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const balance = Math.max(0, paymentModalSale.totalAmount - paymentModalSale.paidAmount);
                      setPaymentAmountInput(String(balance));
                      setPaymentInputError(null);
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                  >
                    Régler tout le solde ({(paymentModalSale.totalAmount - paymentModalSale.paidAmount).toLocaleString("fr-DZ")} DA)
                  </button>
                </div>
                <input
                  type="number"
                  name="amount"
                  required
                  min="1"
                  max={Math.max(0, paymentModalSale.totalAmount - paymentModalSale.paidAmount)}
                  step="1"
                  placeholder="Saisissez le montant en DA..."
                  value={paymentAmountInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPaymentAmountInput(val);
                    if (!val) {
                      setPaymentInputError(null);
                      return;
                    }
                    const num = parseFloat(val);
                    const remaining = Math.max(0, paymentModalSale.totalAmount - paymentModalSale.paidAmount);
                    if (isNaN(num) || num <= 0) {
                      setPaymentInputError("Le montant doit être un nombre strictement supérieur à 0 DA.");
                    } else if (num > remaining) {
                      setPaymentInputError(
                        `Le montant ne peut pas dépasser le solde restant dû (${remaining.toLocaleString("fr-DZ")} DA).`
                      );
                    } else {
                      setPaymentInputError(null);
                    }
                  }}
                  className={`w-full px-3 py-2 text-base font-mono font-bold text-emerald-700 border ${
                    paymentInputError ? "border-rose-400 focus:ring-rose-500" : "border-slate-300 focus:ring-emerald-500"
                  } rounded-lg focus:outline-hidden focus:ring-2`}
                />
                {paymentInputError && (
                  <p className="mt-1 text-xs font-semibold text-rose-600">{paymentInputError}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Mode de Règlement
                  </label>
                  <select
                    name="method"
                    defaultValue="cash"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="cash">Espèces</option>
                    <option value="cib">Carte CIB / Edahabia</option>
                    <option value="check">Chèque bancaire</option>
                    <option value="transfer">Virement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Date du Versement
                  </label>
                  <input
                    type="date"
                    name="paymentDate"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Observation / Référence (N° Chèque...)
                </label>
                <input
                  type="text"
                  name="notes"
                  placeholder="Ex : Règlement solde par chèque BNA..."
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closePaymentModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Validation..." : "Valider le Versement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: ANNULATION VENTE ─────────────────────────────────────────── */}
      {cancelModalSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center gap-3 text-rose-600 pb-3 border-b border-slate-200">
              <AlertCircle className="h-6 w-6 shrink-0" />
              <h2 className="text-base font-bold text-slate-900">
                Annulation de la Vente : {cancelModalSale.reference}
              </h2>
            </div>

            <p className="text-sm text-slate-600 mt-4 leading-relaxed">
              Vous êtes sur le point d&apos;annuler cette vente.
              {cancelModalSale.status === "confirmed" && (
                <span className="block mt-2 font-medium text-amber-800 bg-amber-50 p-2 rounded border border-amber-200 text-xs">
                  Les meubles prélevés seront automatiquement réintégrés dans leurs dépôts d&apos;origine
                  et des mouvements de stock compensatoires seront enregistrés.
                </span>
              )}
            </p>

            <div className="mt-4">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Motif obligatoire de l&apos;annulation <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={2}
                placeholder="Ex : Désistement client ou erreur de facturation..."
                required
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              ></textarea>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 mt-4">
              <button
                type="button"
                onClick={() => setCancelModalSale(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleCancelSale}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
              >
                {isPending ? "Annulation en cours..." : "Confirmer l'annulation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: IMPRESSION FACTURE A4 ────────────────────────────────────── */}
      {printingSale && (
        <PrintableInvoice
          sale={printingSale}
          settings={initialData.settings}
          onClose={() => setPrintingSale(null)}
        />
      )}

      {/* ── MODAL: IMPRESSION REÇU DE VERSEMENT ──────────────────────────────── */}
      {printingReceipt && (
        <PrintablePaymentReceipt
          payment={printingReceipt.payment}
          sale={printingReceipt.sale}
          settings={initialData.settings}
          onClose={() => setPrintingReceipt(null)}
        />
      )}

      {/* ── MODAL: IMPRESSION BON DE LIVRAISON (BL A4) ───────────────────────── */}
      {printingDeliveryNote && (
        <PrintableDeliveryNote
          delivery={printingDeliveryNote}
          settings={initialData.settings}
          onClose={() => setPrintingDeliveryNote(null)}
        />
      )}

      {/* ── MODAL: NOUVEAU CLIENT DEPUIS LA VENTE ────────────────────────────── */}
      <NewCustomerModal
        isOpen={isNewCustomerModalOpen}
        onClose={() => setIsNewCustomerModalOpen(false)}
        onSuccess={handleNewCustomerCreated}
      />
    </div>
  );
}
