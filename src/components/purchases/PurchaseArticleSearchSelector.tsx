"use client";

import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, Check, X, Package, Tag } from "lucide-react";
import type { ProductItem } from "@/app/purchases/PurchasesClient";

interface PurchaseArticleSearchSelectorProps {
  products: ProductItem[];
  selectedProductId: number;
  onSelectProduct: (product: ProductItem) => void;
  disabled?: boolean;
}

export function PurchaseArticleSearchSelector({
  products,
  selectedProductId,
  onSelectProduct,
  disabled = false,
}: PurchaseArticleSearchSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const isMounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  // Position coordinates for portal dropdown
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  }>({
    top: 0,
    left: 0,
    width: 440,
    maxHeight: 360,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Selected product
  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  // Filtered products list
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => {
      const sku = (p.sku || "").toLowerCase();
      const name = (p.name || "").toLowerCase();
      const model = (p.model || "").toLowerCase();
      const color = (p.color || "").toLowerCase();

      return (
        sku.includes(q) ||
        name.includes(q) ||
        model.includes(q) ||
        color.includes(q)
      );
    });
  }, [products, searchQuery]);

  // Capped products list for rendering performance (max 50)
  const displayedProducts = useMemo(
    () => filteredProducts.slice(0, 50),
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
    const desiredHeight = 360;

    let top = rect.bottom + 4;
    let maxHeight = Math.min(desiredHeight, spaceBelow - 16);

    // If not enough room below but more room above, flip upward
    if (spaceBelow < 220 && spaceAbove > spaceBelow) {
      maxHeight = Math.min(desiredHeight, spaceAbove - 16);
      top = rect.top - maxHeight - 4;
    }

    // Horizontal placement and width
    const minWidth = Math.max(380, rect.width);
    let left = rect.left;
    if (left + minWidth > viewportWidth - 12) {
      left = Math.max(12, viewportWidth - minWidth - 12);
    }

    setCoords({
      top: Math.max(8, top),
      left: Math.max(8, left),
      width: minWidth,
      maxHeight: Math.max(180, maxHeight),
    });
  }, []);

  // Recalculate on open and scroll/resize
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleScroll = (e: Event) => {
        // Only update if scrolling outside the dropdown itself
        if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
          return;
        }
        updatePosition();
      };
      window.addEventListener("scroll", handleScroll, true);
      window.addEventListener("resize", updatePosition);
      return () => {
        window.removeEventListener("scroll", handleScroll, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isOpen, updatePosition]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Keep highlighted item in view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const itemEl = listRef.current.children[highlightedIndex] as HTMLElement;
      if (itemEl) {
        itemEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, isOpen]);

  const handleSelect = (product: ProductItem) => {
    onSelectProduct(product);
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex(0);
        setSearchQuery("");
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < displayedProducts.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : displayedProducts.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (displayedProducts[highlightedIndex]) {
        handleSelect(displayedProducts[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    }
  };

  return (
    <div className="relative w-full">
      {/* Trigger Button */}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setHighlightedIndex(0);
            setSearchQuery("");
            setIsOpen((prev) => !prev);
          }
        }}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between text-left text-xs bg-white border rounded-lg px-2.5 py-1.5 transition-all shadow-sm ${
          disabled
            ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
            : isOpen
            ? "border-indigo-500 ring-2 ring-indigo-500/20 text-slate-800"
            : "border-slate-300 hover:border-slate-400 text-slate-800"
        }`}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <div className="flex-1 min-w-0 pr-2">
          {selectedProduct ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-slate-900 truncate">
                {selectedProduct.name}
              </span>
              <span className="text-[11px] font-mono text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 shrink-0">
                {selectedProduct.sku}
              </span>
              <span className="text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded shrink-0">
                Stock: {selectedProduct.stock}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 italic">
              Sélectionner ou rechercher un article...
            </span>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-indigo-600" : ""
          }`}
        />
      </button>

      {/* Dropdown Portal */}
      {isMounted &&
        isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              maxHeight: `${coords.maxHeight}px`,
              zIndex: 99999,
            }}
            className="flex flex-col bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100"
            onKeyDown={handleKeyDown}
          >
            {/* Search Bar */}
            <div className="p-2 border-b border-slate-100 bg-slate-50/80">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Rechercher par nom, réf SKU, modèle..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setHighlightedIndex(0);
                  }}
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-md text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Products List */}
            <div
              ref={listRef}
              className="flex-1 overflow-y-auto divide-y divide-slate-100 text-xs"
              style={{ maxHeight: `${coords.maxHeight - 75}px` }}
              role="listbox"
            >
              {displayedProducts.length === 0 ? (
                <div className="p-4 text-center text-slate-400 text-xs">
                  <Package className="h-6 w-6 mx-auto mb-1 text-slate-300" />
                  Aucun article trouvé pour &quot;{searchQuery}&quot;
                </div>
              ) : (
                displayedProducts.map((p, idx) => {
                  const isSelected = p.id === selectedProductId;
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelect(p)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      role="option"
                      aria-selected={isSelected}
                      className={`w-full text-left p-2.5 flex items-center justify-between gap-2 transition-colors ${
                        isHighlighted
                          ? "bg-indigo-50/70"
                          : isSelected
                          ? "bg-indigo-50/30"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-900 truncate">
                            {p.name}
                          </span>
                          <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-1 py-0.5 rounded">
                            {p.sku}
                          </span>
                          {p.model && (
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1 py-0.5 rounded flex items-center gap-0.5">
                              <Tag className="h-2.5 w-2.5 text-slate-400" />
                              {p.model}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-3">
                          <span>
                            Stock actuel:{" "}
                            <strong
                              className={
                                p.stock > 0 ? "text-emerald-600" : "text-amber-600"
                              }
                            >
                              {p.stock} pcs
                            </strong>
                          </span>
                          <span>
                            Coût d&apos;achat:{" "}
                            <strong className="text-slate-700">
                              {(p.costPrice || 0).toLocaleString("fr-DZ")} DA
                            </strong>
                          </span>
                        </div>
                      </div>

                      {isSelected && (
                        <Check className="h-4 w-4 text-indigo-600 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer with count */}
            <div className="px-3 py-1.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span>
                {filteredProducts.length} article
                {filteredProducts.length > 1 ? "s" : ""}
                {filteredProducts.length > displayedProducts.length &&
                  ` (50 affichés)`}
              </span>
              <span className="text-[10px] text-slate-400">
                ↑↓ Naviguer • Entrée Sélectionner
              </span>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
