"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Truck,
  Building2,
  PackageCheck,
  Wallet,
  Search,
  Plus,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  Trash2,
  Ban,
  Eye,
  Edit2,
  Power,
  Package,
} from "lucide-react";
import { PurchaseArticleSearchSelector } from "@/components/purchases/PurchaseArticleSearchSelector";
import {
  createSupplierAction,
  updateSupplierAction,
  toggleSupplierStatusAction,
  deleteSupplierAction,
  createPurchaseOrderAction,
  receivePurchaseGoodsAction,
  recordSupplierPaymentAction,
  cancelPurchaseOrderAction,
  getReceiptDetailsAction,
} from "./actions";
import {
  PrintablePurchaseOrder,
  PrintableGoodsReceipt,
  PrintableSupplierPaymentReceipt,
  type PrintablePurchase,
  type PrintablePurchaseItem,
  type PrintablePurchaseReceipt,
  type PrintableSupplierPayment,
} from "@/components/purchases/PrintablePurchaseDocuments";
import type { ShopSettingsData } from "@/app/settings/actions";
import { AskPrintConfirmModal } from "@/components/common/AskPrintConfirmModal";

export interface SupplierItem {
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
  confirmedPurchasesCount?: number;
  lastPurchaseDate?: string | Date | null;
  createdAt?: string | Date;
}

export interface ProductItem {
  id: number;
  sku: string;
  name: string;
  model?: string | null;
  color?: string | null;
  costPrice: number | null;
  sellingPrice?: number | null;
  stock: number;
}

export interface LocationOption {
  id: number;
  code: string;
  name: string;
  isDefault: boolean;
}

export interface PurchaseMetrics {
  totalPurchasesAmount: number;
  totalPaidAmount: number;
  totalOutstandingDebt: number;
  totalOrdersCount: number;
  pendingReceiptsCount: number;
}

export interface PurchasesClientProps {
  initialData: {
    purchases: PrintablePurchase[];
    suppliers: { id: number; code?: string | null; name: string; phone?: string | null; address?: string | null }[];
    allSuppliers: SupplierItem[];
    products: ProductItem[];
    locations: LocationOption[];
    settings?: ShopSettingsData | null;
    metrics: PurchaseMetrics;
    treasuryAccounts?: Array<{ id: number; name: string; code: string; type: string; isDefault?: boolean }>;
  };
}

export function PurchasesClient({ initialData }: PurchasesClientProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"orders" | "suppliers" | "receipts" | "debts">("orders");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Purchases data
  const purchases = initialData.purchases;
  const suppliers = initialData.allSuppliers || [];
  const products = initialData.products || [];
  const locations = initialData.locations || [];
  const metrics = initialData.metrics;
  const treasuryAccounts = initialData.treasuryAccounts || [];

  const defaultLocation = locations.find((l) => l.isDefault) || locations[0];

  // Modals state
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierItem | null>(null);
  const [viewingSupplier, setViewingSupplier] = useState<SupplierItem | null>(null);
  const [viewingReceipt, setViewingReceipt] = useState<(PrintablePurchaseReceipt & { purchase?: PrintablePurchase }) | null>(null);

  // Receiving Modal
  const [receivingPurchase, setReceivingPurchase] = useState<PrintablePurchase | null>(null);
  const [receiveLines, setReceiveLines] = useState<{
    purchaseItemId: number;
    productId: number;
    productName: string;
    orderedQty: number;
    receivedQty: number;
    remainingQty: number;
    qtyToReceive: number;
    locationId: number;
    updateCostPrice: boolean;
    unitCost: number;
  }[]>([]);

  // Payment Modal
  const [payingPurchase, setPayingPurchase] = useState<PrintablePurchase | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>("0");
  const [paymentMethod, setPaymentMethod] = useState<string>("cash");
  const [paymentAccountId, setPaymentAccountId] = useState<number | "">("");
  const [paymentNotes, setPaymentNotes] = useState<string>("");
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().split("T")[0]);

  // Cancel Modal
  const [cancellingPurchase, setCancellingPurchase] = useState<PrintablePurchase | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  // Print States
  const [shouldAutoPrint, setShouldAutoPrint] = useState(false);
  const [printPrompt, setPrintPrompt] = useState<{
    isOpen: boolean;
    documentTypeLabel?: string;
    documentReference?: string | null;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);

  const [printingOrder, setPrintingOrder] = useState<PrintablePurchase | null>(null);
  const [printingReceipt, setPrintingReceipt] = useState<{ receipt: PrintablePurchaseReceipt; purchase: PrintablePurchase } | null>(null);
  const [printingPayment, setPrintingPayment] = useState<{ payment: PrintableSupplierPayment; purchase: PrintablePurchase } | null>(null);

  // Form State: New Order
  const [orderSupplierId, setOrderSupplierId] = useState<number | "">("");
  const [orderDate, setOrderDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [orderExpectedDate, setOrderExpectedDate] = useState<string>("");
  const [orderStatus, setOrderStatus] = useState<"draft" | "ordered">("ordered");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderDiscount, setOrderDiscount] = useState<number>(0);
  const [orderItems, setOrderItems] = useState<
    {
      productId: number;
      locationId: number;
      quantity: number;
      unitCost: number;
      subtotal: number;
    }[]
  >([]);

  const [initialPaymentEnabled, setInitialPaymentEnabled] = useState(false);
  const [initialPaymentAmount, setInitialPaymentAmount] = useState<number>(0);
  const [initialPaymentMethod, setInitialPaymentMethod] = useState<"cash" | "cib" | "check" | "transfer">("cash");

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  // Helper formatting
  const formatDA = (val: number) => {
    return (val || 0).toLocaleString("fr-DZ", { maximumFractionDigits: 0 }) + " DA";
  };

  const formatDate = (date: string | Date | null | undefined) => {
    if (!date) return "-";
    return new Date(date).toLocaleDateString("fr-DZ", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  // ─── ACTIONS FOURNISSEURS ──────────────────────────────────────────────────

  const handleOpenAddSupplier = () => {
    setEditingSupplier(null);
    setIsSupplierModalOpen(true);
  };

  const handleOpenEditSupplier = (s: SupplierItem) => {
    setEditingSupplier(s);
    setIsSupplierModalOpen(true);
  };

  const handleSubmitSupplier = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      let res;
      if (editingSupplier) {
        res = await updateSupplierAction(editingSupplier.id, fd);
      } else {
        res = await createSupplierAction(fd);
      }

      if (res.success) {
        showNotification("success", res.message || "Fournisseur enregistré.");
        setIsSupplierModalOpen(false);
        setEditingSupplier(null);
      } else {
        showNotification("error", res.error || "Une erreur est survenue.");
      }
    });
  };

  const handleToggleSupplierStatus = (supplier: SupplierItem) => {
    if (!confirm(`Confirmez-vous le changement de statut du fournisseur "${supplier.name}" ?`)) return;

    startTransition(async () => {
      const res = await toggleSupplierStatusAction(supplier.id);
      if (res.success) {
        showNotification("success", res.message || "Statut mis à jour.");
      } else {
        showNotification("error", res.error || "Erreur de mise à jour.");
      }
    });
  };

  const handleDeleteSupplier = (supplier: SupplierItem) => {
    if (!confirm(`ATTENTION : Voulez-vous vraiment supprimer définitivement le fournisseur "${supplier.name}" ?`)) return;

    startTransition(async () => {
      const res = await deleteSupplierAction(supplier.id);
      if (res.success) {
        showNotification("success", res.message || "Fournisseur supprimé.");
      } else {
        showNotification("error", res.error || "Erreur de suppression.");
      }
    });
  };

  // ─── ACTIONS COMMANDES D&apos;ACHAT ────────────────────────────────────────

  const handleOpenCreateOrder = () => {
    setOrderSupplierId("");
    setOrderDate(new Date().toISOString().split("T")[0]);
    setOrderExpectedDate("");
    setOrderStatus("ordered");
    setOrderNotes("");
    setOrderDiscount(0);
    setInitialPaymentEnabled(false);
    setInitialPaymentAmount(0);

    if (products.length > 0) {
      const p = products[0];
      setOrderItems([
        {
          productId: p.id,
          locationId: defaultLocation?.id || 1,
          quantity: 1,
          unitCost: p.costPrice || 0,
          subtotal: p.costPrice || 0,
        },
      ]);
    } else {
      setOrderItems([]);
    }

    setIsCreateOrderOpen(true);
  };

  const handleAddOrderLine = () => {
    if (products.length === 0) return;
    const p = products[0];
    setOrderItems((prev) => [
      ...prev,
      {
        productId: p.id,
        locationId: defaultLocation?.id || 1,
        quantity: 1,
        unitCost: p.costPrice || 0,
        subtotal: p.costPrice || 0,
      },
    ]);
  };

  const handleRemoveOrderLine = (index: number) => {
    if (orderItems.length <= 1) {
      showNotification("error", "La commande doit comporter au moins un article.");
      return;
    }
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleProductChange = (index: number, productId: number) => {
    const p = products.find((prod) => prod.id === productId);
    if (!p) return;
    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const unitCost = p.costPrice || 0;
        return {
          ...item,
          productId,
          unitCost,
          subtotal: item.quantity * unitCost,
        };
      })
    );
  };

  const handleQuantityChange = (index: number, qty: number) => {
    const validQty = Math.max(1, Math.floor(qty || 1));
    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          quantity: validQty,
          subtotal: validQty * item.unitCost,
        };
      })
    );
  };

  const handleUnitCostChange = (index: number, cost: number) => {
    const validCost = Math.max(0, cost || 0);
    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return {
          ...item,
          unitCost: validCost,
          subtotal: item.quantity * validCost,
        };
      })
    );
  };

  const handleLocationChange = (index: number, locationId: number) => {
    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        return { ...item, locationId };
      })
    );
  };

  const orderSubtotal = orderItems.reduce((acc, it) => acc + it.subtotal, 0);
  const orderTotal = Math.max(0, orderSubtotal - (orderDiscount || 0));

  const handleSubmitCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (orderItems.length === 0) {
      showNotification("error", "Veuillez ajouter au moins un produit à la commande.");
      return;
    }

    const payload = {
      supplierId: orderSupplierId ? Number(orderSupplierId) : null,
      purchaseDate: orderDate,
      expectedDeliveryDate: orderExpectedDate || null,
      status: orderStatus,
      notes: orderNotes,
      discount: orderDiscount,
      items: orderItems.map((it) => ({
        productId: it.productId,
        locationId: it.locationId,
        quantity: it.quantity,
        unitCost: it.unitCost,
      })),
      initialPayment:
        initialPaymentEnabled && initialPaymentAmount > 0
          ? {
              amount: initialPaymentAmount,
              method: initialPaymentMethod,
              notes: "Acompte initial à la commande",
            }
          : undefined,
    };

    startTransition(async () => {
      const res = await createPurchaseOrderAction(payload);
      if (res.success && res.data) {
        showNotification("success", res.message || "Commande créée.");
        setIsCreateOrderOpen(false);
        const createdPurchase = res.data as PrintablePurchase;
        setPrintPrompt({
          isOpen: true,
          documentTypeLabel: "Bon de commande fournisseur",
          documentReference: createdPurchase.reference,
          onConfirm: () => {
            setPrintPrompt(null);
            setShouldAutoPrint(true);
            setPrintingOrder(createdPurchase);
          },
          onCancel: () => {
            setPrintPrompt(null);
            router.refresh();
          },
        });
      } else {
        showNotification("error", res.error || "Erreur de création de commande.");
      }
    });
  };

  // ─── ACTIONS RÉCEPTION MARCHANDISES ───────────────────────────────────────

  const handleOpenReceiveModal = (purchase: PrintablePurchase) => {
    setReceivingPurchase(purchase);
    const lines = (purchase.items || []).map((pi: PrintablePurchaseItem) => {
      const remaining = Math.max(0, pi.quantity - pi.receivedQuantity);
      return {
        purchaseItemId: pi.id,
        productId: pi.productId,
        productName: pi.product?.name || `Produit #${pi.productId}`,
        orderedQty: pi.quantity,
        receivedQty: pi.receivedQuantity,
        remainingQty: remaining,
        qtyToReceive: remaining,
        locationId: pi.location?.name ? 1 : defaultLocation?.id || 1,
        updateCostPrice: false,
        unitCost: pi.unitCost,
      };
    });
    setReceiveLines(lines);
  };

  const handleSubmitReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPurchase) return;

    const itemsToReceive = receiveLines.filter((l) => l.qtyToReceive > 0);
    if (itemsToReceive.length === 0) {
      showNotification("error", "Veuillez saisir au moins une quantité supérieure à 0 à réceptionner.");
      return;
    }

    for (const it of itemsToReceive) {
      if (it.qtyToReceive > it.remainingQty) {
        showNotification(
          "error",
          `Quantité excessive pour "${it.productName}". Restant commandé : ${it.remainingQty}, saisi : ${it.qtyToReceive}.`
        );
        return;
      }
    }

    startTransition(async () => {
      const res = await receivePurchaseGoodsAction({
        purchaseId: receivingPurchase.id,
        receiptDate: new Date().toISOString(),
        items: itemsToReceive.map((it) => ({
          purchaseItemId: it.purchaseItemId,
          locationId: it.locationId,
          quantity: it.qtyToReceive,
          updateProductCostPrice: it.updateCostPrice,
        })),
      });

      if (res.success && res.data) {
        showNotification("success", res.message || "Réception effectuée.");
        const currentP = receivingPurchase;
        const receiptData = res.data as PrintablePurchaseReceipt;
        setReceivingPurchase(null);
        setPrintPrompt({
          isOpen: true,
          documentTypeLabel: "Bon de réception de marchandises",
          documentReference: receiptData.reference,
          onConfirm: () => {
            setPrintPrompt(null);
            setShouldAutoPrint(true);
            setPrintingReceipt({
              receipt: receiptData,
              purchase: currentP,
            });
          },
          onCancel: () => {
            setPrintPrompt(null);
            router.refresh();
          },
        });
      } else {
        showNotification("error", res.error || "Erreur lors de la réception.");
      }
    });
  };

  const handleOpenPrintReceipt = async (
    r: PrintablePurchaseReceipt & { purchase: PrintablePurchase }
  ) => {
    if (r.items && r.items.length > 0) {
      setPrintingReceipt({ receipt: r, purchase: r.purchase });
      return;
    }
    startTransition(async () => {
      const res = await getReceiptDetailsAction(r.id);
      if (res.success && res.data) {
        setPrintingReceipt({
          receipt: res.data as PrintablePurchaseReceipt,
          purchase:
            r.purchase ||
            (res.data as unknown as { purchase?: PrintablePurchase })?.purchase ||
            r.purchase,
        });
      } else {
        setPrintingReceipt({ receipt: r, purchase: r.purchase });
      }
    });
  };

  // ─── ACTIONS RÈGLEMENT FOURNISSEUR ─────────────────────────────────────────

  const handleOpenPaymentModal = (purchase: PrintablePurchase) => {
    setPayingPurchase(purchase);
    const balance = Math.max(0, purchase.totalAmount - purchase.paidAmount);
    setPaymentAmount(balance > 0 ? balance.toString() : "0");
    setPaymentMethod("cash");
    const defAcc = treasuryAccounts.find((a) => a.isDefault) || treasuryAccounts[0];
    setPaymentAccountId(defAcc ? defAcc.id : "");
    setPaymentNotes("");
    setPaymentDate(new Date().toISOString().split("T")[0]);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingPurchase) return;

    const parsedAmount = parseFloat(paymentAmount);
    const balance = Math.max(0, payingPurchase.totalAmount - payingPurchase.paidAmount);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showNotification("error", "Veuillez saisir un montant valide strictement supérieur à 0.");
      return;
    }

    if (parsedAmount > balance) {
      showNotification(
        "error",
        `Le montant (${formatDA(parsedAmount)}) ne peut pas excéder le solde restant dû (${formatDA(balance)}).`
      );
      return;
    }

    const fd = new FormData();
    fd.set("purchaseId", payingPurchase.id.toString());
    fd.set("amount", parsedAmount.toString());
    fd.set("method", paymentMethod);
    if (paymentAccountId) {
      fd.set("sourceAccountId", paymentAccountId.toString());
    }
    fd.set("notes", paymentNotes);
    fd.set("paymentDate", paymentDate);

    startTransition(async () => {
      const res = await recordSupplierPaymentAction(fd);
      if (res.success && res.data) {
        showNotification("success", res.message || "Règlement enregistré.");
        const currentP = payingPurchase;
        const paymentData = res.data as PrintableSupplierPayment;
        setPayingPurchase(null);
        setPrintPrompt({
          isOpen: true,
          documentTypeLabel: "Reçu de règlement fournisseur",
          documentReference: paymentData.reference,
          onConfirm: () => {
            setPrintPrompt(null);
            setShouldAutoPrint(true);
            setPrintingPayment({
              payment: paymentData,
              purchase: currentP,
            });
          },
          onCancel: () => {
            setPrintPrompt(null);
            router.refresh();
          },
        });
      } else {
        showNotification("error", res.error || "Erreur de règlement.");
      }
    });
  };

  // ─── ACTIONS ANNULATION COMMANDE ──────────────────────────────────────────

  const handleOpenCancelModal = (purchase: PrintablePurchase) => {
    setCancellingPurchase(purchase);
    setCancelReason("");
  };

  const handleConfirmCancel = async () => {
    if (!cancellingPurchase) return;
    if (!cancelReason || cancelReason.trim().length < 3) {
      showNotification("error", "Veuillez indiquer un motif d&apos;annulation d&apos;au moins 3 caractères.");
      return;
    }

    startTransition(async () => {
      const res = await cancelPurchaseOrderAction(cancellingPurchase.id, cancelReason);
      if (res.success) {
        showNotification("success", res.message || "Commande annulée avec succès.");
        setCancellingPurchase(null);
      } else {
        showNotification("error", res.error || "Erreur lors de l&apos;annulation.");
      }
    });
  };

  // ─── EXPORT EXCEL / CSV ───────────────────────────────────────────────────

  const exportSuppliersToCSV = () => {
    const headers = ["Code", "Raison Sociale", "Téléphone", "Email", "Adresse", "Achats Totaux (DA)", "Total Réglé (DA)", "Solde Dû (DA)", "Statut"];
    const rows = suppliers.map((s) => [
      s.code || "",
      `"${(s.name || "").replace(/"/g, '""')}"`,
      s.phone || "",
      s.email || "",
      `"${(s.address || "").replace(/"/g, '""')}"`,
      s.totalPurchases || 0,
      s.totalPaid || 0,
      s.outstandingBalance || 0,
      s.isActive ? "Actif" : "Inactif",
    ]);

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Fournisseurs_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPurchasesToCSV = () => {
    const headers = [
      "Référence",
      "Date",
      "Fournisseur",
      "Articles",
      "Total TTC (DA)",
      "Payé (DA)",
      "Reste Dû (DA)",
      "Statut Commande",
      "Statut Réception",
      "Statut Paiement",
    ];
    const rows = purchases.map((p) => {
      const itemsCount = p.items ? p.items.reduce((acc: number, it: PrintablePurchaseItem) => acc + it.quantity, 0) : 0;
      const balance = Math.max(0, p.totalAmount - p.paidAmount);
      return [
        p.reference,
        formatDate(p.purchaseDate),
        `"${(p.supplier?.name || "Fournisseur Comptoir").replace(/"/g, '""')}"`,
        itemsCount,
        p.totalAmount,
        p.paidAmount,
        balance,
        p.status,
        p.receiptStatus,
        p.paymentStatus,
      ];
    });

    const csvContent = "\uFEFF" + [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Commandes_Achats_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ─── FILTRES & RECHERCHE ─────────────────────────────────────────────────

  const filteredPurchases = purchases.filter((p) => {
    const matchesSearch =
      p.reference.toLowerCase().includes(searchQuery.toLowerCase()) ||
      Boolean(p.supplier?.name && p.supplier.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      Boolean(p.notes && p.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" ||
      p.status === statusFilter ||
      (statusFilter === "pending_receipt" && p.receiptStatus !== "received" && p.status !== "cancelled");

    const matchesPayment = paymentFilter === "all" || p.paymentStatus === paymentFilter;

    return matchesSearch && matchesStatus && matchesPayment;
  });

  const filteredSuppliers = suppliers.filter((s) => {
    return (
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.phone && s.phone.includes(searchQuery)) ||
      (s.code && s.code.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.address && s.address.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  const debtPurchases = purchases.filter((p) => p.status !== "cancelled" && p.totalAmount - p.paidAmount > 0);

  const allReceipts = purchases.flatMap((p) =>
    (p.receipts || []).map((r) => ({
      ...r,
      purchase: p,
    }))
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border transition-all ${
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0" />
          )}
          <span className="text-sm font-medium">{notification.text}</span>
          <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-75">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header & Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Achats & Fournisseurs</h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestion du réapprovisionnement, réceptions de stock, commandes fournisseurs et suivi des dettes.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {activeTab === "suppliers" ? (
            <>
              <button
                onClick={exportSuppliersToCSV}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Exporter Fournisseurs
              </button>
              <button
                onClick={handleOpenAddSupplier}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition"
              >
                <Plus className="h-4 w-4" />
                Nouveau Fournisseur
              </button>
            </>
          ) : (
            <>
              <button
                onClick={exportPurchasesToCSV}
                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm"
              >
                <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                Exporter Commandes
              </button>
              <button
                onClick={handleOpenCreateOrder}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition"
              >
                <Plus className="h-4 w-4" />
                Nouvelle Commande
              </button>
            </>
          )}
        </div>
      </div>

      {/* Cartes Métriques Clés */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wider text-slate-500">Total Achats</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <Truck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-black text-slate-900">{formatDA(metrics.totalPurchasesAmount)}</p>
          <span className="text-sm text-slate-500 mt-1 block">{metrics.totalOrdersCount} commandes validées</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold uppercase tracking-wider text-slate-500">Total Réglé</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <CreditCard className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl sm:text-3xl font-black text-emerald-700">{formatDA(metrics.totalPaidAmount)}</p>
          <span className="text-sm text-emerald-700 mt-1 block">Règlements décaissés</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Dettes Fournisseurs</span>
            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-rose-600">{formatDA(metrics.totalOutstandingDebt)}</p>
          <span className="text-xs text-rose-700 mt-1 block">Restant à régler aux fournisseurs</span>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Réceptions en Attente</span>
            <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <PackageCheck className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold text-amber-600">{metrics.pendingReceiptsCount}</p>
          <span className="text-xs text-amber-700 mt-1 block">Commandes en cours d&apos;acheminement</span>
        </div>
      </div>

      {/* Onglets de Navigation */}
      <div className="border-b border-slate-200">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab("orders")}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === "orders"
                ? "border-indigo-600 text-indigo-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Truck className="h-4 w-4" />
            Commandes d&apos;Achats ({purchases.length})
          </button>
          <button
            onClick={() => setActiveTab("suppliers")}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === "suppliers"
                ? "border-indigo-600 text-indigo-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Building2 className="h-4 w-4" />
            Fournisseurs ({suppliers.length})
          </button>
          <button
            onClick={() => setActiveTab("receipts")}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === "receipts"
                ? "border-indigo-600 text-indigo-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <PackageCheck className="h-4 w-4" />
            Bons de Réception ({allReceipts.length})
          </button>
          <button
            onClick={() => setActiveTab("debts")}
            className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
              activeTab === "debts"
                ? "border-indigo-600 text-indigo-600 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Wallet className="h-4 w-4" />
            Dettes Fournisseurs ({debtPurchases.length})
          </button>
        </nav>
      </div>

      {/* ─── ONGLET 1: COMMANDES D&apos;ACHATS ───────────────────────────────── */}
      {activeTab === "orders" && (
        <div className="space-y-4">
          {/* Barre de Recherche et Filtres */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par référence (BC-...), nom du fournisseur ou note..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tous les statuts</option>
              <option value="ordered">Commandées</option>
              <option value="pending_receipt">En attente de réception</option>
              <option value="partially_received">Partiellement reçues</option>
              <option value="received">Entièrement reçues</option>
              <option value="draft">Brouillons</option>
              <option value="cancelled">Annulées</option>
            </select>
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">Tous les paiements</option>
              <option value="unpaid">Non payées</option>
              <option value="partial">Partiellement payées</option>
              <option value="paid">Entièrement payées</option>
            </select>
          </div>

          {/* Tableau des Commandes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-700">
                <thead className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-700 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Référence</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Fournisseur</th>
                    <th className="py-3 px-4">Articles</th>
                    <th className="py-3 px-4 text-right">Total Commande</th>
                    <th className="py-3 px-4 text-right">Solde Dû</th>
                    <th className="py-3 px-4 text-center">Réception Stock</th>
                    <th className="py-3 px-4 text-center">Paiement</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        Aucune commande d&apos;achat trouvée.
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map((p) => {
                      const totalQty = p.items ? p.items.reduce((acc: number, it: PrintablePurchaseItem) => acc + it.quantity, 0) : 0;
                      const receivedQty = p.items ? p.items.reduce((acc: number, it: PrintablePurchaseItem) => acc + it.receivedQuantity, 0) : 0;
                      const balance = Math.max(0, p.totalAmount - p.paidAmount);

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 font-mono font-medium text-slate-900">{p.reference}</td>
                          <td className="py-3 px-4 text-slate-500">{formatDate(p.purchaseDate)}</td>
                          <td className="py-3 px-4">
                            {p.supplier ? (
                              <div>
                                <span className="font-medium text-slate-900 block">{p.supplier.name}</span>
                                {p.supplier.code && <span className="text-xs text-slate-400">{p.supplier.code}</span>}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Comptoir libre</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-slate-700 font-medium">
                              {receivedQty} / {totalQty} unités
                            </span>
                            <span className="text-xs text-slate-400 block">{p.items?.length || 0} référence(s)</span>
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-slate-900">{formatDA(p.totalAmount)}</td>
                          <td className="py-3 px-4 text-right">
                            {p.status === "cancelled" ? (
                              <span className="text-slate-400">-</span>
                            ) : balance > 0 ? (
                              <span className="font-semibold text-rose-600">{formatDA(balance)}</span>
                            ) : (
                              <span className="text-emerald-600 font-medium text-xs">Soldé</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {p.status === "cancelled" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                Annulée
                              </span>
                            ) : p.receiptStatus === "received" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                Reçue
                              </span>
                            ) : p.receiptStatus === "partial" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Partielle ({receivedQty}/{totalQty})
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                En attente
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {p.status === "cancelled" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                                -
                              </span>
                            ) : p.paymentStatus === "paid" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                                Payée
                              </span>
                            ) : p.paymentStatus === "partial" ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                                Partiel ({formatDA(p.paidAmount)})
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-800">
                                Non payée
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Bouton Imprimer Bon de Commande */}
                              <button
                                onClick={() => setPrintingOrder(p)}
                                title="Imprimer le bon de commande A4"
                                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition"
                              >
                                <Printer className="h-4 w-4" />
                              </button>

                              {/* Bouton Réceptionner Marchandises */}
                              {p.status !== "cancelled" && p.receiptStatus !== "received" && (
                                <button
                                  onClick={() => handleOpenReceiveModal(p)}
                                  title="Réceptionner des marchandises en stock"
                                  className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition"
                                >
                                  <PackageCheck className="h-4 w-4" />
                                </button>
                              )}

                              {/* Bouton Enregistrer Paiement */}
                              {p.status !== "cancelled" && balance > 0 && (
                                <button
                                  onClick={() => handleOpenPaymentModal(p)}
                                  title="Régler ce fournisseur"
                                  className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition"
                                >
                                  <Wallet className="h-4 w-4" />
                                </button>
                              )}

                              {/* Bouton Annuler */}
                              {p.status !== "cancelled" && (
                                <button
                                  onClick={() => handleOpenCancelModal(p)}
                                  title="Annuler cette commande d'achat"
                                  className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition"
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

      {/* ─── ONGLET 2: FOURNISSEURS ────────────────────────────────────────── */}
      {activeTab === "suppliers" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher un fournisseur (Nom, Réf FOU-..., Téléphone, Adresse)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <a
              href="/suppliers"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition shrink-0"
            >
              <Building2 className="h-4 w-4" />
              Grand livre & Dettes antérieures
            </a>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Raison Sociale</th>
                    <th className="py-3 px-4">Coordonnées</th>
                    <th className="py-3 px-4 text-right">Achats Cumulés</th>
                    <th className="py-3 px-4 text-right">Règlements</th>
                    <th className="py-3 px-4 text-right">Solde Dû</th>
                    <th className="py-3 px-4 text-center">Statut</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredSuppliers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-400">
                        Aucun fournisseur enregistré.
                      </td>
                    </tr>
                  ) : (
                    filteredSuppliers.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 font-mono font-medium text-slate-900">{s.code || "-"}</td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-900 block">{s.name}</span>
                          {s.notes && <span className="text-xs text-slate-400 line-clamp-1">{s.notes}</span>}
                        </td>
                        <td className="py-3 px-4">
                          <div className="text-slate-800">{s.phone || "-"}</div>
                          {s.address && <div className="text-xs text-slate-400">{s.address}</div>}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-900">{formatDA(s.totalPurchases)}</td>
                        <td className="py-3 px-4 text-right text-emerald-600 font-medium">{formatDA(s.totalPaid)}</td>
                        <td className="py-3 px-4 text-right">
                          {s.outstandingBalance > 0 ? (
                            <span className="font-bold text-rose-600">{formatDA(s.outstandingBalance)}</span>
                          ) : (
                            <span className="text-emerald-600 font-medium text-xs">À jour (0 DA)</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {s.isActive ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              Actif
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
                              Inactif
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setViewingSupplier(s)}
                              title="Consulter l'historique et les commandes"
                              className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleOpenEditSupplier(s)}
                              title="Modifier la fiche fournisseur"
                              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition"
                            >
                              <Edit2 className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleToggleSupplierStatus(s)}
                              title={s.isActive ? "Désactiver ce fournisseur" : "Activer ce fournisseur"}
                              className={`p-1.5 rounded-md transition ${
                                s.isActive
                                  ? "text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                                  : "text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50"
                              }`}
                            >
                              <Power className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteSupplier(s)}
                              title="Supprimer définitivement"
                              className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition"
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
        </div>
      )}

      {/* ─── ONGLET 3: BONS DE RÉCEPTION ───────────────────────────────────── */}
      {activeTab === "receipts" && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Réf. Réception</th>
                    <th className="py-3 px-4">Date Réception</th>
                    <th className="py-3 px-4">Commande Source</th>
                    <th className="py-3 px-4">Fournisseur</th>
                    <th className="py-3 px-4">Articles Réceptionnés</th>
                    <th className="py-3 px-4">Notes / Observation</th>
                    <th className="py-3 px-4 text-center">Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {allReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Aucun bon de réception enregistré pour le moment.
                      </td>
                    </tr>
                  ) : (
                    allReceipts.map((r) => {
                      const totalQty = (r.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0);
                      const itemsCount = (r.items || []).length;
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">{r.reference}</td>
                          <td className="py-3 px-4 text-slate-600">{formatDate(r.receiptDate)}</td>
                          <td className="py-3 px-4 font-mono font-medium text-indigo-600">{r.purchase?.reference}</td>
                          <td className="py-3 px-4 text-slate-800 font-medium">{r.purchase?.supplier?.name || "Comptoir libre"}</td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              <Package className="h-3.5 w-3.5 text-indigo-500" />
                              {itemsCount} article{itemsCount > 1 ? "s" : ""} • {totalQty} pièce{totalQty > 1 ? "s" : ""}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate" title={r.notes || undefined}>
                            {r.notes || <span className="text-slate-300">-</span>}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex items-center gap-2">
                              <button
                                onClick={() => setViewingReceipt(r)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 shadow-sm transition"
                                title="Voir les articles réceptionnés"
                              >
                                <Eye className="h-3.5 w-3.5 text-indigo-600" />
                                Détails
                              </button>
                              <button
                                onClick={() => handleOpenPrintReceipt(r)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition"
                                title="Imprimer le bon de réception"
                              >
                                <Printer className="h-3.5 w-3.5 text-slate-500" />
                                Imprimer BR
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

      {/* ─── ONGLET 4: DETTES FOURNISSEURS ─────────────────────────────────── */}
      {activeTab === "debts" && (
        <div className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-rose-900">Suivi rigoureux des créances & dettes fournisseurs</h3>
              <p className="text-xs text-rose-700 mt-0.5">
                Total des sommes restant dues aux fournisseurs pour les commandes validées.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-semibold uppercase text-rose-600 block">Total Créances</span>
              <span className="text-xl font-bold text-rose-900">{formatDA(metrics.totalOutstandingDebt)}</span>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Fournisseur</th>
                    <th className="py-3 px-4">Commande</th>
                    <th className="py-3 px-4">Date Commande</th>
                    <th className="py-3 px-4 text-right">Montant Total</th>
                    <th className="py-3 px-4 text-right">Déjà Payé</th>
                    <th className="py-3 px-4 text-right font-bold text-rose-700">Reste à Régler</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {debtPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        Toutes les commandes sont entièrement soldées. Aucune dette en cours !
                      </td>
                    </tr>
                  ) : (
                    debtPurchases.map((p) => {
                      const balance = Math.max(0, p.totalAmount - p.paidAmount);
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-4">
                            <span className="font-semibold text-slate-900 block">{p.supplier?.name || "Comptoir"}</span>
                            {p.supplier?.phone && <span className="text-xs text-slate-400">{p.supplier.phone}</span>}
                          </td>
                          <td className="py-3 px-4 font-mono font-medium text-indigo-600">{p.reference}</td>
                          <td className="py-3 px-4 text-slate-500">{formatDate(p.purchaseDate)}</td>
                          <td className="py-3 px-4 text-right font-medium text-slate-900">{formatDA(p.totalAmount)}</td>
                          <td className="py-3 px-4 text-right text-emerald-600 font-medium">{formatDA(p.paidAmount)}</td>
                          <td className="py-3 px-4 text-right font-bold text-rose-600">{formatDA(balance)}</td>
                          <td className="py-3 px-4 text-center">
                            <button
                              onClick={() => handleOpenPaymentModal(p)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition"
                            >
                              <Wallet className="h-3.5 w-3.5" />
                              Régler
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
        </div>
      )}

      {/* ─── MODAL 1: NOUVELLE COMMANDE D&apos;ACHAT ────────────────────────── */}
      {isCreateOrderOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 my-8 border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Nouvelle Commande Fournisseur</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Remplissez les lignes d&apos;articles commandés. Les stocks ne seront augmentés qu&apos;à la réception effective.
                </p>
              </div>
              <button
                onClick={() => setIsCreateOrderOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitCreateOrder} className="mt-4 space-y-5">
              {/* Entête Commande */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fournisseur</label>
                  <select
                    value={orderSupplierId}
                    onChange={(e) => setOrderSupplierId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Sélectionner un fournisseur...</option>
                    {suppliers
                      .filter((s) => s.isActive)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.code || "FOU"})
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date de Commande</label>
                  <input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Livraison Prévue</label>
                  <input
                    type="date"
                    value={orderExpectedDate}
                    onChange={(e) => setOrderExpectedDate(e.target.value)}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Lignes d'articles */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Articles Commandés</h4>
                  <button
                    type="button"
                    onClick={handleAddOrderLine}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Ajouter une ligne
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Produit</th>
                        <th className="py-2.5 px-3">Emplacement Prévu</th>
                        <th className="py-2.5 px-3 w-24">Quantité</th>
                        <th className="py-2.5 px-3 w-32">Prix Achat Unit. (DA)</th>
                        <th className="py-2.5 px-3 text-right w-32">Sous-Total</th>
                        <th className="py-2.5 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {orderItems.map((line, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2 min-w-[280px]">
                            <PurchaseArticleSearchSelector
                              products={products}
                              selectedProductId={line.productId}
                              onSelectProduct={(p) => handleProductChange(idx, p.id)}
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={line.locationId}
                              onChange={(e) => handleLocationChange(idx, Number(e.target.value))}
                              className="w-full text-xs bg-white border border-slate-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              {locations.map((loc) => (
                                <option key={loc.id} value={loc.id}>
                                  {loc.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="1"
                              step="1"
                              value={line.quantity}
                              onChange={(e) => handleQuantityChange(idx, parseInt(e.target.value, 10))}
                              className="w-full text-xs bg-white border border-slate-200 rounded px-2 py-1.5 font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              required
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={line.unitCost}
                              onChange={(e) => handleUnitCostChange(idx, parseFloat(e.target.value))}
                              className="w-full text-xs bg-white border border-slate-200 rounded px-2 py-1.5 text-right font-medium text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                              required
                            />
                          </td>
                          <td className="p-2 text-right font-semibold text-slate-900">{formatDA(line.subtotal)}</td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveOrderLine(idx)}
                              className="text-slate-400 hover:text-rose-600 transition"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Remise & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Instructions Fournisseur</label>
                  <textarea
                    rows={3}
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    placeholder="Ex: Livraison au dépôt central, conditionnement spécial..."
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="bg-slate-50 p-4 rounded-xl space-y-2 border border-slate-200">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Sous-Total Brut :</span>
                    <span className="font-semibold text-slate-900">{formatDA(orderSubtotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs text-slate-600">
                    <span>Remise / Escompte (DA) :</span>
                    <input
                      type="number"
                      min="0"
                      value={orderDiscount}
                      onChange={(e) => setOrderDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                      className="w-28 text-right text-xs bg-white border border-slate-300 rounded px-2 py-1 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold text-slate-900">
                    <span>Net à Payer (Total TTC) :</span>
                    <span className="text-indigo-600 text-base">{formatDA(orderTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Acompte / Paiement Initial */}
              <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="enableInitialPayment"
                    checked={initialPaymentEnabled}
                    onChange={(e) => setInitialPaymentEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="enableInitialPayment" className="text-xs font-semibold text-indigo-900 cursor-pointer">
                    Enregistrer un acompte ou règlement initial à la commande
                  </label>
                </div>

                {initialPaymentEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Montant Acompte (DA)</label>
                      <input
                        type="number"
                        min="1"
                        max={orderTotal}
                        value={initialPaymentAmount}
                        onChange={(e) => setInitialPaymentAmount(parseFloat(e.target.value) || 0)}
                        className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Mode de Règlement</label>
                      <select
                        value={initialPaymentMethod}
                        onChange={(e) => setInitialPaymentMethod(e.target.value as "cash" | "cib" | "check" | "transfer")}
                        className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="cash">Espèces</option>
                        <option value="transfer">Virement Bancaire</option>
                        <option value="check">Chèque</option>
                        <option value="cib">CIB / Carte</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Boutons d'action */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateOrderOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Création en cours..." : "Créer le Bon de Commande"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: AJOUTER / MODIFIER FOURNISSEUR ──────────────────────── */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                {editingSupplier ? `Modifier "${editingSupplier.name}"` : "Nouveau Fournisseur"}
              </h3>
              <button
                onClick={() => setIsSupplierModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitSupplier} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Raison Sociale / Nom du Fournisseur <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="name"
                  defaultValue={editingSupplier?.name || ""}
                  placeholder="Ex: Société Meubles d&apos;Algérie SARL"
                  required
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Numéro de Téléphone</label>
                <input
                  type="tel"
                  name="phone"
                  defaultValue={editingSupplier?.phone || ""}
                  placeholder="Ex: 0550 12 34 56"
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Adresse Email</label>
                <input
                  type="email"
                  name="email"
                  defaultValue={editingSupplier?.email || ""}
                  placeholder="contact@fournisseur.dz"
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Adresse Géographique</label>
                <input
                  type="text"
                  name="address"
                  defaultValue={editingSupplier?.address || ""}
                  placeholder="Ex: Zone Industrielle Rouiba, Alger"
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes / Conditions d&apos;achat</label>
                <textarea
                  rows={2}
                  name="notes"
                  defaultValue={editingSupplier?.notes || ""}
                  placeholder="Ex: Délais habituels 7 jours, remises 5% sur volume..."
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Enregistrement..." : editingSupplier ? "Mettre à jour" : "Créer le Fournisseur"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: RÉCEPTIONNER MARCHANDISES EN STOCK ───────────────────── */}
      {receivingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 border border-slate-100 my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Réception de Marchandises — Commande {receivingPurchase.reference}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fournisseur : <span className="font-semibold text-slate-800">{receivingPurchase.supplier?.name || "Comptoir"}</span>
                </p>
              </div>
              <button
                onClick={() => setReceivingPurchase(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitReceive} className="mt-4 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
                Indiquez les quantités effectivement réceptionnées. L&apos;entrée en stock sera enregistrée de façon atomique avec
                création automatique du mouvement d&apos;audit <span className="font-mono font-bold">RECEIPT</span>.
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Article</th>
                      <th className="py-2.5 px-3 text-center">Commandé</th>
                      <th className="py-2.5 px-3 text-center">Déjà Reçu</th>
                      <th className="py-2.5 px-3 text-center font-bold text-blue-700">Reste Attendu</th>
                      <th className="py-2.5 px-3 w-28">Quantité Reçue</th>
                      <th className="py-2.5 px-3">Emplacement Stock</th>
                      <th className="py-2.5 px-2 text-center" title="Mettre à jour le coût de revient du produit">
                        M.A.J Prix
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {receiveLines.map((line, idx) => (
                      <tr key={line.purchaseItemId} className="hover:bg-slate-50">
                        <td className="p-3 font-semibold text-slate-900">{line.productName}</td>
                        <td className="p-3 text-center text-slate-600">{line.orderedQty}</td>
                        <td className="p-3 text-center text-emerald-600 font-medium">{line.receivedQty}</td>
                        <td className="p-3 text-center font-bold text-blue-700">{line.remainingQty}</td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0"
                            max={line.remainingQty}
                            value={line.qtyToReceive}
                            disabled={line.remainingQty === 0}
                            onChange={(e) => {
                              const val = Math.max(0, parseInt(e.target.value, 10) || 0);
                              setReceiveLines((prev) =>
                                prev.map((l, i) => (i === idx ? { ...l, qtyToReceive: val } : l))
                              );
                            }}
                            className="w-full text-xs font-bold text-center bg-white border border-slate-300 rounded px-2 py-1.5 text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={line.locationId}
                            disabled={line.remainingQty === 0}
                            onChange={(e) => {
                              const locId = Number(e.target.value);
                              setReceiveLines((prev) =>
                                prev.map((l, i) => (i === idx ? { ...l, locationId: locId } : l))
                              );
                            }}
                            className="w-full text-xs bg-white border border-slate-300 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
                          >
                            {locations.map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={line.updateCostPrice}
                            disabled={line.remainingQty === 0}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setReceiveLines((prev) =>
                                prev.map((l, i) => (i === idx ? { ...l, updateCostPrice: checked } : l))
                              );
                            }}
                            className="h-3.5 w-3.5 rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReceivingPurchase(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending || receiveLines.every((l) => l.qtyToReceive === 0)}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Validation en cours..." : "Valider l'Entrée en Stock & Générer BR"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: RÈGLEMENT FOURNISSEUR ─────────────────────────────────── */}
      {payingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-900">Enregistrer un Règlement</h3>
                <p className="text-xs text-slate-500 mt-0.5">Commande : {payingPurchase.reference}</p>
              </div>
              <button
                onClick={() => setPayingPurchase(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="mt-4 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl space-y-1.5 border border-slate-200 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Fournisseur :</span>
                  <span className="font-semibold text-slate-900">{payingPurchase.supplier?.name || "Comptoir libre"}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Commande :</span>
                  <span className="font-semibold text-slate-900">{formatDA(payingPurchase.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Déjà Réglé :</span>
                  <span className="font-semibold text-emerald-600">{formatDA(payingPurchase.paidAmount)}</span>
                </div>
                <div className="border-t border-slate-200 pt-1 flex justify-between font-bold text-rose-600">
                  <span>Solde Restant Dû :</span>
                  <span>{formatDA(Math.max(0, payingPurchase.totalAmount - payingPurchase.paidAmount))}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Montant à Régler (DA) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  max={Math.max(0, payingPurchase.totalAmount - payingPurchase.paidAmount)}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  required
                  className="w-full text-base font-bold text-slate-900 bg-white border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date du Règlement</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    required
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mode de Paiement</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="cash">Espèces</option>
                    <option value="transfer">Virement</option>
                    <option value="check">Chèque</option>
                    <option value="cib">CIB / Carte</option>
                  </select>
                </div>
              </div>

              {treasuryAccounts.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Compte Source de Trésorerie <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={paymentAccountId}
                    onChange={(e) => setPaymentAccountId(e.target.value ? Number(e.target.value) : "")}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  >
                    {treasuryAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observation / Réf Chèque ou Virement</label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Ex: Chèque BNA N° 849202"
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPayingPurchase(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Validation..." : "Valider le Décaissement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 5: ANNULER COMMANDE D&apos;ACHAT ─────────────────────────── */}
      {cancellingPurchase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-rose-600">Annulation de Commande</h3>
              <button
                onClick={() => setCancellingPurchase(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                <span className="font-bold">Avertissement de réconciliation :</span>
                {cancellingPurchase.items?.some((it: PrintablePurchaseItem) => it.receivedQuantity > 0) ? (
                  <p className="mt-1">
                    Des marchandises ont déjà été réceptionnées pour cette commande. L&apos;annulation va déduire et compenser
                    automatiquement les stocks des emplacements concernés avec un mouvement d&apos;audit explicite.
                  </p>
                ) : (
                  <p className="mt-1">
                    Cette commande sera marquée comme annulée et ses paiements éventuels seront invalidés.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motif d&apos;annulation <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Ex: Rupture fournisseur, erreur de saisie, annulation convenue..."
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCancellingPurchase(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Fermer
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCancel}
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Annulation en cours..." : "Confirmer l'Annulation"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 6: DÉTAILS FOURNISSEUR (DRAWER / HISTORIQUE) ───────────── */}
      {viewingSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full p-6 border border-slate-100 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{viewingSupplier.name}</h3>
                  <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-600">
                    {viewingSupplier.code || "FOU"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tél : {viewingSupplier.phone || "Non renseigné"} • Adresse : {viewingSupplier.address || "Non renseignée"}
                </p>
              </div>
              <button
                onClick={() => setViewingSupplier(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-xs text-slate-500">Achats Cumulés</span>
                  <p className="text-base font-bold text-slate-900">{formatDA(viewingSupplier.totalPurchases)}</p>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-100">
                  <span className="text-xs text-emerald-700">Règlements Décaissés</span>
                  <p className="text-base font-bold text-emerald-700">{formatDA(viewingSupplier.totalPaid)}</p>
                </div>
                <div className="bg-rose-50 p-3 rounded-xl border border-rose-100">
                  <span className="text-xs text-rose-700">Solde Dû Fournisseur</span>
                  <p className="text-base font-bold text-rose-700">{formatDA(viewingSupplier.outstandingBalance)}</p>
                </div>
              </div>

              {/* Accès direct Relevé / Grand Livre Fournisseur */}
              <div className="flex items-center justify-between p-3.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                <div>
                  <h4 className="text-xs font-bold text-indigo-950">Compte Auxiliaire & Relevé Chronologique</h4>
                  <p className="text-[11px] text-indigo-700 mt-0.5">
                    Consultez l&apos;intégralité des mouvements (dettes antérieures, achats, décaissements), enregistrez un règlement ou une dette.
                  </p>
                </div>
                <a
                  href={`/suppliers?supplierId=${viewingSupplier.id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition shrink-0 ml-3"
                >
                  <Building2 className="h-3.5 w-3.5" />
                  Ouvrir le compte
                </a>
              </div>

              {/* Commandes rattachées à ce fournisseur */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Historique des Commandes</h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                      <tr>
                        <th className="py-2 px-3">Référence</th>
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3 text-right">Montant</th>
                        <th className="py-2 px-3 text-right">Payé</th>
                        <th className="py-2 px-3 text-center">Réception</th>
                        <th className="py-2 px-3 text-center">Paiement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {purchases
                        .filter((p) => p.supplierId === viewingSupplier.id || p.supplier?.id === viewingSupplier.id)
                        .map((p) => (
                          <tr key={p.id}>
                            <td className="py-2 px-3 font-mono font-medium text-slate-900">{p.reference}</td>
                            <td className="py-2 px-3">{formatDate(p.purchaseDate)}</td>
                            <td className="py-2 px-3 text-right font-medium text-slate-900">{formatDA(p.totalAmount)}</td>
                            <td className="py-2 px-3 text-right text-emerald-600 font-medium">{formatDA(p.paidAmount)}</td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-xs uppercase font-bold text-slate-700">{p.receiptStatus}</span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="text-xs uppercase font-bold text-slate-700">{p.paymentStatus}</span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-200">
                <button
                  onClick={() => setViewingSupplier(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DÉTAILS BON DE RÉCEPTION ─────────────────────────────────── */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 border border-slate-100 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                  <PackageCheck className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Bon de Réception <span className="font-mono text-indigo-600">{viewingReceipt.reference}</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Reçu le {formatDate(viewingReceipt.receiptDate)} • Commande source :{" "}
                    <span className="font-semibold text-slate-700">{viewingReceipt.purchase?.reference || "N/A"}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewingReceipt(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto flex-1 text-xs">
              {/* Infos Réception */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[11px] text-slate-400 block">Fournisseur</span>
                  <span className="font-semibold text-slate-800 text-sm">
                    {viewingReceipt.purchase?.supplier?.name || "Comptoir libre"}
                  </span>
                </div>
                <div>
                  <span className="text-[11px] text-slate-400 block">Statut réception</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <CheckCircle2 className="h-3 w-3" /> Réceptionné & Intégré au stock
                  </span>
                </div>
              </div>

              {/* Tableau Articles */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center justify-between">
                  <span>Articles réceptionnés</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    {(viewingReceipt.items || []).length} référence(s)
                  </span>
                </h4>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                      <tr>
                        <th className="py-2.5 px-3">Article</th>
                        <th className="py-2.5 px-3">Emplacement Stock</th>
                        <th className="py-2.5 px-3 text-right">Quantité Reçue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {(viewingReceipt.items || []).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-6 text-center text-slate-400">
                            Aucun détail d&apos;article disponible pour ce bon.
                          </td>
                        </tr>
                      ) : (
                        (viewingReceipt.items || []).map((it) => (
                          <tr key={it.id} className="hover:bg-slate-50">
                            <td className="py-2.5 px-3">
                              <span className="font-semibold text-slate-900 block">
                                {it.product?.name || (it.productId ? `Produit #${it.productId}` : "Article")}
                              </span>
                              {it.product?.sku && (
                                <span className="font-mono text-[10px] text-indigo-600 bg-indigo-50 px-1 py-0.2 rounded">
                                  {it.product.sku}
                                </span>
                              )}
                              {it.product?.model && (
                                <span className="text-[10px] text-slate-400 ml-1.5">
                                  {it.product.model}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {it.location?.name || "Entrepôt principal"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                              {it.quantity} pcs
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Observations */}
              {viewingReceipt.notes && (
                <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-200">
                  <span className="text-[11px] font-semibold text-amber-800 block mb-1">
                    Notes / Observations
                  </span>
                  <p className="text-xs text-amber-900 whitespace-pre-wrap">{viewingReceipt.notes}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <button
                onClick={() => {
                  const targetR = viewingReceipt;
                  setViewingReceipt(null);
                  handleOpenPrintReceipt(targetR as PrintablePurchaseReceipt & { purchase: PrintablePurchase });
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 shadow-sm transition"
              >
                <Printer className="h-4 w-4 text-slate-500" />
                Imprimer Bon de Réception
              </button>
              <button
                onClick={() => setViewingReceipt(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODALS D&apos;IMPRESSION A4 DOCUMENTS ACHATS ──────────────────── */}
      {printingOrder && (
        <PrintablePurchaseOrder
          purchase={printingOrder}
          settings={initialData.settings}
          onClose={() => {
            setPrintingOrder(null);
            setShouldAutoPrint(false);
            router.refresh();
          }}
          autoPrint={shouldAutoPrint}
        />
      )}

      {printingReceipt && (
        <PrintableGoodsReceipt
          receipt={printingReceipt.receipt}
          purchase={printingReceipt.purchase}
          settings={initialData.settings}
          onClose={() => {
            setPrintingReceipt(null);
            setShouldAutoPrint(false);
            router.refresh();
          }}
          autoPrint={shouldAutoPrint}
        />
      )}

      {printingPayment && (
        <PrintableSupplierPaymentReceipt
          payment={printingPayment.payment}
          purchase={printingPayment.purchase}
          settings={initialData.settings}
          onClose={() => {
            setPrintingPayment(null);
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
    </div>
  );
}
