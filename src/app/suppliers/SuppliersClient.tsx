"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Plus,
  Search,
  ArrowDownRight,
  ArrowUpRight,
  Printer,
  X,
  CheckCircle2,
  AlertCircle,
  FileText,
  CreditCard,
  DollarSign,
  Phone,
  MapPin,
  Calendar,
  Landmark,
  ShieldCheck,
  Wallet,
  Receipt,
  Filter,
  RotateCcw,
} from "lucide-react";
import {
  recordSupplierInitialDebtAction,
  recordSupplierPaymentMultiAccountAction,
  recordSupplierReturnAction,
  getSupplierStatement,
  type SupplierDetailsWithBalance,
  type SupplierStatementData,
} from "./actions";
import { createSupplierAction } from "@/app/purchases/actions";
import type { TreasuryAccountData } from "@/app/cash/treasury-actions";
import { NumberInput } from "@/components/common/NumberInput";

interface SuppliersClientProps {
  initialSuppliers: SupplierDetailsWithBalance[];
  initialMetrics: {
    totalSuppliersCount: number;
    activeSuppliersCount: number;
    totalOutstandingDebt: number;
    totalPurchasesAmount: number;
    totalPaidAmount: number;
  };
  treasuryAccounts: TreasuryAccountData[];
}

export function SuppliersClient({
  initialSuppliers,
  initialMetrics,
  treasuryAccounts,
}: SuppliersClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [debtFilter, setDebtFilter] = useState<"all" | "with_debt" | "zero_debt">("all");
  const [selectedSupplierForStatement, setSelectedSupplierForStatement] = useState<number | null>(null);
  const [statementData, setStatementData] = useState<SupplierStatementData | null>(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);

  // Filtres de date pour le relevé
  const [statementStartDate, setStatementStartDate] = useState("");
  const [statementEndDate, setStatementEndDate] = useState("");

  // Modals state
  const [isCreateSupplierOpen, setIsCreateSupplierOpen] = useState(false);
  const [isInitialDebtOpen, setIsInitialDebtOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  // Form states pour Dette Initiale
  const [preselectedSupplierId, setPreselectedSupplierId] = useState<number | "">("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtDescription, setDebtDescription] = useState("");
  const [debtDate, setDebtDate] = useState(new Date().toISOString().split("T")[0]);
  const [debtNotes, setDebtNotes] = useState("");

  // Form states pour Règlement
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentSourceAccountId, setPaymentSourceAccountId] = useState(
    treasuryAccounts.find((a) => a.isDefault)?.id.toString() ||
      treasuryAccounts[0]?.id.toString() ||
      ""
  );
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentNotes, setPaymentNotes] = useState("");

  // New Supplier form
  const [newSuppName, setNewSuppName] = useState("");
  const [newSuppPhone, setNewSuppPhone] = useState("");
  const [newSuppEmail, setNewSuppEmail] = useState("");
  const [newSuppAddress, setNewSuppAddress] = useState("");
  const [newSuppNotes, setNewSuppNotes] = useState("");

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  const formatDA = (val: number) => {
    return new Intl.NumberFormat("fr-DZ", {
      style: "currency",
      currency: "DZD",
      maximumFractionDigits: 0,
    })
      .format(val)
      .replace("DZD", "DA");
  };

  // Filtrage des fournisseurs
  const filteredSuppliers = initialSuppliers.filter((s) => {
    if (debtFilter === "with_debt" && s.outstandingDebt <= 0) return false;
    if (debtFilter === "zero_debt" && s.outstandingDebt > 0) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.code && s.code.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q)) ||
      (s.address && s.address.toLowerCase().includes(q))
    );
  });

  // Charger le compte / relevé fournisseur
  const handleOpenStatement = React.useCallback(async (supplierId: number, start?: string, end?: string) => {
    setSelectedSupplierForStatement(supplierId);
    setStatementData(null);
    setIsLoadingStatement(true);
    try {
      const data = await getSupplierStatement(supplierId, {
        startDate: start || undefined,
        endDate: end || undefined,
      });
      setStatementData(data);
    } catch {
      showNotification("error", "Impossible de charger le compte fournisseur.");
      setSelectedSupplierForStatement(null);
    } finally {
      setIsLoadingStatement(false);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const sId = params.get("supplierId");
      if (sId) {
        const idNum = parseInt(sId, 10);
        if (!isNaN(idNum)) {
          handleOpenStatement(idNum);
        }
      }
    }
  }, [handleOpenStatement]);


  const handleApplyStatementDateFilter = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSupplierForStatement) {
      handleOpenStatement(selectedSupplierForStatement, statementStartDate, statementEndDate);
    }
  };

  const handleResetStatementDateFilter = () => {
    setStatementStartDate("");
    setStatementEndDate("");
    if (selectedSupplierForStatement) {
      handleOpenStatement(selectedSupplierForStatement);
    }
  };

  // Création d'un nouveau fournisseur
  const handleCreateSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("name", newSuppName);
    fd.set("phone", newSuppPhone);
    fd.set("email", newSuppEmail);
    fd.set("address", newSuppAddress);
    fd.set("notes", newSuppNotes);

    startTransition(async () => {
      const res = await createSupplierAction(fd);
      if (res.success) {
        showNotification("success", res.message || "Fournisseur créé avec succès.");
        setIsCreateSupplierOpen(false);
        setNewSuppName("");
        setNewSuppPhone("");
        setNewSuppEmail("");
        setNewSuppAddress("");
        setNewSuppNotes("");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur création fournisseur.");
      }
    });
  };

  // Enregistrer une dette antérieure
  const handleSubmitInitialDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preselectedSupplierId) {
      showNotification("error", "Veuillez sélectionner un fournisseur.");
      return;
    }
    const parsedAmount = parseFloat(debtAmount.replace(/\s/g, ""));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showNotification("error", "Veuillez saisir un montant valide strictement supérieur à 0 DA.");
      return;
    }

    startTransition(async () => {
      const res = await recordSupplierInitialDebtAction({
        supplierId: Number(preselectedSupplierId),
        amount: parsedAmount,
        description: debtDescription.trim() || "Dette antérieure report",
        date: debtDate,
        notes: debtNotes.trim() || undefined,
      });

      if (res.success) {
        showNotification("success", res.message || "Dette antérieure enregistrée avec succès.");
        setIsInitialDebtOpen(false);
        setDebtAmount("");
        setDebtDescription("");
        setDebtNotes("");
        router.refresh();

        // Si la fiche du fournisseur était ouverte, actualiser immédiatement l'historique
        if (selectedSupplierForStatement === Number(preselectedSupplierId)) {
          handleOpenStatement(Number(preselectedSupplierId));
        }
      } else {
        showNotification("error", res.error || "Erreur enregistrement dette antérieure.");
      }
    });
  };

  // Payer une dette fournisseur ou Enregistrer un retour marchandise
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preselectedSupplierId) {
      showNotification("error", "Veuillez sélectionner un fournisseur.");
      return;
    }
    const parsedAmount = parseFloat(paymentAmount.replace(/\s/g, ""));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showNotification("error", "Veuillez saisir un montant valide strictement supérieur à 0 DA.");
      return;
    }

    const isReturnMode =
      paymentSourceAccountId === "Retours" ||
      paymentSourceAccountId.toLowerCase() === "retours";

    if (isReturnMode) {
      if (selectedSupplierObj && parsedAmount > selectedSupplierObj.outstandingDebt) {
        showNotification(
          "error",
          `Le montant du retour (${formatDA(parsedAmount)}) ne peut pas dépasser la dette actuelle du fournisseur (${formatDA(selectedSupplierObj.outstandingDebt)}).`
        );
        return;
      }

      const fd = new FormData();
      fd.set("supplierId", preselectedSupplierId.toString());
      fd.set("amount", parsedAmount.toString());
      fd.set("date", paymentDate);
      fd.set("notes", paymentNotes.trim());

      startTransition(async () => {
        const res = await recordSupplierReturnAction(fd);
        if (res.success) {
          showNotification("success", res.message || "Retour fournisseur enregistré avec succès.");
          setIsPaymentOpen(false);
          setPaymentAmount("");
          setPaymentNotes("");
          router.refresh();

          if (selectedSupplierForStatement === Number(preselectedSupplierId)) {
            handleOpenStatement(Number(preselectedSupplierId));
          }
        } else {
          showNotification("error", res.error || "Erreur lors de l'enregistrement du retour.");
        }
      });
      return;
    }

    const fd = new FormData();
    fd.set("supplierId", preselectedSupplierId.toString());
    fd.set("amount", parsedAmount.toString());
    fd.set("sourceAccountId", paymentSourceAccountId);
    fd.set("method", paymentMethod);
    fd.set("paymentDate", paymentDate);
    fd.set("notes", paymentNotes.trim());

    startTransition(async () => {
      const res = await recordSupplierPaymentMultiAccountAction(fd);
      if (res.success) {
        showNotification("success", res.message || "Paiement fournisseur validé avec succès.");
        setIsPaymentOpen(false);
        setPaymentAmount("");
        setPaymentNotes("");
        router.refresh();

        // Si la fiche du fournisseur était ouverte, actualiser immédiatement l'historique
        if (selectedSupplierForStatement === Number(preselectedSupplierId)) {
          handleOpenStatement(Number(preselectedSupplierId));
        }
      } else {
        showNotification("error", res.error || "Erreur lors du paiement.");
      }
    });
  };

  const selectedSupplierObj = initialSuppliers.find((s) => s.id === Number(preselectedSupplierId));

  return (
    <div className="space-y-6">
      {/* ─── EN-TÊTE DU MODULE ──────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Building2 className="h-7 w-7 text-amber-600" />
            Comptes Fournisseurs &amp; Dettes
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestion des fiches de comptes, suivi chronologique des dettes antérieures, des achats et des règlements de trésorerie.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setIsCreateSupplierOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Nouveau Fournisseur
          </button>

          <button
            onClick={() => {
              setPreselectedSupplierId(initialSuppliers[0]?.id || "");
              setDebtAmount("");
              setDebtDescription("");
              setDebtNotes("");
              setIsInitialDebtOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg shadow-xs transition cursor-pointer"
          >
            <DollarSign className="h-4 w-4 text-amber-700" />
            Enregistrer une dette antérieure
          </button>

          <button
            onClick={() => {
              const firstWithDebt = initialSuppliers.find((s) => s.outstandingDebt > 0) || initialSuppliers[0];
              setPreselectedSupplierId(firstWithDebt?.id || "");
              setPaymentAmount(firstWithDebt && firstWithDebt.outstandingDebt > 0 ? firstWithDebt.outstandingDebt.toString() : "");
              setPaymentNotes("");
              setIsPaymentOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition cursor-pointer"
          >
            <CreditCard className="h-4 w-4" />
            Payer une dette fournisseur
          </button>
        </div>
      </div>

      {notification && (
        <div
          className={`p-3.5 rounded-lg flex items-center justify-between text-xs font-medium ${
            notification.type === "success"
              ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
              : "bg-rose-50 text-rose-900 border border-rose-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {notification.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{notification.text}</span>
          </div>
          <button
            onClick={() => setNotification(null)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ─── KPI METRICS ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-rose-50/80 p-4 rounded-xl border border-rose-200 shadow-xs">
          <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">
            Dettes Fournisseurs En Cours
          </span>
          <p className="text-2xl font-black font-mono text-rose-900 mt-2">
            {formatDA(initialMetrics.totalOutstandingDebt)}
          </p>
          <p className="text-[11px] text-rose-700 mt-1">Montant global restant dû aux fournisseurs</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Total Achats Cumulés
            </span>
            <ArrowUpRight className="h-4 w-4 text-slate-500" />
          </div>
          <p className="text-2xl font-black font-mono text-slate-900 mt-2">
            {formatDA(initialMetrics.totalPurchasesAmount)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Commandes d&apos;achats validées</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
              Total Règlements Effectués
            </span>
            <ArrowDownRight className="h-4 w-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black font-mono text-emerald-700 mt-2">
            {formatDA(initialMetrics.totalPaidAmount)}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Paiements versés depuis les comptes de trésorerie</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Fournisseurs Répertoriés
          </span>
          <p className="text-2xl font-black font-mono text-slate-900 mt-2">
            {initialMetrics.activeSuppliersCount}{" "}
            <span className="text-sm font-normal text-slate-500">/ {initialMetrics.totalSuppliersCount}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Comptes auxiliaires ouverts</p>
        </div>
      </div>

      {/* ─── FILTRES ET RECHERCHE ───────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par nom, code, téléphone..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
            <button
              onClick={() => setDebtFilter("all")}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                debtFilter === "all" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Tous ({initialSuppliers.length})
            </button>
            <button
              onClick={() => setDebtFilter("with_debt")}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                debtFilter === "with_debt"
                  ? "bg-rose-100 text-rose-900 shadow-xs"
                  : "text-slate-600 hover:text-rose-700"
              }`}
            >
              Avec dette ({initialSuppliers.filter((s) => s.outstandingDebt > 0).length})
            </button>
            <button
              onClick={() => setDebtFilter("zero_debt")}
              className={`px-3 py-1 rounded-md font-semibold transition cursor-pointer ${
                debtFilter === "zero_debt"
                  ? "bg-emerald-100 text-emerald-900 shadow-xs"
                  : "text-slate-600 hover:text-emerald-700"
              }`}
            >
              Soldés ({initialSuppliers.filter((s) => s.outstandingDebt <= 0).length})
            </button>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          {filteredSuppliers.length} fournisseur{filteredSuppliers.length > 1 ? "s" : ""} affiché{filteredSuppliers.length > 1 ? "s" : ""}
        </div>
      </div>

      {/* ─── TABLEAU DES FOURNISSEURS (AVEC LIGNES CLIQUABLES) ─────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Fournisseur &amp; Coordonnées</th>
                <th className="py-3 px-4 text-right">Achats Cumulés</th>
                <th className="py-3 px-4 text-right">Règlements Versés</th>
                <th className="py-3 px-4 text-right">Dette En Cours / Solde Dû</th>
                <th className="py-3 px-4 text-center">Dernier Règlement</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500">
                    Aucun fournisseur trouvé.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => handleOpenStatement(s.id)}
                    title="Cliquer pour ouvrir le compte fournisseur détaillé et son historique"
                    className="hover:bg-amber-50/40 transition cursor-pointer group"
                  >
                    <td className="py-3 px-4 font-mono font-bold text-slate-800">
                      {s.code || `FOU-${s.id}`}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 group-hover:text-amber-700 transition">
                        {s.name}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-3 mt-0.5">
                        {s.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {s.phone}
                          </span>
                        )}
                        {s.address && (
                          <span className="flex items-center gap-1 truncate max-w-xs">
                            <MapPin className="h-3 w-3" /> {s.address}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {s.totalPurchases > 0 ? formatDA(s.totalPurchases) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-700 font-semibold">
                      {s.totalPaid > 0 ? formatDA(s.totalPaid) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {s.outstandingDebt > 0 ? (
                        <span className="inline-block font-black text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md shadow-2xs">
                          {formatDA(s.outstandingDebt)}
                        </span>
                      ) : (s.outstandingCredit ?? 0) > 0 ? (
                        <span
                          className="inline-block font-black text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-md shadow-2xs"
                          title="Le fournisseur nous doit ce montant (crédit fournisseur / trop-perçu)"
                        >
                          +{formatDA(s.outstandingCredit!)} (Crédit)
                        </span>
                      ) : (
                        <span className="inline-block font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                          0 DA (Soldé)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600">
                      {s.lastPaymentDate ? new Date(s.lastPaymentDate).toLocaleDateString("fr-DZ") : "—"}
                    </td>
                    <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenStatement(s.id)}
                          title="Consulter le relevé et l'historique complet"
                          className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition cursor-pointer flex items-center gap-1"
                        >
                          <Landmark className="h-3 w-3 text-slate-500" />
                          Compte
                        </button>
                        <button
                          onClick={() => {
                            setPreselectedSupplierId(s.id);
                            setPaymentAmount(s.outstandingDebt > 0 ? s.outstandingDebt.toString() : "");
                            setPaymentNotes("");
                            setIsPaymentOpen(true);
                          }}
                          title={s.outstandingDebt > 0 ? "Régler la dette en cours" : "Enregistrer un règlement / acompte fournisseur"}
                          className={`px-2.5 py-1 text-[11px] font-bold text-white rounded transition cursor-pointer flex items-center gap-1 ${
                            s.outstandingDebt > 0
                              ? "bg-emerald-700 hover:bg-emerald-800"
                              : "bg-blue-600 hover:bg-blue-700"
                          }`}
                        >
                          <CreditCard className="h-3 w-3" />
                          {s.outstandingDebt > 0 ? "Payer" : "Payer / Avance"}
                        </button>
                        <button
                          onClick={() => {
                            setPreselectedSupplierId(s.id);
                            setDebtAmount("");
                            setDebtDescription("");
                            setDebtNotes("");
                            setIsInitialDebtOpen(true);
                          }}
                          title="Enregistrer une dette antérieure pour ce fournisseur"
                          className="px-2 py-1 text-[11px] font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded transition cursor-pointer"
                        >
                          + Dette
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

      {/* ─── MODAL COMPTE FOURNISSEUR DÉTAILLÉ (FICHE & HISTORIQUE) ─────────── */}
      {selectedSupplierForStatement && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedSupplierForStatement(null);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="relative w-full max-w-5xl bg-white rounded-2xl shadow-2xl p-6 max-h-[92vh] flex flex-col border border-slate-100">
            {isLoadingStatement || !statementData ? (
              <div className="py-24 flex flex-col items-center justify-center gap-3">
                <div className="w-9 h-9 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold text-slate-600">Chargement du compte fournisseur et de l&apos;historique...</span>
              </div>
            ) : (
              <>
                {/* En-tête de la fiche fournisseur */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-200 shrink-0">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                        <Building2 className="h-6 w-6 text-amber-600" />
                        {statementData.supplier.name}
                      </h3>
                      <span className="font-mono font-bold text-xs bg-slate-100 border border-slate-300 px-2 py-0.5 rounded text-slate-800">
                        {statementData.supplier.code || `FOU-${statementData.supplier.id}`}
                      </span>
                      {statementData.supplier.isActive ? (
                        <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Actif
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                          Inactif
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                      {statementData.supplier.phone && (
                        <span className="flex items-center gap-1 font-mono text-slate-700">
                          <Phone className="h-3.5 w-3.5 text-slate-400" /> {statementData.supplier.phone}
                        </span>
                      )}
                      {statementData.supplier.address && (
                        <span className="flex items-center gap-1 text-slate-600">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" /> {statementData.supplier.address}
                        </span>
                      )}
                      {statementData.supplier.notes && (
                        <span className="text-slate-400 italic">
                          &bull; {statementData.supplier.notes}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setPreselectedSupplierId(statementData.supplier.id);
                        setPaymentAmount(statementData.supplier.outstandingDebt > 0 ? statementData.supplier.outstandingDebt.toString() : "");
                        setPaymentNotes("");
                        setIsPaymentOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition cursor-pointer"
                    >
                      <CreditCard className="h-4 w-4" />
                      Payer une dette fournisseur
                    </button>

                    <button
                      onClick={() => {
                        setPreselectedSupplierId(statementData.supplier.id);
                        setDebtAmount("");
                        setDebtDescription("");
                        setDebtNotes("");
                        setIsInitialDebtOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-950 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg shadow-xs transition cursor-pointer"
                    >
                      <DollarSign className="h-4 w-4 text-amber-700" />
                      Enregistrer une dette antérieure
                    </button>

                    <button
                      onClick={() => window.print()}
                      title="Imprimer le relevé"
                      className="inline-flex items-center gap-1 p-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                    >
                      <Printer className="h-4 w-4 text-slate-600" />
                    </button>

                    <button
                      onClick={() => setSelectedSupplierForStatement(null)}
                      className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Synthèse du compte (Cartes financières) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4 shrink-0">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Dette Initiale Antérieure</span>
                    <span className="font-mono font-bold text-base text-slate-800 mt-1 block">
                      {formatDA(statementData.summary.initialDebt)}
                    </span>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Achats ERP Validés</span>
                    <span className="font-mono font-bold text-base text-slate-800 mt-1 block">
                      {formatDA(statementData.summary.totalPurchases)}
                    </span>
                  </div>
                  <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                    <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">Règlements Versés</span>
                    <span className="font-mono font-bold text-base text-emerald-700 mt-1 block">
                      {formatDA(statementData.summary.totalPaid)}
                    </span>
                  </div>
                  {statementData.summary.outstandingDebt > 0 ? (
                    <div className="bg-rose-50/90 p-3 rounded-xl border border-rose-300 shadow-2xs">
                      <span className="text-[11px] font-bold text-rose-800 uppercase tracking-wider block">Reste Dû au Fournisseur</span>
                      <span className="font-mono font-black text-lg text-rose-800 mt-1 block">
                        {formatDA(statementData.summary.outstandingDebt)}
                      </span>
                    </div>
                  ) : (statementData.summary.outstandingCredit ?? 0) > 0 ? (
                    <div className="bg-blue-50/90 p-3 rounded-xl border border-blue-300 shadow-2xs">
                      <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">Crédit Fournisseur (Il nous doit ce montant)</span>
                      <span className="font-mono font-black text-lg text-blue-800 mt-1 block">
                        +{formatDA(statementData.summary.outstandingCredit!)}
                      </span>
                    </div>
                  ) : (
                    <div className="bg-emerald-50/90 p-3 rounded-xl border border-emerald-300 shadow-2xs">
                      <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">Solde Fournisseur</span>
                      <span className="font-mono font-black text-lg text-emerald-800 mt-1 block">
                        0 DA (Soldé)
                      </span>
                    </div>
                  )}
                </div>

                {/* Filtre de date pour l'historique */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pb-3 mb-2 shrink-0">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-amber-600" />
                    Historique Chronologique des Écritures ({statementData.events.length})
                  </h4>

                  <form onSubmit={handleApplyStatementDateFilter} className="flex items-center gap-2 text-xs">
                    <input
                      type="date"
                      value={statementStartDate}
                      onChange={(e) => setStatementStartDate(e.target.value)}
                      className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <span className="text-slate-400">à</span>
                    <input
                      type="date"
                      value={statementEndDate}
                      onChange={(e) => setStatementEndDate(e.target.value)}
                      className="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 rounded transition cursor-pointer"
                    >
                      Filtrer
                    </button>
                    {(statementStartDate || statementEndDate) && (
                      <button
                        type="button"
                        onClick={handleResetStatementDateFilter}
                        className="p-1 text-slate-400 hover:text-slate-600 rounded transition cursor-pointer"
                        title="Réinitialiser"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </form>
                </div>

                {/* Table des écritures chronologiques conforme aux normes comptables */}
                <div className="overflow-y-auto flex-1 border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase sticky top-0 border-b border-slate-200 shadow-2xs">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Référence</th>
                        <th className="py-2.5 px-3">Type</th>
                        <th className="py-2.5 px-3">Description</th>
                        <th className="py-2.5 px-3 text-right text-emerald-800">Débit (-)</th>
                        <th className="py-2.5 px-3 text-right text-slate-900">Crédit (+)</th>
                        <th className="py-2.5 px-3 text-right font-black text-rose-900">Reste Dû</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {statementData.events.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-12 text-center text-slate-500">
                            Aucun mouvement enregistré pour ce fournisseur sur cette période.
                          </td>
                        </tr>
                      ) : (
                        statementData.events.map((ev) => (
                          <tr key={ev.id} className="hover:bg-slate-50/80 transition">
                            <td className="py-2.5 px-3 font-mono text-slate-600">
                              {new Date(ev.date).toLocaleDateString("fr-DZ")}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                              {ev.reference}
                            </td>
                            <td className="py-2.5 px-3">
                              {ev.type === "INITIAL_DEBT" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 text-amber-900 border border-amber-200">
                                  Dette Antérieure
                                </span>
                              )}
                              {ev.type === "PURCHASE_INVOICE" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-100 text-blue-900 border border-blue-200">
                                  Achat
                                </span>
                              )}
                              {ev.type === "PAYMENT" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-100 text-emerald-900 border border-emerald-200">
                                  Règlement Fournisseur
                                </span>
                              )}
                              {ev.type === "ADJUSTMENT" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-100 text-purple-900 border border-purple-200">
                                  Ajustement
                                </span>
                              )}
                              {ev.type === "RETURN" && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-100 text-rose-900 border border-rose-200">
                                  Retour Marchandise
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              <span className="font-medium text-slate-900 block">{ev.description}</span>
                              {ev.accountName && (
                                <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                  <Wallet className="h-3 w-3 text-slate-400" /> Compte : {ev.accountName}
                                  {ev.method && ` (${ev.method === "cash" ? "Espèces" : ev.method})`}
                                </span>
                              )}
                              {ev.notes && (
                                <span className="text-[11px] text-slate-400 italic block">{ev.notes}</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                              {ev.debit > 0 ? `-${formatDA(ev.debit)}` : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-800">
                              {ev.credit > 0 ? `+${formatDA(ev.credit)}` : "—"}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black">
                              {ev.runningBalance < 0 ? (
                                <span className="text-blue-700 font-bold" title="Crédit en notre faveur (le fournisseur nous doit ce montant)">
                                  +{formatDA(Math.abs(ev.runningBalance))} (Crédit)
                                </span>
                              ) : ev.runningBalance > 0 ? (
                                <span className="text-rose-800">
                                  {formatDA(ev.runningBalance)}
                                </span>
                              ) : (
                                <span className="text-emerald-700 font-bold">0 DA</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between pt-4 mt-3 border-t border-slate-200 shrink-0">
                  <div className="text-xs text-slate-500">
                    Débit (-) : Règlements réduisant la dette &bull; Crédit (+) : Achats et dettes initiales augmentant la dette.
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedSupplierForStatement(null)}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Fermer
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL ENREGISTRER UNE DETTE ANTERIEURE ─────────────────────────── */}
      {isInitialDebtOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setIsInitialDebtOpen(false);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-amber-600" />
                Enregistrer une dette antérieure
              </h3>
              <button
                onClick={() => setIsInitialDebtOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitInitialDebt} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Fournisseur *
                </label>
                <select
                  required
                  value={preselectedSupplierId}
                  onChange={(e) => setPreselectedSupplierId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                >
                  <option value="">Sélectionnez un fournisseur...</option>
                  {initialSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code || `FOU-${s.id}`}) — Dette actuelle : {formatDA(s.outstandingDebt)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Montant de la dette en DA *
                </label>
                <NumberInput
                  required
                  min="1"
                  step="1"
                  placeholder="Ex: 1708500"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  className="w-full font-mono font-bold text-sm"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Cette écriture augmente la dette du fournisseur sans créer d&apos;achat, de réception de marchandises ni de mouvement de trésorerie.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Motif / Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Solde dette antérieure / factures papier"
                  value={debtDescription}
                  onChange={(e) => setDebtDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Date de la dette *
                </label>
                <input
                  type="date"
                  required
                  value={debtDate}
                  onChange={(e) => setDebtDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Référence ou Note complémentaire (Optionnel)
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes, numéros des anciens bons papiers..."
                  value={debtNotes}
                  onChange={(e) => setDebtNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsInitialDebtOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-bold text-white bg-amber-700 hover:bg-amber-800 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Enregistrement..." : "Enregistrer la dette"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL PAYER UNE DETTE FOURNISSEUR ──────────────────────────────── */}
      {isPaymentOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setIsPaymentOpen(false);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-600" />
                Payer une dette fournisseur
              </h3>
              <button
                onClick={() => setIsPaymentOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Fournisseur *
                </label>
                <select
                  required
                  value={preselectedSupplierId}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    setPreselectedSupplierId(id);
                    const s = initialSuppliers.find((sup) => sup.id === id);
                    if (s && s.outstandingDebt > 0) {
                      setPaymentAmount(s.outstandingDebt.toString());
                    }
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                >
                  <option value="">Sélectionnez un fournisseur...</option>
                  {initialSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {s.outstandingDebt > 0 ? `Dette : ${formatDA(s.outstandingDebt)}` : (s.outstandingCredit ?? 0) > 0 ? `Crédit : +${formatDA(s.outstandingCredit!)}` : "Soldé (0 DA)"}
                    </option>
                  ))}
                </select>
                {selectedSupplierObj && (
                  <div className={`mt-2 p-2.5 rounded-lg flex items-center justify-between text-xs border ${
                    selectedSupplierObj.outstandingDebt > 0
                      ? "bg-rose-50 border-rose-200 text-rose-800"
                      : (selectedSupplierObj.outstandingCredit ?? 0) > 0
                      ? "bg-blue-50 border-blue-200 text-blue-800"
                      : "bg-emerald-50 border-emerald-200 text-emerald-800"
                  }`}>
                    <span className="font-semibold">
                      {selectedSupplierObj.outstandingDebt > 0
                        ? "Dette restante à régler :"
                        : (selectedSupplierObj.outstandingCredit ?? 0) > 0
                        ? "Crédit existant (le fournisseur nous doit ce montant) :"
                        : "Situation du compte :"}
                    </span>
                    <span className="font-mono font-black text-sm">
                      {selectedSupplierObj.outstandingDebt > 0
                        ? formatDA(selectedSupplierObj.outstandingDebt)
                        : (selectedSupplierObj.outstandingCredit ?? 0) > 0
                        ? `+${formatDA(selectedSupplierObj.outstandingCredit!)} (Crédit)`
                        : "0 DA (Soldé)"}
                    </span>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Compte de trésorerie source débité *
                </label>
                <select
                  required
                  value={paymentSourceAccountId}
                  onChange={(e) => setPaymentSourceAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                >
                  {treasuryAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type === "cash" ? "Caisse" : acc.type === "safe" ? "Coffre" : acc.type === "bank" ? "Banque" : "Autre"}) &bull; Solde : {formatDA(acc.currentBalance)}
                    </option>
                  ))}
                  <option value="Retours">Retours (Avoir / Déduction dette)</option>
                </select>
              </div>

              {paymentSourceAccountId === "Retours" ? (
                /* Mode Retours : Formulaire simplifié sans sélection d'articles ni gestion de stock */
                <div className="space-y-3">
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5">
                      <RotateCcw className="h-4 w-4 text-rose-700" />
                      Règlement par Retour Marchandise (Avoir)
                    </div>
                    <p className="text-[11px] text-rose-800">
                      Cette opération déduit le montant du retour de la dette fournisseur, sans impacter la trésorerie (caisse/banque) ni les stocks.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Montant du retour (DA) *
                    </label>
                    <NumberInput
                      required
                      min="1"
                      step="1"
                      placeholder="Ex: 50000"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full font-mono font-bold text-sm text-rose-900 border-rose-300 focus:ring-rose-500"
                    />
                    {selectedSupplierObj && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        Dette maximale déductible : <span className="font-semibold text-rose-700">{formatDA(selectedSupplierObj.outstandingDebt)}</span>
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Date du retour *
                    </label>
                    <input
                      type="date"
                      required
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Description ou Référence du retour (Optionnel)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Motif du retour, n° bon de retour, observation..."
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setIsPaymentOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-2 text-xs font-bold text-white bg-rose-700 hover:bg-rose-800 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isPending ? "Validation..." : "Confirmer le retour"}
                    </button>
                  </div>
                </div>
              ) : (
                /* Mode Règlement Trésorerie réel standard */
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Montant à payer (DA) *
                      </label>
                      <NumberInput
                        required
                        min="1"
                        step="1"
                        placeholder="Ex: 500000"
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        className="w-full font-mono font-bold text-sm text-emerald-800"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                        Mode de règlement *
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => setPaymentMethod(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                      >
                        <option value="cash">Espèces</option>
                        <option value="transfer">Virement bancaire</option>
                        <option value="check">Chèque</option>
                        <option value="cib">Carte CIB / Edahabia</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Date du paiement *
                    </label>
                    <input
                      type="date"
                      required
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                      Description ou Référence du paiement (Optionnel)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="N° de chèque, bordereau de virement, motif..."
                      value={paymentNotes}
                      onChange={(e) => setPaymentNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => setIsPaymentOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isPending}
                      className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
                    >
                      {isPending ? "Validation..." : "Valider le paiement"}
                    </button>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL CRÉER UN FOURNISSEUR ─────────────────────────────────────── */}
      {isCreateSupplierOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setIsCreateSupplierOpen(false);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-slate-900" />
                Nouveau Fournisseur
              </h3>
              <button
                onClick={() => setIsCreateSupplierOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nom ou Raison Sociale *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Meubles Atlas Sarl"
                  value={newSuppName}
                  onChange={(e) => setNewSuppName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Téléphone (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: 0550 12 34 56"
                  value={newSuppPhone}
                  onChange={(e) => setNewSuppPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Adresse (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Zone Industrielle, Sétif"
                  value={newSuppAddress}
                  onChange={(e) => setNewSuppAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Email (Optionnel)
                </label>
                <input
                  type="email"
                  placeholder="contact@meublesatlas.dz"
                  value={newSuppEmail}
                  onChange={(e) => setNewSuppEmail(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Spécialité, conditions commerciales..."
                  value={newSuppNotes}
                  onChange={(e) => setNewSuppNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateSupplierOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isPending ? "Création..." : "Créer le Fournisseur"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
