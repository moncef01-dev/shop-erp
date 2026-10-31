"use client";

import React, { useState, useMemo, useTransition, useRef, useEffect } from "react";
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
  PiggyBank,
  History,
  ArrowRight,
  RotateCcw,
  ShoppingCart,
  Pencil,
  Coins,
} from "lucide-react";
import {
  createSaleAction,
  updateSaleAction,
  confirmDraftSaleAction,
  cancelSaleAction,
  recordSalePaymentAction,
} from "./actions";
import {
  createCustomerAdvanceAction,
  allocateCustomerAdvanceAction,
  refundCustomerAdvanceAction,
} from "./advances-actions";
import { roundMoney } from "@/lib/formatters";
import { useRouter } from "next/navigation";
import {
  PrintableInvoice,
  PrintablePaymentReceipt,
  type PrintableSale,
  type PrintablePayment,
} from "@/components/sales/PrintableInvoice";
import type { ShopSettingsData } from "@/app/settings/actions";
import { NewCustomerModal, type CreatedCustomerData } from "@/components/customers/NewCustomerModal";
import { ArticleSearchSelector } from "@/components/sales/ArticleSearchSelector";
import { AskPrintConfirmModal } from "@/components/common/AskPrintConfirmModal";

export interface ProductStockInfo {
  id: number;
  locationId: number;
  quantity: number;
}

export interface ProductItem {
  id: number;
  sku: string;
  name: string;
  category?: string | null;
  categoryRef?: { id: number; name: string } | null;
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
  phone2?: string | null;
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
}

export interface CustomerAdvanceItem {
  id: number;
  reference: string;
  customerId: number;
  customer?: { id: number; code?: string | null; name: string; phone?: string | null; phone2?: string | null };
  amount: number;
  allocatedAmount: number;
  refundedAmount: number;
  remainingAmount: number;
  method: string;
  paymentDate: string | Date;
  productInterest?: string | null;
  notes?: string | null;
  status: string;
  sessionId?: number | null;
  allocations?: {
    id: number;
    saleId: number;
    amount: number;
    allocatedAt: string | Date;
    notes?: string | null;
    sale?: { id: number; reference: string; totalAmount: number; paidAmount: number; status: string };
  }[];
}

interface SalesClientProps {
  initialData: {
    sales: PrintableSale[];
    customers: CustomerOption[];
    products: ProductItem[];
    locations: LocationOption[];
    settings?: ShopSettingsData | null;
    activeCashSession?: { id: number; reference: string } | null;
    metrics: SalesMetrics;
    advances?: CustomerAdvanceItem[];
    savingsAccounts?: Array<{ customerId: number; balance: number }>;
  };
}

export function SalesClient({ initialData }: SalesClientProps) {
  const sales = initialData.sales;
  const metrics = initialData.metrics;
  const activeCashSession = initialData.activeCashSession;
  const savingsAccounts = initialData.savingsAccounts || [];
  const [paymentModalMethod, setPaymentModalMethod] = useState<string>("cash");
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

  // New Client Modal state & target
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState(false);
  const [customerModalTarget, setCustomerModalTarget] = useState<"sale" | "advance">("sale");

  // Active Main Tab
  const [activeTab, setActiveTab] = useState<"list" | "create" | "credits" | "advances">("list");

  // Advances state (Feature C)
  const [advances, setAdvances] = useState<CustomerAdvanceItem[]>(initialData.advances || []);
  const [advanceCustomerId, setAdvanceCustomerId] = useState<string>("");
  const [advanceAmount, setAdvanceAmount] = useState<string>("");
  const [advanceMethod, setAdvanceMethod] = useState<string>("cash");
  const [advanceDate, setAdvanceDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [advanceProductInterest, setAdvanceProductInterest] = useState<string>("");
  const [advanceNotes, setAdvanceNotes] = useState<string>("");
  const [advanceSearchQuery, setAdvanceSearchQuery] = useState("");
  const [advanceStatusFilter, setAdvanceStatusFilter] = useState<string>("all");

  const [allocatingAdvance, setAllocatingAdvance] = useState<CustomerAdvanceItem | null>(null);
  const [allocationSaleId, setAllocationSaleId] = useState<string>("");
  const [allocationAmount, setAllocationAmount] = useState<string>("");
  const [allocationNotes, setAllocationNotes] = useState<string>("");

  const [refundingAdvance, setRefundingAdvance] = useState<CustomerAdvanceItem | null>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [refundReason, setRefundReason] = useState<string>("");

  // Payment History modal (Feature H)
  const [viewingPaymentHistorySale, setViewingPaymentHistorySale] = useState<PrintableSale | null>(null);

  // Search & Filters on list
  const [searchQuery, setSearchQuery] = useState("");
  const [saleStatusFilter, setSaleStatusFilter] = useState<string>("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("all");

  // Notifications & loading
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Modals
  const router = useRouter();
  const [shouldAutoPrint, setShouldAutoPrint] = useState(false);
  const [printPrompt, setPrintPrompt] = useState<{
    isOpen: boolean;
    documentTypeLabel?: string;
    documentReference?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  const [printingSale, setPrintingSale] = useState<PrintableSale | null>(null);
  const [paymentModalSale, setPaymentModalSale] = useState<PrintableSale | null>(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState<string>("");
  const [paymentInputError, setPaymentInputError] = useState<string | null>(null);
  const [printingReceipt, setPrintingReceipt] = useState<{ payment: PrintablePayment; sale: PrintableSale } | null>(null);
  const [cancelModalSale, setCancelModalSale] = useState<PrintableSale | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [editingSale, setEditingSale] = useState<PrintableSale | null>(null);

  // Standardized Escape key close (Feature F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewingPaymentHistorySale) setViewingPaymentHistorySale(null);
        else if (editingSale) setEditingSale(null);
        else if (allocatingAdvance) setAllocatingAdvance(null);
        else if (refundingAdvance) setRefundingAdvance(null);
        else if (paymentModalSale) closePaymentModal();
        else if (cancelModalSale) setCancelModalSale(null);
        else if (printingSale) setPrintingSale(null);
        else if (printingReceipt) setPrintingReceipt(null);
        else if (isNewCustomerModalOpen) setIsNewCustomerModalOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    viewingPaymentHistorySale,
    editingSale,
    allocatingAdvance,
    refundingAdvance,
    paymentModalSale,
    cancelModalSale,
    printingSale,
    printingReceipt,
    isNewCustomerModalOpen,
  ]);

  const openPaymentModal = (sale: PrintableSale) => {
    setPaymentModalSale(sale);
    setPaymentModalMethod("cash");
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

  // ─── ÉDITION / RÉOUVERTURE DE FACTURE ─────────────────────────────────────
  const [editCustomerId, setEditCustomerId] = useState<string>("walkin");
  const [editSaleDate, setEditSaleDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [editNotes, setEditNotes] = useState<string>("");
  const [editReason, setEditReason] = useState<string>("");
  const [editDeliveryFee, setEditDeliveryFee] = useState<string>("0");
  const [editIncludeDeliveryFee, setEditIncludeDeliveryFee] = useState<boolean>(false);
  const [editGlobalDiscount, setEditGlobalDiscount] = useState<string>("0");
  const [editLines, setEditLines] = useState<FormLine[]>([]);
  const [editPaidAmountInput, setEditPaidAmountInput] = useState<string>("0");
  const [editAdditionalPaymentMethod, setEditAdditionalPaymentMethod] = useState<"cash" | "cib" | "check" | "transfer">("cash");
  const [editAdditionalPaymentNotes, setEditAdditionalPaymentNotes] = useState<string>("");

  const openEditModal = (sale: PrintableSale) => {
    setEditingSale(sale);
    setEditCustomerId(sale.customer?.id ? String(sale.customer.id) : "walkin");
    setEditSaleDate(
      sale.saleDate
        ? new Date(sale.saleDate).toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10)
    );
    setEditNotes(sale.notes || "");
    setEditReason("");
    setEditDeliveryFee(String(sale.deliveryFee || 0));
    setEditIncludeDeliveryFee(Boolean(sale.includeDeliveryFee));
    setEditGlobalDiscount(String(sale.discount || 0));

    const lines: FormLine[] =
      sale.items && sale.items.length > 0
        ? sale.items.map((it, idx) => {
            const prodId = ((it as any).productId || (it as any).product?.id || products.find((p) => p.sku === it.product?.sku)?.id || 0) as number;
            const locId = ((it as any).locationId || (it as any).location?.id || defaultLocation) as number;
            const itemColor = ((it as any).color || (it as any).product?.color || "") as string;
            return {
              id: `edit-line-${idx + 1}-${Date.now()}`,
              productId: prodId,
              locationId: locId,
              color: itemColor,
              quantity: String(it.quantity),
              unitPrice: String(it.unitPrice),
              discount: String(it.discount || 0),
            };
          })
        : [
            {
              id: `edit-line-1-${Date.now()}`,
              productId: products[0]?.id || 0,
              locationId: defaultLocation,
              color: products[0]?.color || "",
              quantity: "1",
              unitPrice: String(products[0]?.sellingPrice ?? 0),
              discount: "0",
            },
          ];
    setEditLines(lines);
    setEditPaidAmountInput(String(sale.paidAmount || 0));
    setEditAdditionalPaymentMethod("cash");
    setEditAdditionalPaymentNotes("");
  };

  const closeEditModal = () => {
    setEditingSale(null);
  };

  const editSubtotal = useMemo(() => {
    return roundMoney(
      editLines.reduce((sum, line) => {
        const q = Math.max(0, parseInt(line.quantity, 10) || 0);
        const p = Math.max(0, parseFloat(line.unitPrice) || 0);
        const d = Math.max(0, parseFloat(line.discount) || 0);
        const lineTotal = Math.max(0, q * p - d);
        return sum + lineTotal;
      }, 0)
    );
  }, [editLines]);

  const editParsedDeliveryFee = useMemo(() => {
    const val = parseFloat(editDeliveryFee);
    return isNaN(val) || val < 0 ? 0 : roundMoney(val);
  }, [editDeliveryFee]);

  const editEffectiveDeliveryFee = useMemo(() => {
    return editIncludeDeliveryFee ? editParsedDeliveryFee : 0;
  }, [editIncludeDeliveryFee, editParsedDeliveryFee]);

  const editEffectiveGlobalDiscount = useMemo(() => {
    return roundMoney(Math.max(0, parseFloat(editGlobalDiscount) || 0));
  }, [editGlobalDiscount]);

  const editGrandTotal = useMemo(() => {
    return roundMoney(
      Math.max(0, editSubtotal + editEffectiveDeliveryFee - editEffectiveGlobalDiscount)
    );
  }, [editSubtotal, editEffectiveDeliveryFee, editEffectiveGlobalDiscount]);

  const editOriginalPaidAmount = editingSale ? editingSale.paidAmount : 0;
  const editParsedPaidAmount = useMemo(() => {
    const val = parseFloat(editPaidAmountInput);
    return isNaN(val) || val < 0 ? 0 : roundMoney(val);
  }, [editPaidAmountInput]);

  const editDeltaPaid = useMemo(() => {
    return roundMoney(editParsedPaidAmount - editOriginalPaidAmount);
  }, [editParsedPaidAmount, editOriginalPaidAmount]);

  const editOverpayment = useMemo(() => {
    return roundMoney(Math.max(0, editParsedPaidAmount - editGrandTotal));
  }, [editParsedPaidAmount, editGrandTotal]);

  const editNewRemainingBalance = useMemo(() => {
    return roundMoney(Math.max(0, editGrandTotal - editParsedPaidAmount));
  }, [editGrandTotal, editParsedPaidAmount]);

  const getAvailableStockForEdit = (prodId: number, locId: number): number => {
    const baseStock = getAvailableStock(prodId, locId);
    if (!editingSale || editingSale.status !== "confirmed" || !editingSale.items) {
      return baseStock;
    }
    const previouslyReserved = editingSale.items
      .filter((it) => {
        const itProdId = (it as any).productId || (it as any).product?.id || products.find((p) => p.sku === it.product?.sku)?.id;
        const itLocId = (it as any).locationId || (it as any).location?.id;
        return itProdId === prodId && itLocId === locId;
      })
      .reduce((sum, it) => sum + it.quantity, 0);

    return baseStock + previouslyReserved;
  };

  const handleAddEditLine = () => {
    nextLineIdRef.current += 1;
    const pId = products[0]?.id || 0;
    const prod = products.find((p) => p.id === pId);
    setEditLines((prev) => [
      ...prev,
      {
        id: `edit-line-${nextLineIdRef.current}-${Date.now()}`,
        productId: pId,
        locationId: defaultLocation,
        color: prod?.color || "",
        quantity: "1",
        unitPrice: String(prod?.sellingPrice ?? 0),
        discount: "0",
      },
    ]);
  };

  const handleRemoveEditLine = (id: string) => {
    if (editLines.length <= 1) {
      showNotification("error", "Une facture doit comporter au moins une ligne d'article.");
      return;
    }
    setEditLines((prev) => prev.filter((l) => l.id !== id));
  };

  const handleUpdateEditLine = (
    lineId: string,
    field: "productId" | "locationId" | "color" | "quantity" | "unitPrice" | "discount",
    value: string | number
  ) => {
    setEditLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        if (field === "productId") {
          const p = products.find((prod) => prod.id === value);
          return {
            ...line,
            productId: Number(value),
            unitPrice:
              p?.sellingPrice !== null && p?.sellingPrice !== undefined
                ? String(p.sellingPrice)
                : line.unitPrice,
            color: line.color ? line.color : (p?.color || ""),
          };
        }
        return {
          ...line,
          [field]: String(value),
        };
      })
    );
  };

  const handleUpdateSaleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSale) return;

    if (editLines.length === 0) {
      showNotification("error", "Veuillez conserver au moins une ligne d'article.");
      return;
    }

    for (const line of editLines) {
      const q = parseInt(line.quantity, 10);
      if (isNaN(q) || q <= 0) {
        showNotification("error", "La quantité de chaque ligne doit être au moins de 1.");
        return;
      }
      const available = getAvailableStockForEdit(line.productId, line.locationId);
      if (editingSale.status === "confirmed" && q > available) {
        const prod = products.find((p) => p.id === line.productId);
        showNotification(
          "error",
          `Stock insuffisant pour "${prod?.name || "cet article"}". Disponible pour cette facture : ${available} unité(s).`
        );
        return;
      }
    }

    const parsedPaid = parseFloat(editPaidAmountInput);
    if (isNaN(parsedPaid) || parsedPaid < 0) {
      showNotification("error", "Le montant déjà encaissé doit être un nombre positif ou nul.");
      return;
    }

    const payload = {
      saleId: editingSale.id,
      customerId: editCustomerId === "walkin" ? null : parseInt(editCustomerId, 10),
      saleDate: editSaleDate,
      notes: editNotes.trim() || null,
      editReason: editReason.trim() || undefined,
      deliveryFee: editParsedDeliveryFee,
      includeDeliveryFee: editIncludeDeliveryFee,
      discount: editEffectiveGlobalDiscount,
      items: editLines.map((l) => ({
        productId: l.productId,
        locationId: l.locationId,
        color: l.color?.trim() || null,
        quantity: parseInt(l.quantity, 10),
        unitPrice: parseFloat(l.unitPrice) || 0,
        discount: parseFloat(l.discount) || 0,
      })),
      revisedPaidAmount: parsedPaid,
      additionalPaymentMethod: editAdditionalPaymentMethod,
      additionalPaymentNotes: editAdditionalPaymentNotes.trim() || undefined,
    };

    startTransition(async () => {
      const res = await updateSaleAction(payload);
      if (res.success) {
        showNotification("success", res.message || "Facture modifiée avec succès.");
        setEditingSale(null);
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de la modification de la facture.");
      }
    });
  };

  // ─── FORMULAIRE DE CRÉATION DE VENTE ──────────────────────────────────────
  interface FormLine {
    id: string;
    productId: number;
    locationId: number;
    color: string;
    quantity: string;
    unitPrice: string;
    discount: string;
  }

  const defaultLocation = locations.find((l) => l.isDefault)?.id || locations[0]?.id || 0;
  const nextLineIdRef = useRef(2);

  const [formCustomerId, setFormCustomerId] = useState<string>("walkin");
  const [formSaleDate, setFormSaleDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formStatus, setFormStatus] = useState<"confirmed" | "draft">("confirmed");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formDeliveryFee, setFormDeliveryFee] = useState<string>("0");
  const [formGlobalDiscount, setFormGlobalDiscount] = useState<string>("0");
  const [formLines, setFormLines] = useState<FormLine[]>([
    {
      id: "line-1",
      productId: products[0]?.id || 0,
      locationId: defaultLocation,
      color: products[0]?.color || "",
      quantity: "1",
      unitPrice: String(products[0]?.sellingPrice ?? 0),
      discount: "0",
    },
  ]);

  // Payment form state
  const [formPaymentType, setFormPaymentType] = useState<"full" | "partial" | "credit">("full");
  const [formPaidAmount, setFormPaidAmount] = useState<string>("");
  const [isPaidAmountCustom, setIsPaidAmountCustom] = useState<boolean>(false);
  const [formPaymentMethod, setFormPaymentMethod] = useState<"cash" | "cib" | "check" | "transfer">("cash");
  const [formPaymentNotes, setFormPaymentNotes] = useState<string>("");
  const [formSavingsUsed, setFormSavingsUsed] = useState<string>("");

  // Delivery fee & checkbox state
  const [formIncludeDeliveryFee, setFormIncludeDeliveryFee] = useState<boolean>(false);

  const handleNewCustomerCreated = (newCust: CreatedCustomerData) => {
    const newOption: CustomerOption = {
      id: newCust.id,
      code: newCust.code || `CLI-${newCust.id}`,
      name: newCust.name,
      phone: newCust.phone || null,
      phone2: newCust.phone2 || null,
      address: newCust.address || null,
      isActive: newCust.isActive ?? true,
    };
    setCreatedCustomers((prev) => {
      if (prev.some((c) => c.id === newCust.id)) return prev;
      return [newOption, ...prev];
    });
    if (customerModalTarget === "advance") {
      setAdvanceCustomerId(String(newCust.id));
      showNotification("success", `Client "${newCust.name}" créé et sélectionné pour l'avance.`);
    } else {
      setFormCustomerId(String(newCust.id));
      showNotification("success", `Client "${newCust.name}" créé et sélectionné pour cette vente.`);
    }
  };

  // Calculate live totals cleanly without premature snapping
  const subtotal = useMemo(() => {
    return roundMoney(
      formLines.reduce((sum, line) => {
        const q = Math.max(0, parseInt(line.quantity, 10) || 0);
        const p = Math.max(0, parseFloat(line.unitPrice) || 0);
        const d = Math.max(0, parseFloat(line.discount) || 0);
        const lineTotal = Math.max(0, q * p - d);
        return sum + lineTotal;
      }, 0)
    );
  }, [formLines]);

  const parsedDeliveryFee = useMemo(() => {
    const val = parseFloat(formDeliveryFee);
    return isNaN(val) || val < 0 ? 0 : roundMoney(val);
  }, [formDeliveryFee]);

  const effectiveDeliveryFee = useMemo(() => {
    return formIncludeDeliveryFee ? parsedDeliveryFee : 0;
  }, [formIncludeDeliveryFee, parsedDeliveryFee]);

  const effectiveGlobalDiscount = useMemo(() => {
    return roundMoney(Math.max(0, parseFloat(formGlobalDiscount) || 0));
  }, [formGlobalDiscount]);

  const grandTotal = useMemo(() => {
    return roundMoney(Math.max(0, subtotal + effectiveDeliveryFee - effectiveGlobalDiscount));
  }, [subtotal, effectiveDeliveryFee, effectiveGlobalDiscount]);

  const selectedCustomerSavings = useMemo(() => {
    if (formCustomerId === "walkin") return 0;
    const cid = parseInt(formCustomerId, 10);
    const acc = savingsAccounts.find((s) => s.customerId === cid);
    return acc ? acc.balance : 0;
  }, [formCustomerId, savingsAccounts]);

  const parsedSavingsUsed = useMemo(() => {
    if (selectedCustomerSavings <= 0) return 0;
    const val = parseFloat(formSavingsUsed);
    if (isNaN(val) || val <= 0) return 0;
    return roundMoney(Math.min(val, selectedCustomerSavings, grandTotal));
  }, [formSavingsUsed, selectedCustomerSavings, grandTotal]);

  const remainingAfterSavings = useMemo(() => {
    return roundMoney(Math.max(0, grandTotal - parsedSavingsUsed));
  }, [grandTotal, parsedSavingsUsed]);

  const effectivePaidAmount = useMemo(() => {
    if (formPaymentType === "credit") {
      return 0;
    }
    if (formPaymentType === "full" && !isPaidAmountCustom) {
      return remainingAfterSavings;
    }
    const typed = parseFloat(formPaidAmount);
    return isNaN(typed) ? 0 : roundMoney(Math.max(0, typed));
  }, [formPaymentType, isPaidAmountCustom, remainingAfterSavings, formPaidAmount]);

  const remainingDue = useMemo(() => {
    return roundMoney(Math.max(0, grandTotal - parsedSavingsUsed - effectivePaidAmount));
  }, [grandTotal, parsedSavingsUsed, effectivePaidAmount]);

  const modalCustomerSavings = useMemo(() => {
    if (!paymentModalSale) return 0;
    const cid = paymentModalSale.customer?.id;
    if (!cid) return 0;
    const acc = savingsAccounts.find((s) => s.customerId === cid);
    return acc ? acc.balance : 0;
  }, [paymentModalSale, savingsAccounts]);

  // Helper to get available stock for a product at a location
  const getAvailableStock = (prodId: number, locId: number): number => {
    const prod = products.find((p) => p.id === prodId);
    if (!prod) return 0;
    const stockRow = prod.stocks?.find((s: ProductStockInfo) => s.locationId === locId);
    return stockRow?.quantity ?? 0;
  };

  const handleUpdateLine = (
    lineId: string,
    field: "productId" | "locationId" | "color" | "quantity" | "unitPrice" | "discount",
    value: string | number
  ) => {
    setFormLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        if (field === "productId") {
          const prod = products.find((p) => p.id === Number(value));
          return {
            ...line,
            productId: Number(value),
            unitPrice: String(prod?.sellingPrice ?? 0),
            color: line.color ? line.color : (prod?.color || ""),
          };
        }
        if (field === "locationId") {
          return { ...line, locationId: Number(value) };
        }
        return { ...line, [field]: String(value) };
      })
    );
  };

  const handleBlurLine = (
    lineId: string,
    field: "quantity" | "unitPrice" | "discount"
  ) => {
    setFormLines((prev) =>
      prev.map((line) => {
        if (line.id !== lineId) return line;
        if (field === "quantity") {
          const parsed = parseInt(line.quantity, 10);
          return { ...line, quantity: isNaN(parsed) || parsed <= 0 ? "1" : String(parsed) };
        }
        if (field === "unitPrice") {
          const parsed = parseFloat(line.unitPrice);
          return { ...line, unitPrice: isNaN(parsed) || parsed < 0 ? "0" : String(parsed) };
        }
        if (field === "discount") {
          const parsed = parseFloat(line.discount);
          return { ...line, discount: isNaN(parsed) || parsed < 0 ? "0" : String(parsed) };
        }
        return line;
      })
    );
  };

  const handleAddLine = () => {
    const pId = products[0]?.id || 0;
    const prod = products.find((p) => p.id === pId);
    const newLine: FormLine = {
      id: `line-${nextLineIdRef.current++}`,
      productId: pId,
      locationId: defaultLocation,
      color: prod?.color || "",
      quantity: "1",
      unitPrice: String(prod?.sellingPrice ?? 0),
      discount: "0",
    };
    setFormLines((prev) => [...prev, newLine]);
  };

  const handleRemoveLine = (lineId: string) => {
    if (formLines.length === 1) {
      showNotification("error", "Une vente doit comporter au moins un meuble.");
      return;
    }
    setFormLines((prev) => prev.filter((l) => l.id !== lineId));
  };

  const handlePaymentTypeChange = (type: "full" | "partial" | "credit") => {
    setFormPaymentType(type);
    if (type === "full") {
      setIsPaidAmountCustom(false);
      setFormPaidAmount(String(grandTotal));
    } else if (type === "credit") {
      setIsPaidAmountCustom(true);
      setFormPaidAmount("0");
    } else {
      setIsPaidAmountCustom(true);
      setFormPaidAmount(String(roundMoney(grandTotal / 2)));
    }
  };

  const handleCreateSaleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validations client préalables
    if (formLines.length === 0) {
      showNotification("error", "Veuillez ajouter au moins un meuble.");
      return;
    }

    const parsedLines = formLines.map((l, i) => {
      const q = parseInt(l.quantity, 10);
      const p = parseFloat(l.unitPrice);
      const d = parseFloat(l.discount);
      return {
        id: l.id,
        index: i,
        productId: l.productId,
        locationId: l.locationId,
        color: l.color?.trim() || null,
        quantity: isNaN(q) ? 0 : q,
        unitPrice: isNaN(p) ? 0 : p,
        discount: isNaN(d) ? 0 : d,
      };
    });

    for (let i = 0; i < parsedLines.length; i++) {
      const line = parsedLines[i];
      if (line.quantity <= 0 || !Number.isInteger(line.quantity)) {
        showNotification("error", `Ligne ${i + 1} : La quantité doit être un nombre entier positif.`);
        return;
      }
      if (line.unitPrice < 0) {
        showNotification("error", `Ligne ${i + 1} : Le prix unitaire ne peut pas être négatif.`);
        return;
      }
      if (line.discount < 0) {
        showNotification("error", `Ligne ${i + 1} : La remise ne peut pas être négative.`);
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

    if (effectivePaidAmount > grandTotal) {
      showNotification(
        "error",
        `Le montant versé (${effectivePaidAmount.toLocaleString("fr-DZ")} DA) ne peut pas excéder le total de la facture (${grandTotal.toLocaleString("fr-DZ")} DA).`
      );
      return;
    }

    const payload = {
      customerId: formCustomerId === "walkin" ? null : parseInt(formCustomerId, 10),
      saleDate: formSaleDate,
      status: formStatus,
      notes: formNotes?.trim() || null,
      deliveryFee: parsedDeliveryFee,
      includeDeliveryFee: formIncludeDeliveryFee,
      discount: effectiveGlobalDiscount,
      savingsUsed: parsedSavingsUsed > 0 ? parsedSavingsUsed : undefined,
      items: parsedLines.map((l) => ({
        productId: l.productId,
        locationId: l.locationId,
        color: l.color,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
      })),
      initialPayment:
        effectivePaidAmount > 0
          ? {
              amount: effectivePaidAmount,
              method: formPaymentMethod,
              notes: formPaymentNotes,
            }
          : undefined,
    };

    startTransition(async () => {
      const res = await createSaleAction(payload);
      if (res.success && res.data) {
        showNotification("success", res.message || "Vente enregistrée avec succès.");
        const fullSale = res.data as PrintableSale;
        setPrintPrompt({
          isOpen: true,
          documentTypeLabel: fullSale.status === "confirmed" ? "Facture de vente" : "Devis / Bon de commande",
          documentReference: fullSale.reference,
          onConfirm: () => {
            setPrintPrompt(null);
            setShouldAutoPrint(true);
            setPrintingSale(fullSale);
            setActiveTab("list");
          },
          onCancel: () => {
            setPrintPrompt(null);
            setActiveTab("list");
            router.refresh();
          },
        });
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

    const formData = new FormData(e.currentTarget);
    const chosenMethod = (formData.get("method") as string) || paymentModalMethod;
    if (chosenMethod === "savings") {
      if (amount > modalCustomerSavings) {
        setPaymentInputError(
          `Le montant saisi (${amount.toLocaleString("fr-DZ")} DA) dépasse le solde d'épargne disponible (${modalCustomerSavings.toLocaleString("fr-DZ")} DA).`
        );
        return;
      }
    }
    setPaymentInputError(null);
    formData.set("amount", trimmedVal);
    formData.append("saleId", String(paymentModalSale.id));

    startTransition(async () => {
      const res = await recordSalePaymentAction(formData);
      if (res.success) {
        showNotification("success", res.message || "Paiement validé.");
        const paymentRecord = res.data as PrintablePayment;
        const currentSale = paymentModalSale;
        closePaymentModal();
        if (paymentRecord && currentSale) {
          const updatedSale: PrintableSale = {
            ...currentSale,
            paidAmount: roundMoney(currentSale.paidAmount + amount),
          };
          setPrintPrompt({
            isOpen: true,
            documentTypeLabel: "Reçu de versement client",
            documentReference: paymentRecord.reference,
            onConfirm: () => {
              setPrintPrompt(null);
              setShouldAutoPrint(true);
              setPrintingReceipt({ payment: paymentRecord, sale: updatedSale });
            },
            onCancel: () => {
              setPrintPrompt(null);
              router.refresh();
            },
          });
        } else {
          router.refresh();
        }
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
      if (res.success && res.data) {
        showNotification("success", res.message || "Vente confirmée.");
        const confirmedSale = res.data as PrintableSale;
        setPrintPrompt({
          isOpen: true,
          documentTypeLabel: "Facture de vente confirmée",
          documentReference: confirmedSale.reference,
          onConfirm: () => {
            setPrintPrompt(null);
            setShouldAutoPrint(true);
            setPrintingSale(confirmedSale);
          },
          onCancel: () => {
            setPrintPrompt(null);
            router.refresh();
          },
        });
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

  // ─── GESTION DES AVANCES CLIENTS (FEATURE C) ──────────────────────────────
  const handleCreateAdvanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(advanceAmount);
    if (!advanceCustomerId || isNaN(amt) || amt <= 0) {
      showNotification("error", "Veuillez sélectionner un client et saisir un montant supérieur à 0 DA.");
      return;
    }
    startTransition(async () => {
      const res = await createCustomerAdvanceAction({
        customerId: parseInt(advanceCustomerId, 10),
        amount: amt,
        method: advanceMethod,
        paymentDate: advanceDate,
        productInterest: advanceProductInterest || undefined,
        notes: advanceNotes || undefined,
      });
      if (res.success) {
        showNotification("success", res.message || "Avance client enregistrée.");
        setAdvanceAmount("");
        setAdvanceProductInterest("");
        setAdvanceNotes("");
        window.location.reload();
      } else {
        showNotification("error", res.error || "Erreur lors de l'enregistrement de l'avance.");
      }
    });
  };

  const handleAllocateAdvanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allocatingAdvance || !allocationSaleId) return;
    const amt = parseFloat(allocationAmount);
    if (isNaN(amt) || amt <= 0) {
      showNotification("error", "Veuillez saisir un montant valide à affecter.");
      return;
    }
    startTransition(async () => {
      const res = await allocateCustomerAdvanceAction({
        advanceId: allocatingAdvance.id,
        saleId: parseInt(allocationSaleId, 10),
        amount: amt,
        notes: allocationNotes || undefined,
      });
      if (res.success) {
        showNotification("success", res.message || "Avance affectée à la facture avec succès.");
        setAllocatingAdvance(null);
        setAllocationSaleId("");
        setAllocationAmount("");
        setAllocationNotes("");
        window.location.reload();
      } else {
        showNotification("error", res.error || "Erreur lors de l'affectation de l'avance.");
      }
    });
  };

  const handleRefundAdvanceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundingAdvance) return;
    const amt = parseFloat(refundAmount);
    if (isNaN(amt) || amt <= 0) {
      showNotification("error", "Veuillez saisir un montant de remboursement valide.");
      return;
    }
    startTransition(async () => {
      const res = await refundCustomerAdvanceAction({
        advanceId: refundingAdvance.id,
        amount: amt,
        reason: refundReason.trim(),
      });
      if (res.success) {
        showNotification("success", res.message || "Remboursement de l'avance effectué.");
        setRefundingAdvance(null);
        setRefundAmount("");
        setRefundReason("");
        window.location.reload();
      } else {
        showNotification("error", res.error || "Erreur lors du remboursement de l'avance.");
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
      (s.customer?.phone && s.customer.phone.includes(q)) ||
      (s.customer?.phone2 && s.customer.phone2.includes(q));

    if (!matchesSearch) return false;

    if (saleStatusFilter !== "all" && s.status !== saleStatusFilter) return false;
    if (paymentStatusFilter !== "all" && s.paymentStatus !== paymentStatusFilter) return false;

    return true;
  });

  const filteredAdvances = advances.filter((adv) => {
    const q = advanceSearchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      adv.reference.toLowerCase().includes(q) ||
      (adv.customer?.name && adv.customer.name.toLowerCase().includes(q)) ||
      (adv.customer?.phone && adv.customer.phone.includes(q)) ||
      (adv.customer?.phone2 && adv.customer.phone2.includes(q)) ||
      (adv.notes && adv.notes.toLowerCase().includes(q)) ||
      (adv.productInterest && adv.productInterest.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    if (advanceStatusFilter !== "all" && adv.status !== advanceStatusFilter) return false;
    return true;
  });

  const creditSales = sales.filter((s) => s.status !== "cancelled" && s.totalAmount > s.paidAmount);

  return (
    <div className="space-y-6">
      <datalist id="sale-colors-list">
        <option value="Blanc" />
        <option value="Noir" />
        <option value="Gris" />
        <option value="Gris Clair" />
        <option value="Gris Anthracite" />
        <option value="Beige" />
        <option value="Bleu" />
        <option value="Bleu Canard" />
        <option value="Marron" />
        <option value="Chêne" />
        <option value="Chêne Clair" />
        <option value="Noyer" />
        <option value="Doré" />
        <option value="Vert" />
      </datalist>
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
              Ventes Facturées
            </span>
            <ShoppingCart className="h-5 w-5 text-indigo-500" />
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900">
            {metrics.totalSalesCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">Factures de vente enregistrées</p>
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
            onClick={() => setActiveTab("advances")}
            className={`py-3 px-1 border-b-2 font-semibold text-sm transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "advances"
                ? "border-amber-500 text-amber-600"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <PiggyBank className="w-4 h-4" />
            Avances clients ({advances.length})
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

                              {sale.status !== "cancelled" && balance > 0 && (
                                <button
                                  onClick={() => openPaymentModal(sale)}
                                  title="Enregistrer un paiement / Encaisser le solde"
                                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer transition-colors"
                                >
                                  <CreditCard className="h-3.5 w-3.5" />
                                  <span className="hidden xl:inline">Encaisser</span>
                                </button>
                              )}

                              <button
                                onClick={() => setViewingPaymentHistorySale(sale)}
                                title="Historique des règlements"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                              >
                                <History className="h-4 w-4" />
                              </button>

                              <button
                                onClick={() => setPrintingSale(sale)}
                                title="Voir détails"
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                              >
                                <FileText className="h-4 w-4" />
                              </button>

                              {sale.status !== "cancelled" && (
                                <button
                                  onClick={() => openEditModal(sale)}
                                  title="Modifier / Réouvrir la facture"
                                  className="p-1.5 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-lg cursor-pointer transition-colors"
                                >
                                  <Pencil className="h-4 w-4" />
                                </button>
                              )}

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
                    Vente Confirmée (Sortie de stock immédiate)
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
                    Commande / Devis (En attente d&apos;enlèvement — Stock préservé)
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
                    onChange={(e) => { setFormCustomerId(e.target.value); setFormSavingsUsed(""); }}
                    className="flex-1 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="walkin">Client Passager / Comptoir (Vente Directe)</option>
                    {customers.map((c) => (
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
                  onChange={(e) => setFormDeliveryFee(e.target.value)}
                  onBlur={() => {
                    const parsed = parseFloat(formDeliveryFee);
                    setFormDeliveryFee(isNaN(parsed) || parsed < 0 ? "0" : String(parsed));
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
                />
                <label className="mt-2 flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={formIncludeDeliveryFee}
                    onChange={(e) => setFormIncludeDeliveryFee(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <span className="font-medium">Inclure les frais de livraison dans la facture</span>
                </label>
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

              <div className="border border-slate-200 rounded-lg overflow-visible">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-3">Meuble / Référence</th>
                      <th className="py-2.5 px-3">Dépôt Source</th>
                      <th className="py-2.5 px-3 w-32">Couleur</th>
                      <th className="py-2.5 px-3 w-28 text-center">Qté</th>
                      <th className="py-2.5 px-3 w-36 text-right">Prix Unitaire (DA)</th>
                      <th className="py-2.5 px-3 w-28 text-right">Remise (DA)</th>
                      <th className="py-2.5 px-3 w-36 text-right">Total Ligne (DA)</th>
                      <th className="py-2.5 px-2 w-12 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {formLines.map((line) => {
                      const qNum = parseInt(line.quantity, 10) || 0;
                      const pNum = parseFloat(line.unitPrice) || 0;
                      const dNum = parseFloat(line.discount) || 0;
                      const available = getAvailableStock(line.productId, line.locationId);
                      const isStockExceeded = formStatus === "confirmed" && qNum > available;
                      const lineTotal = roundMoney(Math.max(0, qNum * pNum - dNum));

                      return (
                        <tr key={line.id} className={isStockExceeded ? "bg-rose-50/60" : ""}>
                          <td className="py-2.5 px-3">
                            <ArticleSearchSelector
                              products={products}
                              selectedProductId={line.productId}
                              selectedLocationId={line.locationId}
                              onSelectProduct={(p) => handleUpdateLine(line.id, "productId", p.id)}
                            />
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="flex flex-col gap-1">
                              <select
                                value={line.locationId}
                                onChange={(e) => handleUpdateLine(line.id, "locationId", parseInt(e.target.value, 10))}
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
                              type="text"
                              list="sale-colors-list"
                              placeholder="Couleur"
                              value={line.color || ""}
                              onChange={(e) => handleUpdateLine(line.id, "color", e.target.value)}
                              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded bg-white font-medium focus:outline-hidden focus:ring-1 focus:ring-amber-500 placeholder:text-slate-400"
                            />
                          </td>

                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={line.quantity}
                              onChange={(e) => handleUpdateLine(line.id, "quantity", e.target.value)}
                              onBlur={() => handleBlurLine(line.id, "quantity")}
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
                              onChange={(e) => handleUpdateLine(line.id, "unitPrice", e.target.value)}
                              onBlur={() => handleBlurLine(line.id, "unitPrice")}
                              className="w-full px-2 py-1.5 text-xs text-right border border-slate-300 rounded bg-white font-mono"
                            />
                          </td>

                          <td className="py-2.5 px-3">
                            <input
                              type="number"
                              min="0"
                              step="100"
                              value={line.discount}
                              onChange={(e) => handleUpdateLine(line.id, "discount", e.target.value)}
                              onBlur={() => handleBlurLine(line.id, "discount")}
                              className="w-full px-2 py-1.5 text-xs text-right border border-slate-300 rounded bg-white font-mono text-slate-500"
                            />
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {lineTotal.toLocaleString("fr-DZ")} DA
                          </td>

                          <td className="py-2.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveLine(line.id)}
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

                {selectedCustomerSavings > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Coins className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-xs font-bold text-amber-950">
                          Épargne / Avoir disponible : {selectedCustomerSavings.toLocaleString("fr-DZ")} DA
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const maxUsable = Math.min(selectedCustomerSavings, grandTotal);
                          setFormSavingsUsed(String(maxUsable));
                        }}
                        className="text-[11px] font-semibold text-amber-800 hover:text-amber-900 underline cursor-pointer"
                      >
                        Utiliser le max ({Math.min(selectedCustomerSavings, grandTotal).toLocaleString("fr-DZ")} DA)
                      </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <label className="block text-[11px] font-bold text-slate-700 uppercase mb-0.5">
                          Montant déduit de l&apos;épargne (DA)
                        </label>
                        <input
                          type="number"
                          min="0"
                          max={Math.min(selectedCustomerSavings, grandTotal)}
                          step="1"
                          placeholder="0"
                          value={formSavingsUsed}
                          onChange={(e) => setFormSavingsUsed(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs font-mono font-bold text-amber-900 border border-amber-300 rounded-lg bg-white"
                        />
                      </div>
                      {parsedSavingsUsed > 0 && (
                        <button
                          type="button"
                          onClick={() => setFormSavingsUsed("")}
                          className="text-xs text-slate-400 hover:text-rose-600 self-end pb-2 cursor-pointer"
                          title="Effacer la déduction d'épargne"
                        >
                          Effacer
                        </button>
                      )}
                    </div>

                    {parsedSavingsUsed > 0 && (
                      <p className="text-[11px] text-amber-800 font-medium">
                        ✓ Déduction de {parsedSavingsUsed.toLocaleString("fr-DZ")} DA appliquée sur l&apos;épargne. Reste pour solder la facture : {remainingAfterSavings.toLocaleString("fr-DZ")} DA.
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase mb-1">
                      Montant Versé Immédiat (DA)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={formPaymentType === "full" && !isPaidAmountCustom ? grandTotal : formPaidAmount}
                      onChange={(e) => {
                        setFormPaidAmount(e.target.value);
                        setIsPaidAmountCustom(true);
                        setFormPaymentType("partial");
                      }}
                      onBlur={() => {
                        const parsed = parseFloat(formPaidAmount);
                        if (!isNaN(parsed) && parsed < 0) {
                          setFormPaidAmount("0");
                        }
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
              </div>

              {/* Right: Synthesis Totals Box */}
              <div className="bg-slate-900 text-white p-5 rounded-xl flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Sous-total meubles :</span>
                    <span className="font-mono">{subtotal.toLocaleString("fr-DZ")} DA</span>
                  </div>

                  {parsedDeliveryFee > 0 && (
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>Frais de livraison {formIncludeDeliveryFee ? "(inclus)" : "(exclus)"} :</span>
                      <span className={`font-mono ${formIncludeDeliveryFee ? "text-amber-300 font-semibold" : "text-slate-400"}`}>
                        {formIncludeDeliveryFee ? `+${parsedDeliveryFee.toLocaleString("fr-DZ")} DA` : `${parsedDeliveryFee.toLocaleString("fr-DZ")} DA (non inclus)`}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-xs text-slate-300">
                    <span>Remise globale (DA) :</span>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={formGlobalDiscount}
                      onChange={(e) => setFormGlobalDiscount(e.target.value)}
                      onBlur={() => {
                        const parsed = parseFloat(formGlobalDiscount);
                        setFormGlobalDiscount(isNaN(parsed) || parsed < 0 ? "0" : String(parsed));
                      }}
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

                  {parsedSavingsUsed > 0 && (
                    <div className="flex justify-between text-xs text-amber-300 pt-1">
                      <span>Déduction Épargne Client :</span>
                      <span className="font-mono font-bold">
                        - {parsedSavingsUsed.toLocaleString("fr-DZ")} DA
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-base font-bold pt-3 border-t border-slate-700">
                    <span>TOTAL FACTURE :</span>
                    <span className="font-mono text-xl text-amber-400">
                      {grandTotal.toLocaleString("fr-DZ")} DA
                    </span>
                  </div>

                  <div className="flex justify-between text-xs text-emerald-400 pt-1">
                    <span>Montant réglé immédiatement :</span>
                    <span className="font-mono font-bold">
                      {effectivePaidAmount.toLocaleString("fr-DZ")} DA
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
                      ? "Valider la Vente et Déduire le Stock"
                      : "Enregistrer la Commande / Devis (Stock Préservé)"}
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
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setViewingPaymentHistorySale(sale)}
                              title="Historique des versements"
                              className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer transition-colors"
                            >
                              <History className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => openPaymentModal(sale)}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs"
                            >
                              Encaisser
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
      )}



      {/* ── TAB 5: AVANCES CLIENTS (FEATURE C) ──────────────────────────────── */}
      {activeTab === "advances" && (
        <div className="space-y-6">
          {/* Form: Nouvelle Avance Client */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <PiggyBank className="w-5 h-5 text-amber-500" />
                  Enregistrer une Nouvelle Avance Client
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Réception d&apos;acompte ou fonds avant commande / émission de facture. L&apos;argent entre en caisse sans déduire de stock ni créer de vente fictive.
                </p>
              </div>
            </div>

            <form onSubmit={handleCreateAdvanceSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
                {/* Client Selection with + Nouveau client button */}
                <div className="sm:col-span-2 lg:col-span-5">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700 uppercase">
                      Client <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={advanceCustomerId}
                      onChange={(e) => setAdvanceCustomerId(e.target.value)}
                      required
                      className="flex-1 min-w-0 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">-- Choisir un client --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ""} [{c.code || `CLI-${c.id}`}]
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerModalTarget("advance");
                        setIsNewCustomerModalOpen(true);
                      }}
                      title="Créer un nouveau client dans le système"
                      className="px-3.5 py-2 text-xs font-semibold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors cursor-pointer shrink-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                      <span>+ Nouveau client</span>
                    </button>
                  </div>
                </div>

                {/* Montant de l'avance */}
                <div className="sm:col-span-1 lg:col-span-3">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Montant de l&apos;avance (DA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    required
                    placeholder="Ex: 20 000 DA"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono font-bold text-emerald-700 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                {/* Mode d'encaissement */}
                <div className="sm:col-span-1 lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Mode d&apos;encaissement
                  </label>
                  <select
                    value={advanceMethod}
                    onChange={(e) => setAdvanceMethod(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-medium"
                  >
                    <option value="cash">Espèces (Caisse principale)</option>
                    <option value="ccp">Compte CCP / Poste</option>
                    <option value="bank_transfer">Virement Bancaire</option>
                    <option value="cheque">Chèque</option>
                  </select>
                </div>

                {/* Date de Réception */}
                <div className="sm:col-span-2 lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Date de Réception
                  </label>
                  <input
                    type="date"
                    value={advanceDate}
                    onChange={(e) => setAdvanceDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Modèle / Meuble d&apos;intérêt (Optionnel)
                  </label>
                  <input
                    type="text"
                    value={advanceProductInterest}
                    onChange={(e) => setAdvanceProductInterest(e.target.value)}
                    placeholder="Ex: Salon Capila en velours beige ou Chambre Royal..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Motif / Observations
                  </label>
                  <input
                    type="text"
                    value={advanceNotes}
                    onChange={(e) => setAdvanceNotes(e.target.value)}
                    placeholder="Ex: Réservation à l'avance, livraison prévue fin du mois..."
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2.5 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg shadow-sm transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <PiggyBank className="w-4 h-4" />
                  {isPending ? "Enregistrement..." : "Encaisser l'avance"}
                </button>
              </div>
            </form>
          </div>

          {/* Table: Liste des Avances Clients */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Registre des Avances Clients ({advances.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Suivi des acomptes reçus, affectations aux factures et remboursements éventuels.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Réf, client, tél, notes..."
                    value={advanceSearchQuery}
                    onChange={(e) => setAdvanceSearchQuery(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-amber-500"
                  />
                </div>

                <select
                  value={advanceStatusFilter}
                  onChange={(e) => setAdvanceStatusFilter(e.target.value)}
                  className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-medium"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="available">Disponible</option>
                  <option value="partially_used">Partiellement affectée</option>
                  <option value="used">Entièrement soldée</option>
                  <option value="refunded">Remboursée</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <th className="py-2.5 px-4">Réf Avance</th>
                    <th className="py-2.5 px-4">Date</th>
                    <th className="py-2.5 px-4">Client</th>
                    <th className="py-2.5 px-4">Contact</th>
                    <th className="py-2.5 px-4 text-right">Montant (DA)</th>
                    <th className="py-2.5 px-4 text-right">Affecté (DA)</th>
                    <th className="py-2.5 px-4 text-right">Remboursé (DA)</th>
                    <th className="py-2.5 px-4 text-right text-emerald-700">Disponible (DA)</th>
                    <th className="py-2.5 px-4 text-center">Statut</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredAdvances.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-slate-400">
                        Aucune avance enregistrée ou correspondant aux critères.
                      </td>
                    </tr>
                  ) : (
                    filteredAdvances.map((adv) => (
                      <tr key={adv.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          {adv.reference}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {new Date(adv.paymentDate).toLocaleDateString("fr-DZ")}
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-800">{adv.customer?.name || "Client"}</p>
                          {adv.productInterest && (
                            <p className="text-[11px] text-amber-700 mt-0.5">
                              Intérêt : {adv.productInterest}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {adv.customer?.phone || "—"}
                          {adv.customer?.phone2 && (
                            <span className="block text-[10px] text-slate-400">
                              {adv.customer.phone2}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-medium">
                          {adv.amount.toLocaleString("fr-DZ")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-indigo-600">
                          {adv.allocatedAmount.toLocaleString("fr-DZ")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-rose-600">
                          {(adv.refundedAmount || 0).toLocaleString("fr-DZ")}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                          {adv.remainingAmount.toLocaleString("fr-DZ")} DA
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              adv.status === "available"
                                ? "bg-emerald-100 text-emerald-800"
                                : adv.status === "partially_used"
                                ? "bg-indigo-100 text-indigo-800"
                                : adv.status === "used"
                                ? "bg-slate-100 text-slate-700"
                                : "bg-rose-100 text-rose-800"
                            }`}
                          >
                            {adv.status === "available"
                              ? "Disponible"
                              : adv.status === "partially_used"
                              ? "Partielle"
                              : adv.status === "used"
                              ? "Soldée"
                              : "Remboursée"}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {adv.remainingAmount > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAllocatingAdvance(adv);
                                    setAllocationSaleId("");
                                    setAllocationAmount(String(adv.remainingAmount));
                                    setAllocationNotes("");
                                  }}
                                  title="Affecter à une facture du client"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer transition-colors"
                                >
                                  <ArrowRight className="w-3.5 h-3.5" />
                                  <span>Affecter</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRefundingAdvance(adv);
                                    setRefundAmount(String(adv.remainingAmount));
                                    setRefundReason("");
                                  }}
                                  title="Rembourser au client"
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: AFFECTER UNE AVANCE À UNE FACTURE (FEATURE C) ──────────────── */}
      {allocatingAdvance && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setAllocatingAdvance(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowRight className="w-5 h-5 text-emerald-600" />
                Affecter l&apos;Avance {allocatingAdvance.reference}
              </h2>
              <button
                onClick={() => setAllocatingAdvance(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAllocateAdvanceSubmit} className="mt-4 space-y-4">
              <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-emerald-800">Client bénéficiaire :</span>
                  <span className="font-semibold text-emerald-950">
                    {allocatingAdvance.customer?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-emerald-800">Solde disponible sur l&apos;avance :</span>
                  <span className="font-mono font-bold text-emerald-900">
                    {allocatingAdvance.remainingAmount.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Sélectionner la Facture à régler <span className="text-rose-500">*</span>
                </label>
                <select
                  value={allocationSaleId}
                  onChange={(e) => {
                    const sId = e.target.value;
                    setAllocationSaleId(sId);
                    if (sId) {
                      const selSale = sales.find((s) => s.id === parseInt(sId, 10));
                      if (selSale) {
                        const due = Math.max(0, selSale.totalAmount - selSale.paidAmount);
                        const maxAmt = Math.min(allocatingAdvance.remainingAmount, due);
                        setAllocationAmount(String(maxAmt));
                      }
                    }
                  }}
                  required
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-medium"
                >
                  <option value="">-- Choisir une facture de ce client --</option>
                  {sales
                    .filter(
                      (s) =>
                        s.customer?.id === allocatingAdvance.customerId &&
                        s.status !== "cancelled" &&
                        s.totalAmount > s.paidAmount
                    )
                    .map((s) => {
                      const due = Math.max(0, s.totalAmount - s.paidAmount);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.reference} du {new Date(s.saleDate).toLocaleDateString("fr-DZ")} — Total : {s.totalAmount.toLocaleString("fr-DZ")} DA (Reste dû : {due.toLocaleString("fr-DZ")} DA)
                        </option>
                      );
                    })}
                </select>
                {sales.filter(
                  (s) =>
                    s.customer?.id === allocatingAdvance.customerId &&
                    s.status !== "cancelled" &&
                    s.totalAmount > s.paidAmount
                ).length === 0 && (
                  <p className="text-[11px] text-amber-700 mt-1">
                    Ce client n&apos;a aucune facture avec solde restant dû. Créez d&apos;abord la vente dans l&apos;onglet &quot;Nouvelle Vente&quot;.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Montant à affecter (DA) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={allocatingAdvance.remainingAmount}
                  step="1"
                  value={allocationAmount}
                  onChange={(e) => setAllocationAmount(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono font-bold text-emerald-700"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Ce montant sera déduit du solde de la facture sans générer de nouveau flux de trésorerie (l&apos;argent a déjà été comptabilisé).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Observations (Optionnel)
                </label>
                <input
                  type="text"
                  value={allocationNotes}
                  onChange={(e) => setAllocationNotes(e.target.value)}
                  placeholder="Ex: Affectation acompte suite à livraison..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAllocatingAdvance(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending || !allocationSaleId}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Affectation..." : "Confirmer l'affectation"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: REMBOURSEMENT AVANCE CLIENT (FEATURE C) ────────────────────── */}
      {refundingAdvance && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setRefundingAdvance(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-600" />
                Rembourser l&apos;Avance {refundingAdvance.reference}
              </h2>
              <button
                onClick={() => setRefundingAdvance(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRefundAdvanceSubmit} className="mt-4 space-y-4">
              <div className="bg-rose-50 p-3 rounded-lg border border-rose-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-rose-800">Client :</span>
                  <span className="font-semibold text-rose-950">
                    {refundingAdvance.customer?.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-rose-800">Solde remboursable :</span>
                  <span className="font-mono font-bold text-rose-900">
                    {refundingAdvance.remainingAmount.toLocaleString("fr-DZ")} DA
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Montant à rembourser (DA) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={refundingAdvance.remainingAmount}
                  step="1"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  required
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono font-bold text-rose-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Motif du Remboursement <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  required
                  placeholder="Ex: Désistement client, rupture de modèle..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setRefundingAdvance(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {isPending ? "Remboursement..." : "Confirmer le Remboursement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── MODAL: HISTORIQUE DES RÈGLEMENTS DE LA FACTURE (FEATURE H) ────────── */}
      {viewingPaymentHistorySale && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewingPaymentHistorySale(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-xl p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-indigo-600" />
                <h2 className="text-base font-bold text-slate-900">
                  Historique des Règlements — {viewingPaymentHistorySale.status === "draft" ? "Devis / Commande" : "Facture"} {viewingPaymentHistorySale.reference}
                </h2>
              </div>
              <button
                onClick={() => setViewingPaymentHistorySale(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto py-4 space-y-4">
              {/* Synthèse financière de la vente */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-500 block">Client</span>
                  <span className="font-bold text-slate-900 block truncate">
                    {viewingPaymentHistorySale.customer?.name || "Client Passager"}
                  </span>
                  {viewingPaymentHistorySale.customer?.phone && (
                    <span className="font-mono text-[11px] text-slate-500">
                      {viewingPaymentHistorySale.customer.phone}
                    </span>
                  )}
                </div>

                <div>
                  <span className="text-slate-500 block">Total Facture</span>
                  <span className="font-mono font-bold text-slate-900 text-sm">
                    {viewingPaymentHistorySale.totalAmount.toLocaleString("fr-DZ")} DA
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Total Encaissé</span>
                  <span className="font-mono font-bold text-emerald-700 text-sm">
                    {viewingPaymentHistorySale.paidAmount.toLocaleString("fr-DZ")} DA
                  </span>
                </div>

                <div>
                  <span className="text-slate-500 block">Reste à Payer</span>
                  <span className={`font-mono font-black text-sm ${
                    viewingPaymentHistorySale.totalAmount - viewingPaymentHistorySale.paidAmount > 0
                      ? "text-rose-700"
                      : "text-emerald-700"
                  }`}>
                    {Math.max(0, viewingPaymentHistorySale.totalAmount - viewingPaymentHistorySale.paidAmount).toLocaleString("fr-DZ")} DA
                  </span>
                </div>
              </div>

              {/* Tableau chronologique des versements */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                      <th className="py-2.5 px-3">Réf Versement</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Mode</th>
                      <th className="py-2.5 px-3 text-right">Montant (DA)</th>
                      <th className="py-2.5 px-3">Observations / Réf</th>
                      <th className="py-2.5 px-3 text-right">Reçu</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!viewingPaymentHistorySale.payments || viewingPaymentHistorySale.payments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          Aucun versement n&apos;a encore été enregistré pour cette facture.
                        </td>
                      </tr>
                    ) : (
                      viewingPaymentHistorySale.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                            {p.reference}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap">
                            {new Date(p.paymentDate).toLocaleDateString("fr-DZ")}
                          </td>
                          <td className="py-2.5 px-3 capitalize text-slate-700">
                            {p.method === "cash"
                              ? "Espèces"
                              : p.method === "ccp"
                              ? "Compte CCP"
                              : p.method === "bank_transfer"
                              ? "Virement bancaire"
                              : p.method === "cheque"
                              ? "Chèque"
                              : p.method}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                            {p.amount.toLocaleString("fr-DZ")} DA
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 max-w-[150px] truncate">
                            {p.notes || "—"}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                const saleForReceipt = viewingPaymentHistorySale;
                                setViewingPaymentHistorySale(null);
                                setPrintingReceipt({ payment: p, sale: saleForReceipt });
                              }}
                              title="Imprimer le reçu de ce versement"
                              className="p-1 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded cursor-pointer transition-colors"
                            >
                              <Printer className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setViewingPaymentHistorySale(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Fermer
              </button>

              {viewingPaymentHistorySale.status !== "cancelled" &&
                viewingPaymentHistorySale.paidAmount < viewingPaymentHistorySale.totalAmount && (
                  <button
                    type="button"
                    onClick={() => {
                      const s = viewingPaymentHistorySale;
                      setViewingPaymentHistorySale(null);
                      openPaymentModal(s);
                    }}
                    className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Encaisser un nouveau versement</span>
                  </button>
                )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: ENREGISTREMENT PAIEMENT / RÈGLEMENT ───────────────────────── */}
      {paymentModalSale && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) closePaymentModal();
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h2 className="text-base font-bold text-slate-900">
                Enregistrer un Versement : {paymentModalSale.status === "draft" ? "Commande / Devis" : "Facture"} {paymentModalSale.reference}
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
                  <span className="text-slate-500">
                    Total {paymentModalSale.status === "draft" ? "Commande" : "Facture"} :
                  </span>
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
                    value={paymentModalMethod}
                    onChange={(e) => {
                      const newMethod = e.target.value;
                      setPaymentModalMethod(newMethod);
                      if (newMethod === "savings") {
                        const remainingBal = Math.max(0, paymentModalSale.totalAmount - paymentModalSale.paidAmount);
                        const maxApplicable = Math.min(modalCustomerSavings, remainingBal);
                        if (!paymentAmountInput || parseFloat(paymentAmountInput) > maxApplicable) {
                          setPaymentAmountInput(String(maxApplicable));
                        }
                      }
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="cash">Espèces</option>
                    <option value="cib">Carte CIB / Edahabia</option>
                    <option value="check">Chèque bancaire</option>
                    <option value="transfer">Virement</option>
                    {modalCustomerSavings > 0 && (
                      <option value="savings">
                        Épargne Client (Dispo : {modalCustomerSavings.toLocaleString("fr-DZ")} DA)
                      </option>
                    )}
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

                <div className="col-span-2">
                  {paymentModalMethod === "savings" ? (
                    <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 font-medium flex items-center gap-1.5">
                      <Coins className="h-3.5 w-3.5 text-amber-600 shrink-0 inline-block" />
                      Règlement prélevé sur le compte d&apos;épargne du client ({modalCustomerSavings.toLocaleString("fr-DZ")} DA disponibles). Aucun flux d&apos;espèces physique n&apos;est généré en caisse.
                    </p>
                  ) : activeCashSession ? (
                    <p className="text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-2.5 py-1 font-medium flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 shrink-0 inline-block"></span>
                      Caisse ouverte ({activeCashSession.reference}) : les versements en espèces sont rattachés au tiroir.
                    </p>
                  ) : (
                    <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded px-2.5 py-1 font-medium flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-600 shrink-0 inline-block"></span>
                      Caisse fermée : les versements en espèces sont enregistrés hors session en attente de réconciliation.
                    </p>
                  )}
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
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setCancelModalSale(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
        >
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
          onClose={() => {
            setPrintingSale(null);
            setShouldAutoPrint(false);
            router.refresh();
          }}
          onEdit={(sale) => openEditModal(sale)}
          autoPrint={shouldAutoPrint}
        />
      )}

      {/* ── MODAL: IMPRESSION REÇU DE VERSEMENT ──────────────────────────────── */}
      {printingReceipt && (
        <PrintablePaymentReceipt
          payment={printingReceipt.payment}
          sale={printingReceipt.sale}
          settings={initialData.settings}
          onClose={() => {
            setPrintingReceipt(null);
            setShouldAutoPrint(false);
            router.refresh();
          }}
          autoPrint={shouldAutoPrint}
        />
      )}

      {/* ── POPUP: DEMANDE D'IMPRESSION APRÈS VALIDATION ────────────────────── */}
      {printPrompt && (
        <AskPrintConfirmModal
          isOpen={printPrompt.isOpen}
          documentTypeLabel={printPrompt.documentTypeLabel}
          documentReference={printPrompt.documentReference}
          onConfirmPrint={printPrompt.onConfirm}
          onCancel={printPrompt.onCancel}
        />
      )}

      {/* ── MODAL: MODIFIER / RÉOUVRIR LA FACTURE ─────────────────────────── */}
      {editingSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 my-8 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <Pencil className="h-5 w-5 text-amber-600" />
                    Modifier / Réouvrir la Facture {editingSale.reference}
                  </h2>
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                      editingSale.status === "confirmed"
                        ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {editingSale.status === "confirmed" ? "Confirmée" : "Devis / Brouillon"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Ajustez les articles, quantités, prix unitaires, remises et frais. Les stocks et le solde client seront automatiquement synchronisés.
                </p>
              </div>
              <button
                type="button"
                onClick={closeEditModal}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Warning Banner */}
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
              <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Avertissement de réconciliation :</span> La modification de cette facture recalculera le solde dû par le client sur la base de la différence entre l&apos;ancien total ({editingSale.totalAmount.toLocaleString("fr-DZ")} DA) et le nouveau montant. Les encaissements initialement enregistrés ({editOriginalPaidAmount.toLocaleString("fr-DZ")} DA) peuvent être ajustés ou complétés en direct avec mise à jour comptable traçable.
              </div>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleUpdateSaleSubmit} className="flex-1 overflow-y-auto mt-4 space-y-5 pr-1">
              {/* Client & Date & Motif */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                      <Plus className="h-3 w-3" /> Nouveau
                    </button>
                  </div>
                  <select
                    value={editCustomerId}
                    onChange={(e) => setEditCustomerId(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="walkin">Comptoir / Client Passager</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? `(${c.phone})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Date de la facture <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={editSaleDate}
                    onChange={(e) => setEditSaleDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Motif de la modification (Audit)
                  </label>
                  <input
                    type="text"
                    value={editReason}
                    onChange={(e) => setEditReason(e.target.value)}
                    placeholder="Ex: Négociation prix, échange article..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Articles Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Articles de la facture
                  </h3>
                  <span className="text-xs text-slate-400">
                    Disponibilité calculée avec le stock déjà alloué à cette facture
                  </span>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-visible">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                        <th className="py-2 px-3">Article / Référence</th>
                        <th className="py-2 px-3 w-48">Dépôt</th>
                        <th className="py-2 px-3 w-32">Couleur</th>
                        <th className="py-2 px-2 w-24 text-center">Qté</th>
                        <th className="py-2 px-3 w-32 text-right">P.U (DA)</th>
                        <th className="py-2 px-2 w-24 text-right">Remise (DA)</th>
                        <th className="py-2 px-3 w-32 text-right">Total (DA)</th>
                        <th className="py-2 px-1 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {editLines.map((line) => {
                        const qNum = parseInt(line.quantity, 10) || 0;
                        const pNum = parseFloat(line.unitPrice) || 0;
                        const dNum = parseFloat(line.discount) || 0;
                        const available = getAvailableStockForEdit(line.productId, line.locationId);
                        const isStockExceeded = editingSale.status === "confirmed" && qNum > available;
                        const lineTotal = roundMoney(Math.max(0, qNum * pNum - dNum));

                        return (
                          <tr key={line.id} className={isStockExceeded ? "bg-rose-50/60" : ""}>
                            <td className="py-2 px-3">
                              <ArticleSearchSelector
                                products={products}
                                selectedProductId={line.productId}
                                selectedLocationId={line.locationId}
                                onSelectProduct={(p) => handleUpdateEditLine(line.id, "productId", p.id)}
                              />
                            </td>

                            <td className="py-2 px-3">
                              <select
                                value={line.locationId}
                                onChange={(e) => handleUpdateEditLine(line.id, "locationId", parseInt(e.target.value, 10))}
                                className="w-full px-2 py-1 text-xs bg-white border border-slate-300 rounded font-medium focus:ring-1 focus:ring-amber-500"
                              >
                                {locations.map((loc) => (
                                  <option key={loc.id} value={loc.id}>
                                    {loc.name}
                                  </option>
                                ))}
                              </select>
                              <span
                                className={`block text-2xs mt-0.5 font-mono ${
                                  available <= 0
                                    ? "text-rose-600 font-bold"
                                    : available < 3
                                    ? "text-amber-600 font-semibold"
                                    : "text-emerald-700 font-semibold"
                                }`}
                              >
                                Dispo : {available}
                              </span>
                            </td>

                            <td className="py-2 px-3">
                              <input
                                type="text"
                                list="sale-colors-list"
                                placeholder="Couleur"
                                value={line.color || ""}
                                onChange={(e) => handleUpdateEditLine(line.id, "color", e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white font-medium focus:ring-1 focus:ring-amber-500 placeholder:text-slate-400"
                              />
                            </td>

                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={line.quantity}
                                onChange={(e) => handleUpdateEditLine(line.id, "quantity", e.target.value)}
                                className={`w-full px-2 py-1 text-xs text-center border rounded font-mono font-bold ${
                                  isStockExceeded
                                    ? "border-rose-400 bg-rose-50 text-rose-700"
                                    : "border-slate-300 bg-white"
                                }`}
                              />
                              {isStockExceeded && (
                                <span className="block text-2xs text-rose-600 text-center font-bold">
                                  Max: {available}
                                </span>
                              )}
                            </td>

                            <td className="py-2 px-3">
                              <input
                                type="number"
                                min="0"
                                step="500"
                                value={line.unitPrice}
                                onChange={(e) => handleUpdateEditLine(line.id, "unitPrice", e.target.value)}
                                className="w-full px-2 py-1 text-xs text-right border border-slate-300 rounded bg-white font-mono"
                              />
                            </td>

                            <td className="py-2 px-2">
                              <input
                                type="number"
                                min="0"
                                step="100"
                                value={line.discount}
                                onChange={(e) => handleUpdateEditLine(line.id, "discount", e.target.value)}
                                className="w-full px-2 py-1 text-xs text-right border border-slate-300 rounded bg-white font-mono text-slate-500"
                              />
                            </td>

                            <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                              {lineTotal.toLocaleString("fr-DZ")} DA
                            </td>

                            <td className="py-2 px-1 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveEditLine(line.id)}
                                className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
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

                <button
                  type="button"
                  onClick={handleAddEditLine}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 cursor-pointer transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un article
                </button>
              </div>

              {/* Delivery Fee, Global Discount, & Notes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Frais de livraison (DA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={editDeliveryFee}
                    onChange={(e) => setEditDeliveryFee(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-amber-500"
                  />
                  <label className="mt-1.5 flex items-center gap-2 cursor-pointer select-none text-xs text-slate-600">
                    <input
                      type="checkbox"
                      checked={editIncludeDeliveryFee}
                      onChange={(e) => setEditIncludeDeliveryFee(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                    <span>Inclure les frais dans la facture</span>
                  </label>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Remise globale (DA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="500"
                    value={editGlobalDiscount}
                    onChange={(e) => setEditGlobalDiscount(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono focus:ring-1 focus:ring-amber-500 text-amber-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Observations / Notes
                  </label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Remarques éventuelles..."
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Additional payment or payment reduction details */}
              {editDeltaPaid > 0 && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-emerald-900 uppercase tracking-wide">
                        Règlement additionnel (+{editDeltaPaid.toLocaleString("fr-DZ")} DA)
                      </span>
                      <p className="text-2xs text-emerald-700 mt-0.5">
                        Un paiement réel sera enregistré et rattaché à la trésorerie active.
                      </p>
                    </div>
                    <span className="px-2 py-0.5 text-2xs font-bold bg-emerald-100 text-emerald-800 rounded-full border border-emerald-300">
                      Entrée de fonds
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-emerald-200">
                    <div>
                      <label className="block text-2xs font-bold text-emerald-800 uppercase mb-1">
                        Mode de paiement <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={editAdditionalPaymentMethod}
                        onChange={(e) =>
                          setEditAdditionalPaymentMethod(
                            e.target.value as "cash" | "cib" | "check" | "transfer"
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="cash">Espèces (Caisse active)</option>
                        <option value="transfer">Virement bancaire</option>
                        <option value="check">Chèque</option>
                        <option value="cib">Carte CIB / Edahabia</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-2xs font-bold text-emerald-800 uppercase mb-1">
                        Référence / Note du règlement
                      </label>
                      <input
                        type="text"
                        placeholder="Ex: Versement suite négociation"
                        value={editAdditionalPaymentNotes}
                        onChange={(e) => setEditAdditionalPaymentNotes(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {editDeltaPaid < 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                  <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Correction à la baisse (-{Math.abs(editDeltaPaid).toLocaleString("fr-DZ")} DA) :</span> Cette rectification sera déduite des règlements directs modifiables avec inscription d&apos;une note d&apos;audit. Conformément aux règles de sécurité comptable, tout règlement rattaché à une session de caisse déjà clôturée restera scellé et protégé.
                  </div>
                </div>
              )}

              {/* Financial Reconciliation Summary Bar */}
              <div className="p-4 bg-slate-900 text-white rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
                  <span className="text-slate-400 font-semibold uppercase">Réconciliation financière</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Total initial :</span>
                    <span className="font-mono font-bold text-slate-300">
                      {editingSale.totalAmount.toLocaleString("fr-DZ")} DA
                    </span>
                    {editGrandTotal !== editingSale.totalAmount && (
                      <span
                        className={`font-mono text-2xs px-1.5 py-0.5 rounded font-bold ${
                          editGrandTotal < editingSale.totalAmount
                            ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                            : "bg-amber-950 text-amber-400 border border-amber-800"
                        }`}
                      >
                        {editGrandTotal < editingSale.totalAmount ? "Baisse: -" : "Hausse: +"}
                        {Math.abs(editGrandTotal - editingSale.totalAmount).toLocaleString("fr-DZ")} DA
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 bg-slate-800/80 rounded-lg flex flex-col justify-between">
                    <span className="block text-2xs text-slate-400 uppercase font-semibold">Sous-total</span>
                    <span className="font-mono font-bold text-sm text-slate-200 mt-1">
                      {editSubtotal.toLocaleString("fr-DZ")} DA
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/80 rounded-lg flex flex-col justify-between">
                    <span className="block text-2xs text-slate-400 uppercase font-semibold">Nouveau Total</span>
                    <span className="font-mono font-bold text-base text-amber-400 mt-1">
                      {editGrandTotal.toLocaleString("fr-DZ")} DA
                    </span>
                  </div>

                  {/* EDITABLE DÉJÀ ENCAISSÉ INPUT */}
                  <div className="p-2 bg-slate-800/80 rounded-lg flex flex-col justify-between border border-emerald-500/30">
                    <label className="block text-2xs text-emerald-400 uppercase font-bold mb-1">
                      Montant déjà encaissé (DA)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={editPaidAmountInput}
                      onChange={(e) => setEditPaidAmountInput(e.target.value)}
                      className="w-full px-2 py-1 text-sm font-mono font-bold text-emerald-300 bg-slate-950 border border-emerald-500/50 rounded focus:ring-2 focus:ring-emerald-400 focus:outline-hidden text-center"
                    />
                    {editDeltaPaid !== 0 ? (
                      <span
                        className={`block text-2xs mt-1 font-mono font-bold ${
                          editDeltaPaid > 0 ? "text-emerald-300" : "text-amber-300"
                        }`}
                      >
                        {editDeltaPaid > 0 ? "Hausse: +" : "Baisse: "}
                        {editDeltaPaid.toLocaleString("fr-DZ")} DA
                      </span>
                    ) : (
                      <span className="block text-2xs text-slate-500 mt-1">Inchangé</span>
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-800/80 rounded-lg flex flex-col justify-between">
                    <span className="block text-2xs text-slate-400 uppercase font-semibold">Reste à payer</span>
                    <span
                      className={`font-mono font-bold text-base mt-1 ${
                        editNewRemainingBalance > 0 ? "text-rose-400" : "text-emerald-300"
                      }`}
                    >
                      {editNewRemainingBalance.toLocaleString("fr-DZ")} DA
                    </span>
                  </div>
                </div>

                {editOverpayment > 0 && (
                  <div className="p-2.5 bg-amber-950/70 border border-amber-700/60 rounded-lg flex items-center gap-2 text-xs text-amber-200">
                    <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
                    <span>
                      <strong>Trop-perçu client ({editOverpayment.toLocaleString("fr-DZ")} DA) :</strong> Les règlements enregistrés ({editParsedPaidAmount.toLocaleString("fr-DZ")} DA) dépassent le nouveau total ({editGrandTotal.toLocaleString("fr-DZ")} DA). La créance client est apurée. Aucun décaissement de trésorerie n&apos;est généré automatiquement.
                    </span>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={closeEditModal}
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg shadow-sm cursor-pointer disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {isPending ? "Mise à jour en cours..." : "Valider les modifications"}
                </button>
              </div>
            </form>
          </div>
        </div>
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
