"use client";

import React, { useState, useTransition, useMemo } from "react";
import {
  Package,
  Boxes,
  ArrowRightLeft,
  History,
  Tags,
  MapPin,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Pencil,
  Trash2,
  Power,
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Building2,
  AlertCircle,
  X,
} from "lucide-react";
import { formatCurrency, formatNumber, formatDateTime } from "@/lib/formatters";
import {
  createProductAction,
  updateProductAction,
  toggleProductStatusAction,
  deleteProductAction,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  createLocationAction,
  updateLocationAction,
  toggleLocationStatusAction,
  deleteLocationAction,
  recordInitialStockAction,
  recordStockReceiptAction,
  recordStockIssueAction,
  recordStockAdjustmentAction,
  recordStockTransferAction,
} from "./actions";

// ─── TYPES ───────────────────────────────────────────────────────────────────

type ProductWithDetails = {
  id: number;
  sku: string;
  name: string;
  model: string | null;
  color: string | null;
  description: string | null;
  category: string | null;
  categoryId: number | null;
  costPrice: number | null;
  sellingPrice: number | null;
  unitPrice: number | null;
  stock: number;
  minStock: number;
  unit: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  categoryRef: { id: number; name: string } | null;
  stocks: Array<{
    id: number;
    productId: number;
    locationId: number;
    quantity: number;
    location: { id: number; name: string; code: string; isActive: boolean };
  }>;
  _count: {
    movements: number;
    saleItems: number;
    purchaseItems: number;
  };
};

type CategoryItem = {
  id: number;
  name: string;
  description: string | null;
  _count: { products: number };
};

type LocationItem = {
  id: number;
  code: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isActive: boolean;
};

type MovementItem = {
  id: number;
  reference: string | null;
  type: string;
  quantity: number;
  unitCost: number | null;
  stockBefore: number | null;
  stockAfter: number | null;
  reason: string | null;
  notes: string | null;
  date: Date;
  product: {
    id: number;
    sku: string;
    name: string;
    model: string | null;
    color: string | null;
    isActive: boolean;
  };
  fromLocation: { id: number; name: string; code: string; isActive: boolean } | null;
  toLocation: { id: number; name: string; code: string; isActive: boolean } | null;
};

interface Props {
  initialProducts: ProductWithDetails[];
  initialCategories: CategoryItem[];
  initialLocations: LocationItem[];
  initialMovements: MovementItem[];
  initialTodayMovementsCount?: number;
}

export function ProductsModuleClient({
  initialProducts,
  initialCategories,
  initialLocations,
  initialMovements,
  initialTodayMovementsCount = 0,
}: Props) {
  const [activeTab, setActiveTab] = useState<
    "products" | "inventory" | "movements" | "categories" | "locations"
  >("products");
  const [isPending, startTransition] = useTransition();

  // Notification state
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const showNotice = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 7000);
  };

  // Search & Filter state for Products & Inventory
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedLocation, setSelectedLocation] = useState<string>("ALL");
  const [selectedStockStatus, setSelectedStockStatus] = useState<string>("ALL");
  const [selectedProductStatus, setSelectedProductStatus] = useState<string>("ALL");

  // Movement history filters
  const [movementSearch, setMovementSearch] = useState("");
  const [movementFilterType, setMovementFilterType] = useState<string>("ALL");
  const [movementFilterProduct, setMovementFilterProduct] = useState<string>("ALL");
  const [movementFilterLocation, setMovementFilterLocation] = useState<string>("ALL");

  // Modals state
  const [productModal, setProductModal] = useState<{
    isOpen: boolean;
    mode: "create" | "edit";
    product?: ProductWithDetails;
  }>({ isOpen: false, mode: "create" });

  const [detailsModal, setDetailsModal] = useState<{
    isOpen: boolean;
    product?: ProductWithDetails;
  }>({ isOpen: false });

  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    productId?: number;
    productName?: string;
  }>({ isOpen: false });

  // Dedicated Stock Modals state
  const [stockModal, setStockModal] = useState<{
    isOpen: boolean;
    type: "INITIAL" | "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "TRANSFER";
    productId?: number;
    locationId?: number;
    confirmStep?: boolean;
    pendingData?: FormData;
  }>({ isOpen: false, type: "INITIAL" });

  // Dynamic selection helpers for stock forms
  const [selectedStockCategory, setSelectedStockCategory] = useState<number | null>(null);
  const [stockArticleSearch, setStockArticleSearch] = useState<string>("");
  const [selectedStockProduct, setSelectedStockProduct] = useState<number | null>(null);
  const [selectedStockLocation, setSelectedStockLocation] = useState<number | null>(null);
  const [selectedFromLocation, setSelectedFromLocation] = useState<number | null>(null);
  const [selectedToLocation, setSelectedToLocation] = useState<number | null>(null);
  const [inputQuantity, setInputQuantity] = useState<number>(1);
  const [isAdjustmentSub, setIsAdjustmentSub] = useState<boolean>(false);

  // Active items for safe mutation selections
  const activeProducts = useMemo(
    () => initialProducts.filter((p) => p.isActive),
    [initialProducts]
  );
  const activeLocations = useMemo(
    () => initialLocations.filter((l) => l.isActive),
    [initialLocations]
  );

  // Articles filtered by selected category in stock modal
  const articlesForSelectedCategory = useMemo(() => {
    if (!selectedStockCategory) return [];

    const selectedCatObj = initialCategories.find((c) => c.id === selectedStockCategory);
    const selectedCatName = selectedCatObj?.name?.trim().toLowerCase();

    return activeProducts.filter((p) => {
      if (p.categoryId !== null && p.categoryId === selectedStockCategory) {
        return true;
      }
      if (p.categoryRef && p.categoryRef.id === selectedStockCategory) {
        return true;
      }
      if (selectedCatName && p.category && p.category.trim().toLowerCase() === selectedCatName) {
        return true;
      }
      return false;
    });
  }, [activeProducts, initialCategories, selectedStockCategory]);

  // Articles filtered by search within that category
  const filteredArticlesForSelectedCategory = useMemo(() => {
    if (!stockArticleSearch.trim()) return articlesForSelectedCategory;
    const q = stockArticleSearch.toLowerCase().trim();
    return articlesForSelectedCategory.filter((p) => {
      const matchSku = p.sku.toLowerCase().includes(q);
      const matchName = p.name.toLowerCase().includes(q);
      const matchModel = p.model ? p.model.toLowerCase().includes(q) : false;
      return matchSku || matchName || matchModel;
    });
  }, [articlesForSelectedCategory, stockArticleSearch]);

  const selectedProductDetails = useMemo(() => {
    if (!selectedStockProduct) return null;
    return activeProducts.find((p) => p.id === selectedStockProduct) || null;
  }, [activeProducts, selectedStockProduct]);

  // Category Modal state
  const [categoryModal, setCategoryModal] = useState<{
    isOpen: boolean;
    mode: "create" | "edit";
    category?: CategoryItem;
  }>({ isOpen: false, mode: "create" });

  // Location Modal state
  const [locationModal, setLocationModal] = useState<{
    isOpen: boolean;
    mode: "create" | "edit";
    location?: LocationItem;
  }>({ isOpen: false, mode: "create" });

  // ─── FILTERED PRODUCTS & INVENTORY ─────────────────────────────────────────

  const filteredProducts = useMemo(() => {
    return initialProducts.filter((p) => {
      const q = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.sku.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.model && p.model.toLowerCase().includes(q)) ||
        (p.color && p.color.toLowerCase().includes(q)) ||
        (p.categoryRef && p.categoryRef.name.toLowerCase().includes(q));

      const matchesCategory =
        selectedCategory === "ALL" ||
        (p.categoryId !== null && p.categoryId.toString() === selectedCategory);

      const matchesProductStatus =
        selectedProductStatus === "ALL" ||
        (selectedProductStatus === "ACTIVE" && p.isActive) ||
        (selectedProductStatus === "INACTIVE" && !p.isActive);

      // Total physical stock across all locations
      const totalStock =
        p.stocks && p.stocks.length > 0
          ? p.stocks.reduce((acc, s) => acc + (s.quantity || 0), 0)
          : (p.stock || 0);

      // Stock status filter:
      // ZERO-STOCK / RUPTURE must strictly identify products with zero total quantity across ALL locations.
      // An article with 0 in one location but positive stock elsewhere is NOT globally out of stock.
      let matchesStockStatus = true;
      if (selectedStockStatus === "IN_STOCK") {
        matchesStockStatus = totalStock > 0;
      } else if (selectedStockStatus === "OUT_OF_STOCK") {
        matchesStockStatus = totalStock === 0;
      }

      // Location filter:
      let matchesLocation = true;
      if (selectedLocation !== "ALL") {
        const locId = parseInt(selectedLocation, 10);
        const st = p.stocks.find((s) => s.locationId === locId);
        if (selectedStockStatus === "OUT_OF_STOCK") {
          matchesLocation = !!st || p.stocks.length === 0;
        } else {
          matchesLocation = !!st && st.quantity > 0;
        }
      }

      return (
        matchesSearch &&
        matchesCategory &&
        matchesProductStatus &&
        matchesStockStatus &&
        matchesLocation
      );
    });
  }, [
    initialProducts,
    searchTerm,
    selectedCategory,
    selectedProductStatus,
    selectedStockStatus,
    selectedLocation,
  ]);

  // ─── FILTERED MOVEMENTS ───────────────────────────────────────────────────

  const filteredMovements = useMemo(() => {
    return initialMovements.filter((m) => {
      const q = movementSearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (m.reference && m.reference.toLowerCase().includes(q)) ||
        (m.reason && m.reason.toLowerCase().includes(q)) ||
        (m.notes && m.notes.toLowerCase().includes(q)) ||
        m.product.name.toLowerCase().includes(q) ||
        m.product.sku.toLowerCase().includes(q);

      const matchesType =
        movementFilterType === "ALL" || m.type === movementFilterType;

      const matchesProduct =
        movementFilterProduct === "ALL" ||
        m.product.id.toString() === movementFilterProduct;

      let matchesLocation = true;
      if (movementFilterLocation !== "ALL") {
        const locId = parseInt(movementFilterLocation, 10);
        matchesLocation =
          m.fromLocation?.id === locId || m.toLocation?.id === locId;
      }

      return matchesSearch && matchesType && matchesProduct && matchesLocation;
    });
  }, [
    initialMovements,
    movementSearch,
    movementFilterType,
    movementFilterProduct,
    movementFilterLocation,
  ]);

  // KPIs
  const totalProductsCount = initialProducts.length;
  // Articles référencés : nombre d'articles distincts actifs
  const activeProductsCount = initialProducts.filter((p) => p.isActive).length;
  // Unités en stock : somme des quantités physiques de tous les dépôts pour les articles actifs
  const totalUnitsInStock = initialProducts
    .filter((p) => p.isActive)
    .reduce((sum, p) => sum + (p.stock || 0), 0);
  // Articles en rupture : nombre d'articles distincts actifs dont la quantité totale est nulle
  const outOfStockProductsCount = initialProducts.filter(
    (p) => p.isActive && p.stock === 0
  ).length;

  // Mouvements aujourd'hui : nombre de mouvements enregistrés aujourd'hui
  const todayMovementsCount = useMemo(() => {
    if (typeof initialTodayMovementsCount === "number") {
      return initialTodayMovementsCount;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return initialMovements.filter((m) => new Date(m.date) >= today).length;
  }, [initialTodayMovementsCount, initialMovements]);

  const closeStockModal = () => {
    setStockModal({ isOpen: false, type: "INITIAL" });
    setSelectedStockCategory(null);
    setSelectedStockProduct(null);
    setStockArticleSearch("");
  };

  // Helper to open a stock modal pre-populated
  const openStockModal = (
    type: "INITIAL" | "RECEIPT" | "ISSUE" | "ADJUSTMENT" | "TRANSFER",
    productId?: number,
    locationId?: number
  ) => {
    let initialCatId: number | null = null;
    let targetProduct: ProductWithDetails | undefined = undefined;

    if (productId) {
      targetProduct = activeProducts.find((p) => p.id === productId);
      if (targetProduct) {
        initialCatId =
          targetProduct.categoryId ||
          targetProduct.categoryRef?.id ||
          (targetProduct.category
            ? initialCategories.find(
                (c) => c.name.toLowerCase() === targetProduct?.category?.trim().toLowerCase()
              )?.id || null
            : null);
      }
    }

    const defaultLocation = locationId || activeLocations[0]?.id || undefined;

    setSelectedStockCategory(initialCatId);
    setSelectedStockProduct(targetProduct ? targetProduct.id : null);
    setStockArticleSearch("");
    setSelectedStockLocation(defaultLocation || null);
    setSelectedFromLocation(defaultLocation || activeLocations[0]?.id || null);
    setSelectedToLocation(activeLocations[1]?.id || activeLocations[0]?.id || null);
    setInputQuantity(1);
    setIsAdjustmentSub(false);

    setStockModal({
      isOpen: true,
      type,
      productId: targetProduct?.id,
      locationId: defaultLocation,
      confirmStep: false,
    });
  };

  // Helper to get available quantity for a product at a location
  const getProductStockAt = (
    prodId: number | null | undefined,
    locId: number | null | undefined
  ): number => {
    if (!prodId || !locId) return 0;
    const prod = initialProducts.find((p) => p.id === prodId);
    if (!prod) return 0;
    const st = prod.stocks.find((s) => s.locationId === locId);
    return st ? st.quantity : 0;
  };

  return (
    <div className="space-y-6">
      {/* ─── BANNER NOTIFICATION ─────────────────────────────────────────── */}
      {notification && (
        <div
          className={`flex items-start justify-between rounded-xl p-4 border transition-all shadow-xs ${
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center gap-3">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
            )}
            <p className="text-sm font-medium">{notification.message}</p>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── EN-TÊTE DU MODULE & ONGLETS ──────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
            Produits & Gestion des Stocks
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Catalogue mobilier, suivi multi-dépôts (Showroom & Garages), transferts atomiques et traçabilité comptable.
          </p>
        </div>

        {/* Boutons d'action rapides */}
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "products" && (
            <button
              onClick={() => setProductModal({ isOpen: true, mode: "create" })}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 transition-colors shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Nouveau meuble
            </button>
          )}

          {activeTab === "inventory" && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => openStockModal("INITIAL")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
              >
                <Plus className="h-3.5 w-3.5 text-purple-600" />
                Stock initial
              </button>
              <button
                onClick={() => openStockModal("RECEIPT")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 shadow-xs"
                title="Ajouter un produit au stock (Entrée / Réception)"
              >
                <ArrowDownRight className="h-3.5 w-3.5" />
                Ajouter un produit / Entrée
              </button>
              <button
                onClick={() => openStockModal("ISSUE")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500 shadow-xs"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
                Sortie de stock
              </button>
              <button
                onClick={() => openStockModal("TRANSFER")}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-500 shadow-xs"
              >
                <ArrowRightLeft className="h-3.5 w-3.5" />
                Transférer
              </button>
              <button
                onClick={() => openStockModal("ADJUSTMENT")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
              >
                <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                Ajustement
              </button>
            </div>
          )}

          {activeTab === "categories" && (
            <button
              onClick={() => setCategoryModal({ isOpen: true, mode: "create" })}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Nouvelle catégorie
            </button>
          )}

          {activeTab === "locations" && (
            <button
              onClick={() => setLocationModal({ isOpen: true, mode: "create" })}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Nouvel emplacement
            </button>
          )}
        </div>
      </div>

      {/* ─── CARTES DE SYNTHÈSE (KPIs) ────────────────────────────────────── */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* 1. Articles référencés */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Articles référencés
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {activeProductsCount}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {totalProductsCount - activeProductsCount > 0
              ? `${activeProductsCount} actif(s) sur ${totalProductsCount}`
              : "Tous les articles sont actifs"}
          </p>
        </div>

        {/* 2. Unités en stock */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Unités en stock
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Boxes className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatNumber(totalUnitsInStock)}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Tous dépôts confondus
          </p>
        </div>

        {/* 3. Articles en rupture */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Articles en rupture
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
              <Package className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {outOfStockProductsCount}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            0 unité sur l&apos;ensemble des dépôts
          </p>
        </div>

        {/* 4. Mouvements aujourd'hui */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Mouvements aujourd&apos;hui
            </span>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <History className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {todayMovementsCount}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Flux enregistrés ce jour
          </p>
        </div>
      </div>

      {/* ─── NAVIGATION PAR ONGLETS ───────────────────────────────────────── */}
      <div className="border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2 shadow-xs">
        <nav className="flex space-x-6 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("products")}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === "products"
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <Package className="h-4 w-4" />
            Catalogue Meubles
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {initialProducts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("inventory")}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === "inventory"
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <Boxes className="h-4 w-4" />
            État des Stocks (Grille Dépôts)
          </button>

          <button
            onClick={() => setActiveTab("movements")}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === "movements"
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <History className="h-4 w-4" />
            Historique & Traçabilité
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {initialMovements.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("categories")}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === "categories"
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <Tags className="h-4 w-4" />
            Catégories
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {initialCategories.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("locations")}
            className={`flex items-center gap-2 border-b-2 py-3 px-1 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === "locations"
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
            }`}
          >
            <Building2 className="h-4 w-4" />
            Emplacements & Garages
            <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {initialLocations.length}
            </span>
          </button>
        </nav>
      </div>

      {/* ─── ONGLET 1 : CATALOGUE PRODUITS ───────────────────────────────── */}
      {activeTab === "products" && (
        <div className="space-y-4">
          {/* Barre de recherche et filtres */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par référence, nom, modèle, couleur..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-lg border border-slate-300 pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-slate-400" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
                >
                  <option value="ALL">Toutes les catégories</option>
                  {initialCategories.map((c) => (
                    <option key={c.id} value={c.id.toString()}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <select
                value={selectedStockStatus}
                onChange={(e) => setSelectedStockStatus(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">Tous les stocks</option>
                <option value="IN_STOCK">En stock disponible</option>
                <option value="OUT_OF_STOCK">Rupture de stock</option>
              </select>

              <select
                value={selectedProductStatus}
                onChange={(e) => setSelectedProductStatus(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">Tous les statuts</option>
                <option value="ACTIVE">Actifs uniquement</option>
                <option value="INACTIVE">Inactifs uniquement</option>
              </select>
            </div>
          </div>

          {/* Tableau des produits */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Réf. (SKU)</th>
                    <th className="px-4 py-3">Produit</th>
                    <th className="px-4 py-3">Modèle / Couleur</th>
                    <th className="px-4 py-3">Catégorie</th>
                    <th className="px-4 py-3 text-right">Prix d&apos;achat</th>
                    <th className="px-4 py-3 text-right">Prix de vente</th>
                    <th className="px-4 py-3 text-center">Stock Total</th>
                    <th className="px-4 py-3 text-center">Statut</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <Package className="mx-auto h-8 w-8 opacity-30 mb-2" />
                        <p className="font-medium text-slate-600">Aucun produit correspondant</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Vérifiez vos filtres ou ajoutez votre premier meuble.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const isOutOfStock = p.stock === 0;

                      return (
                        <tr
                          key={p.id}
                          className={`hover:bg-slate-50/70 transition-colors ${
                            !p.isActive ? "opacity-60 bg-slate-50/40" : ""
                          }`}
                        >
                          <td className="px-4 py-3.5 font-mono text-xs font-bold text-slate-900">
                            {p.sku}
                          </td>
                          <td className="px-4 py-3.5">
                            <p className="font-medium text-slate-900">{p.name}</p>
                            {p.description && (
                              <p className="text-xs text-slate-500 truncate max-w-xs">
                                {p.description}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-600">
                            {p.model || "—"}
                            {p.color && (
                              <span className="text-slate-400 block text-[11px]">
                                {p.color}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-600">
                            {p.categoryRef ? (
                              <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                                {p.categoryRef.name}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-right font-medium text-slate-600 tabular-nums">
                            {p.costPrice !== null ? formatCurrency(p.costPrice) : "—"}
                          </td>
                          <td className="px-4 py-3.5 text-right font-semibold text-slate-900 tabular-nums">
                            {formatCurrency(p.sellingPrice)}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium tabular-nums ${
                                isOutOfStock
                                  ? "bg-slate-100 text-slate-700"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              }`}
                            >
                              {p.stock} {p.unit}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                p.isActive
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}
                            >
                              {p.isActive ? "Actif" : "Inactif"}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => setDetailsModal({ isOpen: true, product: p })}
                                title="Voir les détails"
                                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                              >
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() =>
                                  setProductModal({ isOpen: true, mode: "edit", product: p })
                                }
                                title="Modifier"
                                className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  startTransition(async () => {
                                    const res = await toggleProductStatusAction(p.id);
                                    if (res.success) {
                                      showNotice("success", res.message || "Statut mis à jour.");
                                    } else {
                                      showNotice("error", res.error || "Erreur.");
                                    }
                                  });
                                }}
                                title={p.isActive ? "Désactiver" : "Activer"}
                                className={`rounded p-1.5 transition-colors ${
                                  p.isActive
                                    ? "text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                                    : "text-emerald-500 hover:bg-emerald-50 hover:text-emerald-700"
                                }`}
                              >
                                <Power className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() =>
                                  setDeleteConfirm({
                                    isOpen: true,
                                    productId: p.id,
                                    productName: p.name,
                                  })
                                }
                                title="Supprimer"
                                className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
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

      {/* ─── ONGLET 2 : ÉTAT DES STOCKS PAR DÉPÔT ─────────────────────────── */}
      {activeTab === "inventory" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Matrice des stocks multi-dépôts
                </h3>
                <p className="text-xs text-slate-500">
                  Visualisez les quantités physiques disponibles dans chaque garage et au showroom.
                </p>
              </div>

              <div className="text-xs text-slate-500 font-medium">
                <span className="font-bold text-slate-800">{filteredProducts.length}</span> meuble(s) affiché(s)
              </div>
            </div>

            {/* Barre de filtres complets */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100">
              {/* 1. Article reference or designation */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Réf. SKU ou désignation..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 pl-8 pr-7 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:border-amber-500 focus:outline-none"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* 2. Famille / Catégorie */}
              <div className="flex items-center gap-1.5">
                <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
                >
                  <option value="ALL">Toutes les familles</option>
                  {initialCategories.map((c) => (
                    <option key={c.id} value={c.id.toString()}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Emplacement */}
              <div className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
                >
                  <option value="ALL">Tous les emplacements</option>
                  {initialLocations.map((loc) => (
                    <option key={loc.id} value={loc.id.toString()}>
                      {loc.name} {!loc.isActive ? "(inactif)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Rupture de stock */}
              <div className="flex items-center gap-2">
                <select
                  value={selectedStockStatus}
                  onChange={(e) => setSelectedStockStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
                >
                  <option value="ALL">Tous les stocks</option>
                  <option value="IN_STOCK">En stock disponible</option>
                  <option value="OUT_OF_STOCK">Rupture de stock (0 unité)</option>
                </select>

                {(searchTerm ||
                  selectedCategory !== "ALL" ||
                  selectedLocation !== "ALL" ||
                  selectedStockStatus !== "ALL") && (
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedCategory("ALL");
                      setSelectedLocation("ALL");
                      setSelectedStockStatus("ALL");
                    }}
                    title="Réinitialiser tous les filtres"
                    className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    Effacer
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Réf.</th>
                    <th className="px-4 py-3">Produit</th>
                    <th className="px-4 py-3">Modèle / Couleur</th>
                    {initialLocations.map((loc) => (
                      <th key={loc.id} className="px-3 py-3 text-center">
                        <span
                          className={`block truncate max-w-[120px] ${
                            !loc.isActive ? "text-slate-400 line-through" : ""
                          }`}
                          title={loc.name}
                        >
                          {loc.name}
                        </span>
                        {loc.isDefault && (
                          <span className="text-[10px] text-amber-600 block font-normal">
                            (Showroom)
                          </span>
                        )}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-center font-bold text-slate-900 bg-slate-100/50">
                      Stock Total
                    </th>
                    <th className="px-4 py-3 text-center">État du stock</th>
                    <th className="px-4 py-3 text-right">Actions rapides</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5 + initialLocations.length}
                        className="py-12 text-center text-slate-400"
                      >
                        <Boxes className="mx-auto h-8 w-8 opacity-30 mb-2" />
                        <p className="font-medium text-slate-600">Aucun meuble trouvé</p>
                        <p className="text-xs text-slate-400">
                          Ajustez vos filtres ou ajoutez vos premiers meubles.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      const isOutOfStock = p.stock === 0;

                      const stockMap: Record<number, number> = {};
                      p.stocks.forEach((s) => {
                        stockMap[s.locationId] = s.quantity;
                      });

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs font-bold text-slate-900">
                            {p.sku}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {p.name}
                            {!p.isActive && (
                              <span className="ml-2 inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-normal text-slate-500">
                                Inactif
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">
                            {p.model || "—"} {p.color ? `(${p.color})` : ""}
                          </td>

                          {/* Quantités par emplacement */}
                          {initialLocations.map((loc) => {
                            const qty = stockMap[loc.id] ?? 0;
                            return (
                              <td
                                key={loc.id}
                                className={`px-3 py-3 text-center font-mono tabular-nums text-sm ${
                                  qty > 0
                                    ? "font-semibold text-slate-900"
                                    : "text-slate-300"
                                }`}
                              >
                                {qty}
                              </td>
                            );
                          })}

                          <td className="px-4 py-3 text-center font-bold font-mono tabular-nums text-slate-900 bg-slate-50/50">
                            {p.stock}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isOutOfStock ? (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                                Rupture
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                                Disponible
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {p.isActive ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => openStockModal("TRANSFER", p.id)}
                                  title="Transférer ce meuble vers un autre dépôt"
                                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                                >
                                  <ArrowRightLeft className="h-3 w-3" />
                                  Transférer
                                </button>
                                <button
                                  onClick={() => openStockModal("RECEIPT", p.id)}
                                  title="Réceptionner des unités"
                                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                                >
                                  <ArrowDownRight className="h-3 w-3" />
                                  +
                                </button>
                                <button
                                  onClick={() => openStockModal("ISSUE", p.id)}
                                  title="Sortir des unités"
                                  className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-rose-50 hover:text-rose-700 transition-colors"
                                >
                                  <ArrowUpRight className="h-3 w-3" />
                                  -
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">Inactif</span>
                            )}
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

      {/* ─── ONGLET 3 : HISTORIQUE DES MOUVEMENTS ─────────────────────────── */}
      {activeTab === "movements" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par référence, motif, produit..."
                value={movementSearch}
                onChange={(e) => setMovementSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-300 pl-9 pr-4 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={movementFilterType}
                onChange={(e) => setMovementFilterType(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">Tous les types</option>
                <option value="INITIAL">Stock initial</option>
                <option value="RECEIPT">Entrée / Réception</option>
                <option value="ISSUE">Sortie de stock</option>
                <option value="TRANSFER">Transfert inter-dépôts</option>
                <option value="ADJUSTMENT">Ajustement d&apos;inventaire</option>
              </select>

              <select
                value={movementFilterProduct}
                onChange={(e) => setMovementFilterProduct(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">Tous les meubles</option>
                {initialProducts.map((p) => (
                  <option key={p.id} value={p.id.toString()}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>

              <select
                value={movementFilterLocation}
                onChange={(e) => setMovementFilterLocation(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 focus:border-amber-500 focus:outline-none"
              >
                <option value="ALL">Tous les dépôts</option>
                {initialLocations.map((loc) => (
                  <option key={loc.id} value={loc.id.toString()}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Date & Heure</th>
                    <th className="px-4 py-3">Réf. Mouvement</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Meuble concerné</th>
                    <th className="px-4 py-3 text-center">Quantité</th>
                    <th className="px-4 py-3">Emplacement(s)</th>
                    <th className="px-4 py-3 text-center">Stock Avant $\rightarrow$ Après</th>
                    <th className="px-4 py-3">Motif & Justification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredMovements.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        <History className="mx-auto h-8 w-8 opacity-30 mb-2" />
                        <p className="font-medium text-slate-600">Aucun mouvement trouvé</p>
                        <p className="text-xs text-slate-400">
                          Chaque entrée, sortie, transfert ou ajustement est tracé ici.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredMovements.map((m) => {
                      let badge = {
                        label: m.type,
                        bg: "bg-slate-100 text-slate-700",
                      };
                      if (m.type === "INITIAL") {
                        badge = {
                          label: "Stock initial",
                          bg: "bg-purple-100 text-purple-700",
                        };
                      } else if (m.type === "RECEIPT") {
                        badge = {
                          label: "Entrée / Réception",
                          bg: "bg-emerald-100 text-emerald-700",
                        };
                      } else if (m.type === "ISSUE") {
                        badge = {
                          label: "Sortie de stock",
                          bg: "bg-rose-100 text-rose-700",
                        };
                      } else if (m.type === "TRANSFER") {
                        badge = {
                          label: "Transfert inter-dépôts",
                          bg: "bg-blue-100 text-blue-700",
                        };
                      } else if (m.type === "ADJUSTMENT") {
                        badge = {
                          label: "Ajustement",
                          bg: "bg-amber-100 text-amber-800",
                        };
                      }

                      return (
                        <tr key={m.id} className="hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                            {formatDateTime(m.date)}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">
                            {m.reference || "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.bg}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-semibold text-slate-900 block">
                              {m.product.name}
                            </span>
                            <span className="font-mono text-xs text-slate-400">
                              {m.product.sku}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center font-mono font-bold text-slate-900">
                            {m.type === "ISSUE" ? `-${m.quantity}` : `+${m.quantity}`}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            {m.type === "TRANSFER" ? (
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-slate-800">
                                  {m.fromLocation?.name || "—"}
                                </span>
                                <ArrowRightLeft className="h-3 w-3 text-slate-400" />
                                <span className="font-medium text-slate-800">
                                  {m.toLocation?.name || "—"}
                                </span>
                              </div>
                            ) : m.toLocation ? (
                              <span>Vers : <strong>{m.toLocation.name}</strong></span>
                            ) : m.fromLocation ? (
                              <span>Depuis : <strong>{m.fromLocation.name}</strong></span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-center text-xs font-mono tabular-nums text-slate-600">
                            {m.stockBefore !== null && m.stockAfter !== null ? (
                              <span>
                                {m.stockBefore} $\rightarrow$ <strong>{m.stockAfter}</strong>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-600">
                            <span className="font-medium text-slate-800 block">
                              {m.reason || "Non spécifié"}
                            </span>
                            {m.notes && m.notes !== m.reason && (
                              <span className="text-[11px] text-slate-400 block truncate max-w-xs">
                                {m.notes}
                              </span>
                            )}
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

      {/* ─── ONGLET 4 : CATÉGORIES ────────────────────────────────────────── */}
      {activeTab === "categories" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Catégories de meubles
              </h3>
              <p className="text-xs text-slate-500">
                Structurez votre catalogue (Salons, Chambres, Meubles TV, Salles à manger...).
              </p>
            </div>
            <button
              onClick={() => setCategoryModal({ isOpen: true, mode: "create" })}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Ajouter une catégorie
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Nom</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-center">Meubles associés</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {initialCategories.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-400">
                      <Tags className="mx-auto h-8 w-8 opacity-30 mb-2" />
                      <p className="font-medium text-slate-600">Aucune catégorie</p>
                    </td>
                  </tr>
                ) : (
                  initialCategories.map((cat) => (
                    <tr key={cat.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-4 py-3.5 font-semibold text-slate-900">
                        {cat.name}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-slate-500">
                        {cat.description || "—"}
                      </td>
                      <td className="px-4 py-3.5 text-center">
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {cat._count.products} meuble(s)
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() =>
                              setCategoryModal({ isOpen: true, mode: "edit", category: cat })
                            }
                            title="Modifier"
                            className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (
                                !confirm(
                                  `Êtes-vous sûr de vouloir supprimer la catégorie "${cat.name}" ?`
                                )
                              ) {
                                return;
                              }
                              startTransition(async () => {
                                const res = await deleteCategoryAction(cat.id);
                                if (res.success) {
                                  showNotice("success", res.message || "Catégorie supprimée.");
                                } else {
                                  showNotice("error", res.error || "Erreur.");
                                }
                              });
                            }}
                            title="Supprimer"
                            className="rounded p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
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
      )}

      {/* ─── ONGLET 5 : EMPLACEMENTS & GARAGES ────────────────────────────── */}
      {activeTab === "locations" && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Emplacements de stockage (Showroom & Garages)
              </h3>
              <p className="text-xs text-slate-500">
                Les 4 emplacements officiels (Showroom, Garage Chaaban, Garage Cheikh, 3ème Garage) et vos dépôts additionnels.
              </p>
            </div>
            <button
              onClick={() => setLocationModal({ isOpen: true, mode: "create" })}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              Nouvel emplacement
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {initialLocations.map((loc) => (
              <div
                key={loc.id}
                className={`rounded-xl border p-5 flex flex-col justify-between shadow-xs transition-all bg-white ${
                  loc.isActive ? "border-slate-200" : "border-slate-200 opacity-60 bg-slate-50/50"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-amber-600 uppercase bg-amber-50 px-2 py-0.5 rounded">
                      {loc.code}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {loc.isDefault && (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-semibold px-2 py-0.5">
                          Par défaut
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center rounded-full text-[10px] font-medium px-2 py-0.5 ${
                          loc.isActive
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-slate-100 text-slate-500 border border-slate-200"
                        }`}
                      >
                        {loc.isActive ? "Actif" : "Inactif"}
                      </span>
                    </div>
                  </div>
                  <h4 className="mt-3 text-base font-bold text-slate-900">{loc.name}</h4>
                  <p className="mt-1 text-xs text-slate-500">
                    {loc.address || "Aucune note d'adresse"}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => {
                      startTransition(async () => {
                        const res = await toggleLocationStatusAction(loc.id);
                        if (res.success) {
                          showNotice("success", res.message || "Statut modifié.");
                        } else {
                          showNotice("error", res.error || "Erreur.");
                        }
                      });
                    }}
                    title={loc.isActive ? "Désactiver cet emplacement" : "Activer"}
                    className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1"
                  >
                    <Power className="h-3.5 w-3.5" />
                    {loc.isActive ? "Désactiver" : "Activer"}
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        setLocationModal({ isOpen: true, mode: "edit", location: loc })
                      }
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Modifier"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {!loc.isDefault && (
                      <button
                        onClick={() => {
                          if (
                            !confirm(
                              `Êtes-vous sûr de vouloir supprimer l'emplacement "${loc.name}" ? S'il contient du stock ou un historique, désactivez-le plutôt.`
                            )
                          ) {
                            return;
                          }
                          startTransition(async () => {
                            const res = await deleteLocationAction(loc.id);
                            if (res.success) {
                              showNotice("success", res.message || "Emplacement supprimé.");
                            } else {
                              showNotice("error", res.error || "Impossible de supprimer.");
                            }
                          });
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Supprimer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── MODAL : NOUVEAU / MODIFIER MEUBLE ─────────────────────────────── */}
      {productModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {productModal.mode === "create"
                  ? "Créer une fiche meuble"
                  : `Modifier : ${productModal.product?.name}`}
              </h3>
              <button
                onClick={() => setProductModal({ isOpen: false, mode: "create" })}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                startTransition(async () => {
                  const res =
                    productModal.mode === "create"
                      ? await createProductAction(formData)
                      : await updateProductAction(formData);

                  if (res.success) {
                    showNotice("success", res.message || "Produit enregistré.");
                    setProductModal({ isOpen: false, mode: "create" });
                  } else {
                    showNotice("error", res.error || "Une erreur est survenue.");
                  }
                });
              }}
              className="mt-4 space-y-4"
            >
              {productModal.mode === "edit" && (
                <input
                  type="hidden"
                  name="id"
                  value={productModal.product?.id.toString()}
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Référence unique (SKU) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="sku"
                    required
                    placeholder="Ex: CH-SALON-01"
                    defaultValue={productModal.product?.sku || ""}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-amber-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    Identifiant unique strict. Espace et casse nettoyés automatiquement.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Désignation du meuble <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    required
                    placeholder="Ex: Salon Chesterfield Velours"
                    defaultValue={productModal.product?.name || ""}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Catégorie
                  </label>
                  <select
                    name="categoryId"
                    defaultValue={productModal.product?.categoryId?.toString() || ""}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">-- Sans catégorie --</option>
                    {initialCategories.map((c) => (
                      <option key={c.id} value={c.id.toString()}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Modèle
                  </label>
                  <input
                    type="text"
                    name="model"
                    placeholder="Ex: 7 Places Prestige"
                    defaultValue={productModal.product?.model || ""}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Couleur / Teinte
                  </label>
                  <input
                    type="text"
                    name="color"
                    placeholder="Ex: Marron Cognac / Bois Hêtre"
                    defaultValue={productModal.product?.color || ""}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Coût d&apos;acquisition (DA)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="costPrice"
                    placeholder="0.00"
                    defaultValue={productModal.product?.costPrice ?? ""}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Prix de vente (DA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    name="sellingPrice"
                    required
                    placeholder="0.00"
                    defaultValue={productModal.product?.sellingPrice ?? 0}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold tabular-nums focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Stock minimal de sécurité
                  </label>
                  <input
                    type="number"
                    min="0"
                    name="minStock"
                    defaultValue={productModal.product?.minStock ?? 0}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">
                  Description / Caractéristiques
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Matière, dimensions, essence de bois, détails des finitions..."
                  defaultValue={productModal.product?.description || ""}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              {productModal.mode === "edit" && (
                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    name="isActive"
                    value="true"
                    defaultChecked={productModal.product?.isActive}
                    className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor="isActive" className="text-sm font-medium text-slate-800">
                    Meuble actif (sélectionnable dans les opérations de stock et ventes)
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setProductModal({ isOpen: false, mode: "create" })}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isPending ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL : DÉTAILS D'UN MEUBLE ───────────────────────────────────── */}
      {detailsModal.isOpen && detailsModal.product && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="font-mono text-xs font-bold text-amber-600 uppercase bg-amber-50 px-2 py-0.5 rounded">
                  {detailsModal.product.sku}
                </span>
                <h3 className="mt-1 text-xl font-bold text-slate-900">
                  {detailsModal.product.name}
                </h3>
              </div>
              <button
                onClick={() => setDetailsModal({ isOpen: false })}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-xs text-slate-500 uppercase block font-semibold">
                    Catégorie
                  </span>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {detailsModal.product.categoryRef?.name || "Non classé"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-xs text-slate-500 uppercase block font-semibold">
                    Modèle / Couleur
                  </span>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {detailsModal.product.model || "—"}{" "}
                    {detailsModal.product.color ? `(${detailsModal.product.color})` : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-xs text-slate-500 uppercase block font-semibold">
                    Prix d&apos;achat
                  </span>
                  <p className="font-semibold text-slate-800 mt-0.5 tabular-nums">
                    {detailsModal.product.costPrice !== null
                      ? formatCurrency(detailsModal.product.costPrice)
                      : "—"}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-xs text-slate-500 uppercase block font-semibold">
                    Prix de vente
                  </span>
                  <p className="font-bold text-amber-600 mt-0.5 tabular-nums">
                    {formatCurrency(detailsModal.product.sellingPrice)}
                  </p>
                </div>
                <div className="bg-slate-50 p-3 rounded-lg">
                  <span className="text-xs text-slate-500 uppercase block font-semibold">
                    Marge unitaire
                  </span>
                  <p className="font-semibold text-emerald-700 mt-0.5 tabular-nums">
                    {detailsModal.product.costPrice !== null && detailsModal.product.sellingPrice !== null
                      ? formatCurrency(
                          detailsModal.product.sellingPrice - detailsModal.product.costPrice
                        )
                      : "—"}
                  </p>
                </div>
              </div>

              {detailsModal.product.description && (
                <div className="bg-slate-50 p-3 rounded-lg text-sm">
                  <span className="text-xs text-slate-500 uppercase block font-semibold">
                    Description & Caractéristiques
                  </span>
                  <p className="text-slate-700 mt-1 whitespace-pre-line text-xs">
                    {detailsModal.product.description}
                  </p>
                </div>
              )}

              {/* Répartition des stocks */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  Quantités actuelles par emplacement
                </h4>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
                  {initialLocations.map((loc) => {
                    const st = detailsModal.product?.stocks.find((s) => s.locationId === loc.id);
                    const qty = st ? st.quantity : 0;
                    return (
                      <div
                        key={loc.id}
                        className="flex items-center justify-between px-3 py-2 text-xs"
                      >
                        <span className="font-medium text-slate-700">
                          {loc.name} {!loc.isActive ? "(inactif)" : ""}
                        </span>
                        <span
                          className={`font-mono font-bold ${
                            qty > 0 ? "text-slate-900" : "text-slate-400"
                          }`}
                        >
                          {qty} {detailsModal.product?.unit}
                        </span>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between px-3 py-2 bg-slate-50 text-xs font-bold">
                    <span>Stock global magasin</span>
                    <span className="font-mono text-amber-700">
                      {detailsModal.product.stock} {detailsModal.product.unit}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end border-t border-slate-200 pt-3">
              <button
                onClick={() => setDetailsModal({ isOpen: false })}
                className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL : CONFIRMATION SUPPRESSION ─────────────────────────────── */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">
                Confirmer la suppression
              </h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">
              Êtes-vous sûr de vouloir supprimer définitivement le meuble{" "}
              <strong>&quot;{deleteConfirm.productName}&quot;</strong> ?
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Note : S&apos;il existe des mouvements historiques ou du stock, la suppression sera bloquée pour garantir la traçabilité comptable et il vous sera conseillé de le désactiver.
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm({ isOpen: false })}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  if (!deleteConfirm.productId) return;
                  startTransition(async () => {
                    const res = await deleteProductAction(deleteConfirm.productId!);
                    if (res.success) {
                      showNotice("success", res.message || "Produit supprimé.");
                    } else {
                      showNotice("error", res.error || "Impossible de supprimer.");
                    }
                    setDeleteConfirm({ isOpen: false });
                  });
                }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {isPending ? "Suppression..." : "Supprimer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL UNIFIÉ & SÉCURISÉ DES OPÉRATIONS DE STOCK ──────────────── */}
      {stockModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                {stockModal.type === "INITIAL" && <Plus className="h-5 w-5 text-purple-600" />}
                {stockModal.type === "RECEIPT" && (
                  <ArrowDownRight className="h-5 w-5 text-emerald-600" />
                )}
                {stockModal.type === "ISSUE" && <ArrowUpRight className="h-5 w-5 text-rose-600" />}
                {stockModal.type === "TRANSFER" && (
                  <ArrowRightLeft className="h-5 w-5 text-blue-600" />
                )}
                {stockModal.type === "ADJUSTMENT" && (
                  <RefreshCw className="h-5 w-5 text-amber-600" />
                )}
                <h3 className="text-lg font-bold text-slate-900">
                  {stockModal.type === "INITIAL" && "Enregistrer le stock initial"}
                  {stockModal.type === "RECEIPT" && "Ajouter un produit / Entrée de stock"}
                  {stockModal.type === "ISSUE" && "Sortie de stock documentée"}
                  {stockModal.type === "TRANSFER" && "Transfert de stock entre dépôts"}
                  {stockModal.type === "ADJUSTMENT" && "Ajustement d'inventaire physique"}
                </h3>
              </div>
              <button
                onClick={closeStockModal}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!selectedStockProduct) {
                  showNotice("error", "Veuillez sélectionner une famille puis un article.");
                  return;
                }
                const formData = new FormData(e.currentTarget);

                startTransition(async () => {
                  let res;
                  if (stockModal.type === "INITIAL") {
                    res = await recordInitialStockAction(formData);
                  } else if (stockModal.type === "RECEIPT") {
                    res = await recordStockReceiptAction(formData);
                  } else if (stockModal.type === "ISSUE") {
                    res = await recordStockIssueAction(formData);
                  } else if (stockModal.type === "TRANSFER") {
                    res = await recordStockTransferAction(formData);
                  } else {
                    res = await recordStockAdjustmentAction(formData);
                  }

                  if (res.success) {
                    showNotice("success", res.message || "Opération validée.");
                    closeStockModal();
                  } else {
                    showNotice("error", res.error || "Une erreur est survenue.");
                  }
                });
              }}
              className="mt-4 space-y-4"
            >
              {/* 1. Famille / Catégorie */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">
                  Famille / Catégorie <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={selectedStockCategory !== null ? selectedStockCategory.toString() : ""}
                  onChange={(e) => {
                    const catId = e.target.value ? parseInt(e.target.value, 10) : null;
                    setSelectedStockCategory(catId);
                    setSelectedStockProduct(null);
                    setStockArticleSearch("");
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none bg-white"
                >
                  <option value="">-- Choisir une famille / catégorie --</option>
                  {initialCategories.map((c) => (
                    <option key={c.id} value={c.id.toString()}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Article (dépendant de la famille sélectionnée) */}
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Article <span className="text-rose-500">*</span>
                  </label>
                  {selectedStockCategory && articlesForSelectedCategory.length > 0 && (
                    <span className="text-[11px] text-slate-500 font-medium">
                      {filteredArticlesForSelectedCategory.length} article(s) trouvé(s)
                    </span>
                  )}
                </div>

                {/* Champ de recherche / filtrage par référence ou désignation */}
                {selectedStockCategory && articlesForSelectedCategory.length > 0 && (
                  <div className="relative mt-1 mb-1.5">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={stockArticleSearch}
                      onChange={(e) => setStockArticleSearch(e.target.value)}
                      placeholder="Filtrer par référence ou désignation (ex: F008 ou Capila)..."
                      className="w-full rounded-lg border border-slate-200 pl-8 pr-7 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-amber-500 focus:outline-none bg-slate-50/70 focus:bg-white transition-colors"
                    />
                    {stockArticleSearch && (
                      <button
                        type="button"
                        onClick={() => setStockArticleSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        title="Effacer le filtre"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                )}

                <select
                  name="productId"
                  required
                  disabled={!selectedStockCategory || articlesForSelectedCategory.length === 0}
                  value={selectedStockProduct || ""}
                  onChange={(e) => {
                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                    setSelectedStockProduct(val);
                  }}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-500 focus:outline-none ${
                    !selectedStockCategory || articlesForSelectedCategory.length === 0
                      ? "border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed border-dashed"
                      : "border-slate-300 bg-white text-slate-900"
                  }`}
                >
                  {!selectedStockCategory ? (
                    <option value="">-- Veuillez d&apos;abord sélectionner une famille --</option>
                  ) : articlesForSelectedCategory.length === 0 ? (
                    <option value="">-- Aucun article dans cette famille --</option>
                  ) : filteredArticlesForSelectedCategory.length === 0 ? (
                    <option value="">-- Aucun article ne correspond à votre recherche --</option>
                  ) : (
                    <>
                      <option value="">
                        -- Choisir un article ({filteredArticlesForSelectedCategory.length}) --
                      </option>
                      {filteredArticlesForSelectedCategory.map((p) => {
                        const capitalizedName = p.name ? p.name.charAt(0).toUpperCase() + p.name.slice(1) : "";
                        const designation =
                          p.model && p.model.toLowerCase() !== p.name.toLowerCase()
                            ? `${capitalizedName} (${p.model})`
                            : capitalizedName;
                        const label = `${p.sku} — ${designation}`;
                        return (
                          <option key={p.id} value={p.id}>
                            {label}
                          </option>
                        );
                      })}
                    </>
                  )}
                </select>

                {/* Message clair si la famille ne contient aucun article */}
                {selectedStockCategory && articlesForSelectedCategory.length === 0 && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                    <span>Aucun article dans cette famille</span>
                  </p>
                )}

                {/* Information sur le stock actuel de l'article sélectionné */}
                {selectedProductDetails && (
                  <p className="mt-1 text-[11px] text-slate-500">
                    Article sélectionné :{" "}
                    <strong className="text-slate-800 font-mono font-bold">
                      {selectedProductDetails.sku}
                    </strong>{" "}
                    — {selectedProductDetails.name} (Stock global magasin :{" "}
                    <span className="font-semibold text-slate-900 font-mono">
                      {selectedProductDetails.stock}
                    </span>{" "}
                    unités)
                  </p>
                )}
              </div>

              {/* Emplacements : Si TRANSFERT -> Source & Destination */}
              {stockModal.type === "TRANSFER" ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-700">
                      Départ (Source) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="fromLocationId"
                      required
                      value={selectedFromLocation || ""}
                      onChange={(e) => setSelectedFromLocation(parseInt(e.target.value, 10))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                    >
                      <option value="">-- Source --</option>
                      {activeLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Dispo source :{" "}
                      <strong className="text-slate-800 font-mono">
                        {getProductStockAt(selectedStockProduct, selectedFromLocation)}
                      </strong>
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase text-slate-700">
                      Arrivée (Destination) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      name="toLocationId"
                      required
                      value={selectedToLocation || ""}
                      onChange={(e) => setSelectedToLocation(parseInt(e.target.value, 10))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                    >
                      <option value="">-- Destination --</option>
                      {activeLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Actuel dest :{" "}
                      <strong className="text-slate-800 font-mono">
                        {getProductStockAt(selectedStockProduct, selectedToLocation)}
                      </strong>
                    </p>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Emplacement concerné <span className="text-rose-500">*</span>
                  </label>
                  <select
                    name="locationId"
                    required
                    value={selectedStockLocation || ""}
                    onChange={(e) => setSelectedStockLocation(parseInt(e.target.value, 10))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                  >
                    <option value="">-- Choisir un emplacement actif --</option>
                    {activeLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.isDefault ? "(Showroom)" : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Stock actuel à cet emplacement :{" "}
                    <strong className="text-slate-800 font-mono">
                      {getProductStockAt(selectedStockProduct, selectedStockLocation)}
                    </strong>
                  </p>
                </div>
              )}

              {/* Si ajustement : option sens (+ ou -) */}
              {stockModal.type === "ADJUSTMENT" && (
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Type d&apos;ajustement
                  </label>
                  <div className="mt-1 flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="isSubtraction"
                        value="false"
                        checked={!isAdjustmentSub}
                        onChange={() => setIsAdjustmentSub(false)}
                        className="text-amber-600 focus:ring-amber-500"
                      />
                      Ajouter au stock (+)
                    </label>
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="radio"
                        name="isSubtraction"
                        value="true"
                        checked={isAdjustmentSub}
                        onChange={() => setIsAdjustmentSub(true)}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      Déduire du stock (-)
                    </label>
                  </div>
                </div>
              )}

              {/* Quantité d'unités (nombre entier strictly positive) */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">
                  Quantité d&apos;unités (entier positif) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  name="quantity"
                  required
                  min="1"
                  step="1"
                  value={inputQuantity}
                  onChange={(e) => setInputQuantity(parseInt(e.target.value, 10) || 1)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Motif obligatoire */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">
                  Motif / Justification <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="reason"
                  required
                  placeholder={
                    stockModal.type === "TRANSFER"
                      ? "Ex: Réassort showroom pour exposition"
                      : stockModal.type === "RECEIPT"
                      ? "Ex: Réception livraison arrivage atelier"
                      : stockModal.type === "ISSUE"
                      ? "Ex: Sortie modèle abîmé pour réparation"
                      : stockModal.type === "INITIAL"
                      ? "Ex: Inventaire initial d'ouverture magasin"
                      : "Ex: Écart constaté suite à inventaire physique"
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Référence document optionnelle */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">
                  Réf. Document / Bon (optionnel)
                </label>
                <input
                  type="text"
                  name="reference"
                  placeholder="Ex: BL-2026-089 ou LA-55"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono focus:border-amber-500 focus:outline-none"
                />
              </div>

              {/* Aperçu du stock avant / après */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                <span className="font-semibold text-slate-700 block">
                  Aperçu comptable de l&apos;opération :
                </span>
                {stockModal.type === "TRANSFER" ? (
                  <p className="text-slate-600">
                    Source passera de{" "}
                    <strong>{getProductStockAt(selectedStockProduct, selectedFromLocation)}</strong> à{" "}
                    <strong className="text-blue-700">
                      {getProductStockAt(selectedStockProduct, selectedFromLocation) - inputQuantity}
                    </strong>{" "}
                    | Destination passera de{" "}
                    <strong>{getProductStockAt(selectedStockProduct, selectedToLocation)}</strong> à{" "}
                    <strong className="text-blue-700">
                      {getProductStockAt(selectedStockProduct, selectedToLocation) + inputQuantity}
                    </strong>
                    . Total global inchangé.
                  </p>
                ) : stockModal.type === "INITIAL" ? (
                  <p className="text-slate-600">
                    Stock d&apos;ouverture sera fixé à :{" "}
                    <strong className="text-purple-700">{inputQuantity}</strong> unité(s).
                  </p>
                ) : stockModal.type === "RECEIPT" ? (
                  <p className="text-slate-600">
                    Stock passera de{" "}
                    <strong>{getProductStockAt(selectedStockProduct, selectedStockLocation)}</strong> à{" "}
                    <strong className="text-emerald-700">
                      {getProductStockAt(selectedStockProduct, selectedStockLocation) + inputQuantity}
                    </strong>
                    .
                  </p>
                ) : stockModal.type === "ISSUE" ? (
                  <p className="text-slate-600">
                    Stock passera de{" "}
                    <strong>{getProductStockAt(selectedStockProduct, selectedStockLocation)}</strong> à{" "}
                    <strong className="text-rose-700">
                      {getProductStockAt(selectedStockProduct, selectedStockLocation) - inputQuantity}
                    </strong>
                    .
                  </p>
                ) : (
                  <p className="text-slate-600">
                    Stock passera de{" "}
                    <strong>{getProductStockAt(selectedStockProduct, selectedStockLocation)}</strong> à{" "}
                    <strong className="text-amber-800">
                      {isAdjustmentSub
                        ? getProductStockAt(selectedStockProduct, selectedStockLocation) -
                          inputQuantity
                        : getProductStockAt(selectedStockProduct, selectedStockLocation) +
                          inputQuantity}
                    </strong>
                    .
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={closeStockModal}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-sm"
                >
                  {isPending ? "Traitement..." : "Confirmer et enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL : CATÉGORIE (CRÉER / MODIFIER) ─────────────────────────── */}
      {categoryModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {categoryModal.mode === "create"
                  ? "Ajouter une catégorie"
                  : `Modifier : ${categoryModal.category?.name}`}
              </h3>
              <button
                onClick={() => setCategoryModal({ isOpen: false, mode: "create" })}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                startTransition(async () => {
                  const res =
                    categoryModal.mode === "create"
                      ? await createCategoryAction(formData)
                      : await updateCategoryAction(formData);

                  if (res.success) {
                    showNotice("success", res.message || "Catégorie enregistrée.");
                    setCategoryModal({ isOpen: false, mode: "create" });
                  } else {
                    showNotice("error", res.error || "Une erreur est survenue.");
                  }
                });
              }}
              className="mt-4 space-y-4"
            >
              {categoryModal.mode === "edit" && (
                <input
                  type="hidden"
                  name="id"
                  value={categoryModal.category?.id.toString()}
                />
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">
                  Nom de la catégorie <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Ex: Salons & Canapés"
                  defaultValue={categoryModal.category?.name || ""}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Notes descriptives..."
                  defaultValue={categoryModal.category?.description || ""}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setCategoryModal({ isOpen: false, mode: "create" })}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
                >
                  {isPending ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL : EMPLACEMENT (CRÉER / MODIFIER) ───────────────────────── */}
      {locationModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-lg font-bold text-slate-900">
                {locationModal.mode === "create"
                  ? "Ajouter un emplacement de stockage"
                  : `Modifier : ${locationModal.location?.name}`}
              </h3>
              <button
                onClick={() => setLocationModal({ isOpen: false, mode: "create" })}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                startTransition(async () => {
                  const res =
                    locationModal.mode === "create"
                      ? await createLocationAction(formData)
                      : await updateLocationAction(formData);

                  if (res.success) {
                    showNotice("success", res.message || "Emplacement enregistré.");
                    setLocationModal({ isOpen: false, mode: "create" });
                  } else {
                    showNotice("error", res.error || "Une erreur est survenue.");
                  }
                });
              }}
              className="mt-4 space-y-4"
            >
              {locationModal.mode === "edit" ? (
                <input
                  type="hidden"
                  name="id"
                  value={locationModal.location?.id.toString()}
                />
              ) : (
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700">
                    Code identifiant (unique) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="code"
                    required
                    placeholder="Ex: GARAGE_NOUVEAU"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">
                  Nom de l&apos;emplacement <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="Ex: Garage Chaaban / Showroom"
                  defaultValue={locationModal.location?.name || ""}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700">
                  Adresse ou Description
                </label>
                <input
                  type="text"
                  name="address"
                  placeholder="Ex: Hangar B, Zone Industrielle..."
                  defaultValue={locationModal.location?.address || ""}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isDefaultLoc"
                  name="isDefault"
                  value="true"
                  defaultChecked={locationModal.location?.isDefault}
                  className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                />
                <label htmlFor="isDefaultLoc" className="text-xs font-medium text-slate-700">
                  Définir comme emplacement par défaut (ex: Showroom)
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setLocationModal({ isOpen: false, mode: "create" })}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-400 disabled:opacity-50"
                >
                  {isPending ? "Enregistrement..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
