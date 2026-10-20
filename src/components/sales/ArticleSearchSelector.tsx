"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Check, X, Package, Tag } from "lucide-react";
import type { ProductItem } from "@/app/sales/SalesClient";

interface ArticleSearchSelectorProps {
  products: ProductItem[];
  selectedProductId: number;
  selectedLocationId: number;
  onSelectProduct: (product: ProductItem) => void;
  disabled?: boolean;
}

export function ArticleSearchSelector({
  products,
  selectedProductId,
  selectedLocationId,
  onSelectProduct,
  disabled = false,
}: ArticleSearchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Position coordinates for portal dropdown
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({
    top: 0,
    left: 0,
    width: 460,
    maxHeight: 380,
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Selected product
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  // Distinct categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const cat = p.categoryRef?.name || p.category;
      if (cat && cat.trim()) {
        set.add(cat.trim());
      }
    }
    return Array.from(set).sort();
  }, [products]);

  // Stock calculator for a product at selected location
  const getProductStock = (product: ProductItem) => {
    if (!product.stocks || product.stocks.length === 0) return 0;
    const match = product.stocks.find((s) => s.locationId === selectedLocationId);
    return match ? match.quantity : 0;
  };

  // Filtered products list
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return products.filter((p) => {
      // Category filter
      if (selectedCategory !== "ALL") {
        const cat = (p.categoryRef?.name || p.category || "").trim().toLowerCase();
        if (cat !== selectedCategory.toLowerCase()) {
          return false;
        }
      }

      // Search query filter: reference (sku), designation (name), model, color, category
      if (!q) return true;
      const sku = (p.sku || "").toLowerCase();
      const name = (p.name || "").toLowerCase();
      const model = (p.model || "").toLowerCase();
      const color = (p.color || "").toLowerCase();
      const cat = (p.categoryRef?.name || p.category || "").toLowerCase();

      return (
        sku.includes(q) ||
        name.includes(q) ||
        model.includes(q) ||
        color.includes(q) ||
        cat.includes(q)
      );
    });
  }, [products, searchQuery, selectedCategory]);

  // Capped products list for rendering performance (max 60)
  const displayedProducts = useMemo(
    () => filteredProducts.slice(0, 60),
    [filteredProducts]
  );

  // Dynamic positioning for portal dropdown (avoids table clipping, container overflow)
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const estimatedHeight = 360;

    const openUp = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

    // Width: responsive, between 420px and max viewport width - 20px, or match button width if larger
    const width = Math.min(520, Math.max(rect.width, 420), viewportWidth - 20);

    // Left: align with trigger left, but clamp inside viewport
    let left = rect.left;
    if (left + width > viewportWidth - 10) {
      left = Math.max(10, viewportWidth - width - 10);
    }
    if (left < 10) left = 10;

    // Top & Max Height
    let top = rect.bottom + 4;
    let maxHeight = Math.min(spaceBelow - 16, 420);
    if (openUp) {
      maxHeight = Math.min(spaceAbove - 16, 420);
      top = Math.max(10, rect.top - 4 - Math.min(estimatedHeight, maxHeight));
    }

    setCoords({
      top,
      left,
      width,
      maxHeight: Math.max(maxHeight, 220),
    });
  }, []);

  // Update position on open and listen to scroll / resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);

    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Reset highlight when list changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchQuery, selectedCategory]);

  // Auto-focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }, 50);
    }
  }, [isOpen]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current && displayedProducts[highlightedIndex]) {
      const activeEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, displayedProducts]);

  // Click outside to close (checking both container and portal dropdown)
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < displayedProducts.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (displayedProducts[highlightedIndex]) {
        handleSelect(displayedProducts[highlightedIndex]);
      }
    }
  };

  const handleSelect = (product: ProductItem) => {
    onSelectProduct(product);
    setIsOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="relative w-full" ref={containerRef} onKeyDown={handleKeyDown}>
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className="w-full text-left px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg hover:border-amber-400 focus:outline-hidden focus:ring-2 focus:ring-amber-500 transition-colors flex items-center justify-between gap-2 shadow-2xs disabled:bg-slate-50 disabled:text-slate-400 disabled:cursor-not-allowed cursor-pointer"
        title="Cliquer pour rechercher et sélectionner un article"
      >
        <div className="flex-1 min-w-0">
          {selectedProduct ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1 py-0.5 rounded text-[11px] shrink-0">
                {selectedProduct.sku}
              </span>
              <span className="font-medium text-slate-800 truncate">
                {selectedProduct.name}
              </span>
              {selectedProduct.model && (
                <span className="text-slate-400 text-[11px] shrink-0">
                  ({selectedProduct.model})
                </span>
              )}
              <span className="text-slate-400 text-[11px] shrink-0">•</span>
              <span className="font-mono text-emerald-700 font-semibold shrink-0">
                {selectedProduct.sellingPrice !== null && selectedProduct.sellingPrice !== undefined
                  ? `${selectedProduct.sellingPrice.toLocaleString("fr-DZ")} DA`
                  : "Prix non fixé"}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 italic">Sélectionner un article...</span>
          )}
        </div>
        <ChevronDown className={`h-3.5 w-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {/* Popover Dropdown rendered in Portal directly into document.body */}
      {isOpen &&
        mounted &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 9999,
            }}
            onKeyDown={handleKeyDown}
            className="bg-white rounded-xl shadow-2xl border border-slate-200 p-2.5 flex flex-col animate-in fade-in zoom-in-95 duration-100"
          >
            {/* Search bar & Category filter */}
            <div className="space-y-2 pb-2 border-b border-slate-100 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Rechercher par référence, désignation, modèle..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-amber-500 font-medium"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Categories filter pills */}
              {categories.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto py-0.5 text-[11px] no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setSelectedCategory("ALL")}
                    className={`px-2 py-0.5 rounded-full font-semibold shrink-0 transition-colors cursor-pointer ${
                      selectedCategory === "ALL"
                        ? "bg-amber-500 text-slate-900 shadow-2xs"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Toutes ({products.length})
                  </button>
                  {categories.map((cat) => {
                    const count = products.filter(
                      (p) => (p.categoryRef?.name || p.category) === cat
                    ).length;
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-2 py-0.5 rounded-full font-medium shrink-0 transition-colors cursor-pointer ${
                          selectedCategory === cat
                            ? "bg-amber-500 text-slate-900 shadow-2xs font-semibold"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {cat} ({count})
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Results List */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto mt-1 divide-y divide-slate-100 min-h-24"
            >
              {displayedProducts.length === 0 ? (
                <div className="py-6 text-center text-slate-400 text-xs">
                  <Package className="mx-auto h-6 w-6 opacity-30 mb-1" />
                  Aucun article correspondant trouvé.
                </div>
              ) : (
                displayedProducts.map((p, idx) => {
                  const stockAtLoc = getProductStock(p);
                  const isSelected = p.id === selectedProductId;
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelect(p)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`p-2 flex items-center justify-between gap-2 text-xs rounded-lg cursor-pointer transition-colors ${
                        isHighlighted
                          ? "bg-amber-50/80 text-slate-900"
                          : "hover:bg-slate-50 text-slate-800"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-[11px] bg-slate-100 text-slate-800 px-1 py-0.5 rounded">
                            {p.sku}
                          </span>
                          <span className="font-semibold text-slate-900 truncate">
                            {p.name}
                          </span>
                          {p.model && (
                            <span className="text-slate-500 text-[11px] truncate">
                              • {p.model}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                          {(p.categoryRef?.name || p.category) && (
                            <span className="inline-flex items-center gap-0.5 text-slate-600 bg-slate-100/80 px-1.5 py-0.2 rounded text-[10px]">
                              <Tag className="h-2.5 w-2.5" />
                              {p.categoryRef?.name || p.category}
                            </span>
                          )}
                          <span
                            className={`font-semibold ${
                              stockAtLoc <= 0
                                ? "text-rose-600"
                                : stockAtLoc < 3
                                ? "text-amber-600"
                                : "text-emerald-700"
                            }`}
                          >
                            Dispo dépôt : {stockAtLoc} unité(s)
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0 flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-slate-900">
                          {p.sellingPrice !== null && p.sellingPrice !== undefined
                            ? `${p.sellingPrice.toLocaleString("fr-DZ")} DA`
                            : "Prix non fixé"}
                        </span>
                        {isSelected && (
                          <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer with total count info */}
            <div className="pt-2 mt-1 border-t border-slate-100 text-[10px] text-slate-400 flex items-center justify-between shrink-0">
              <span>
                {filteredProducts.length} article(s) trouvé(s)
                {filteredProducts.length > 60 && " (affichage des 60 premiers)"}
              </span>
              <span className="italic">Flèches pour naviguer • Entrée pour valider • Échap pour fermer</span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
