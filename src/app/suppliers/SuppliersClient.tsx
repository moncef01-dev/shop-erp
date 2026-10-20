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
} from "lucide-react";
import {
  recordSupplierInitialDebtAction,
  recordSupplierPaymentMultiAccountAction,
  getSupplierStatement,
  type SupplierDetailsWithBalance,
  type SupplierStatementData,
} from "./actions";
import { createSupplierAction } from "@/app/purchases/actions";
import type { TreasuryAccountData } from "@/app/cash/treasury-actions";

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
  const [selectedSupplierForStatement, setSelectedSupplierForStatement] = useState<number | null>(null);
  const [statementData, setStatementData] = useState<SupplierStatementData | null>(null);
  const [isLoadingStatement, setIsLoadingStatement] = useState(false);

  // Modals state
  const [isCreateSupplierOpen, setIsCreateSupplierOpen] = useState(false);
  const [isInitialDebtOpen, setIsInitialDebtOpen] = useState(false);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  // Form states
  const [preselectedSupplierId, setPreselectedSupplierId] = useState<number | "">("");
  const [debtAmount, setDebtAmount] = useState("");
  const [debtDescription, setDebtDescription] = useState("");
  const [debtDate, setDebtDate] = useState(new Date().toISOString().split("T")[0]);
  const [debtNotes, setDebtNotes] = useState("");

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

  const filteredSuppliers = initialSuppliers.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.code && s.code.toLowerCase().includes(q)) ||
      (s.phone && s.phone.includes(q)) ||
      (s.address && s.address.toLowerCase().includes(q))
    );
  });

  // Handle open statement
  const handleOpenStatement = async (supplierId: number) => {
    setSelectedSupplierForStatement(supplierId);
    setStatementData(null);
    setIsLoadingStatement(true);
    try {
      const data = await getSupplierStatement(supplierId);
      setStatementData(data);
    } catch {
      showNotification("error", "Impossible de charger le relevé de compte.");
      setSelectedSupplierForStatement(null);
    } finally {
      setIsLoadingStatement(false);
    }
  };

  // Submit New Supplier
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

  // Submit Initial Debt
  const handleSubmitInitialDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preselectedSupplierId) {
      showNotification("error", "Veuillez sélectionner un fournisseur.");
      return;
    }
    const parsedAmount = parseFloat(debtAmount.replace(/\s/g, ""));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showNotification("error", "Veuillez saisir un montant valide strictement supérieur à 0.");
      return;
    }

    startTransition(async () => {
      const res = await recordSupplierInitialDebtAction({
        supplierId: Number(preselectedSupplierId),
        amount: parsedAmount,
        description: debtDescription.trim() || "Anciennes factures avant informatisation",
        date: debtDate,
        notes: debtNotes.trim() || undefined,
      });

      if (res.success) {
        showNotification("success", res.message || "Dette initiale enregistrée avec succès.");
        setIsInitialDebtOpen(false);
        setDebtAmount("");
        setDebtDescription("");
        setDebtNotes("");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur enregistrement dette initiale.");
      }
    });
  };

  // Submit Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!preselectedSupplierId) {
      showNotification("error", "Veuillez sélectionner un fournisseur.");
      return;
    }
    const parsedAmount = parseFloat(paymentAmount.replace(/\s/g, ""));
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      showNotification("error", "Veuillez saisir un montant valide strictement supérieur à 0.");
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
      } else {
        showNotification("error", res.error || "Erreur lors du paiement.");
      }
    });
  };

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
            Gestion du répertoire fournisseurs, suivi des dettes initiales, des achats et règlements multi-comptes.
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
              setIsInitialDebtOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg shadow-xs transition cursor-pointer"
          >
            <DollarSign className="h-4 w-4 text-amber-700" />
            Enregistrer Dette Initiale
          </button>

          <button
            onClick={() => {
              setPreselectedSupplierId(initialSuppliers[0]?.id || "");
              setIsPaymentOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg shadow-xs transition cursor-pointer"
          >
            <CreditCard className="h-4 w-4" />
            Enregistrer un Règlement
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
        <div className="bg-rose-50/70 p-4 rounded-xl border border-rose-200 shadow-xs">
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
          <p className="text-[11px] text-slate-500 mt-1">Factures achats validées</p>
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
          <p className="text-[11px] text-slate-500 mt-1">Paiements versés depuis les comptes</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
            Fournisseurs Actifs
          </span>
          <p className="text-2xl font-black font-mono text-slate-900 mt-2">
            {initialMetrics.activeSuppliersCount}{" "}
            <span className="text-sm font-normal text-slate-500">/ {initialMetrics.totalSuppliersCount}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-1">Fournisseurs répertoriés</p>
        </div>
      </div>

      {/* ─── FILTRES ET RECHERCHE ───────────────────────────────────────────── */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
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

        <div className="text-xs text-slate-500">
          {filteredSuppliers.length} fournisseur{filteredSuppliers.length > 1 ? "s" : ""} affiché{filteredSuppliers.length > 1 ? "s" : ""}
        </div>
      </div>

      {/* ─── TABLEAU DES FOURNISSEURS ──────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Fournisseur &amp; Coordonnées</th>
                <th className="py-3 px-4 text-right">Dettes Initiales</th>
                <th className="py-3 px-4 text-right">Achats ERP</th>
                <th className="py-3 px-4 text-right">Règlements</th>
                <th className="py-3 px-4 text-right">Dette En Cours</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    Aucun fournisseur trouvé.
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-700">
                      {s.code || `FOU-${s.id}`}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{s.name}</div>
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
                      {s.initialDebt > 0 ? formatDA(s.initialDebt) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {s.totalPurchases > 0 ? formatDA(s.totalPurchases) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-emerald-700">
                      {s.totalPaid > 0 ? formatDA(s.totalPaid) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {s.outstandingDebt > 0 ? (
                        <span className="font-bold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md">
                          {formatDA(s.outstandingDebt)}
                        </span>
                      ) : (
                        <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                          0 DA (Soldé)
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenStatement(s.id)}
                          className="px-2.5 py-1 text-[11px] font-bold text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition cursor-pointer"
                        >
                          Relevé
                        </button>
                        {s.outstandingDebt > 0 && (
                          <button
                            onClick={() => {
                              setPreselectedSupplierId(s.id);
                              setPaymentAmount(s.outstandingDebt.toString());
                              setIsPaymentOpen(true);
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded transition cursor-pointer"
                          >
                            Payer
                          </button>
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

      {/* ─── MODAL RELEVÉ DE COMPTE FOURNISSEUR ────────────────────────────── */}
      {selectedSupplierForStatement && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedSupplierForStatement(null);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="relative w-full max-w-4xl bg-white rounded-xl shadow-2xl p-6 max-h-[90vh] flex flex-col">
            {isLoadingStatement || !statementData ? (
              <div className="py-16 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-3 border-amber-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-semibold text-slate-600">Chargement du relevé de compte...</span>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between pb-4 border-b border-slate-200 shrink-0">
              <div>
                <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-amber-600" />
                  Relevé de Compte Auxiliaire &bull; {statementData.supplier.name}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Code: <span className="font-mono font-bold text-slate-700">{statementData.supplier.code || "—"}</span> &bull; Téléphone : {statementData.supplier.phone || "Non renseigné"}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition cursor-pointer"
                >
                  <Printer className="h-4 w-4 text-slate-500" />
                  Imprimer Relevé
                </button>
                <button
                  onClick={() => setSelectedSupplierForStatement(null)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Synthèse du compte */}
            <div className="grid grid-cols-4 gap-3 my-4 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs shrink-0">
              <div>
                <span className="text-slate-500 block">Dette Initiale :</span>
                <span className="font-mono font-bold text-slate-800">
                  {formatDA(statementData.summary.initialDebt)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Achats ERP :</span>
                <span className="font-mono font-bold text-slate-800">
                  {formatDA(statementData.summary.totalPurchases)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Règlements Versés :</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatDA(statementData.summary.totalPaid)}
                </span>
              </div>
              <div>
                <span className="text-slate-500 block">Solde Restant Dû :</span>
                <span className="font-mono font-black text-rose-700 text-sm">
                  {formatDA(statementData.summary.outstandingDebt)}
                </span>
              </div>
            </div>

            {/* Table des écritures chronologiques */}
            <div className="overflow-y-auto flex-1 border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Référence</th>
                    <th className="py-2.5 px-3">Type &amp; Libellé</th>
                    <th className="py-2.5 px-3">Compte / Mode</th>
                    <th className="py-2.5 px-3 text-right">Débit (+)</th>
                    <th className="py-2.5 px-3 text-right">Crédit (-)</th>
                    <th className="py-2.5 px-3 text-right">Solde Dû</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {statementData.events.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-slate-500">
                        Aucun mouvement enregistré pour ce fournisseur.
                      </td>
                    </tr>
                  ) : (
                    statementData.events.map((ev) => (
                      <tr key={ev.id} className="hover:bg-slate-50/80">
                        <td className="py-2 px-3 font-mono text-slate-600">
                          {new Date(ev.date).toLocaleDateString("fr-DZ")}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800">
                          {ev.reference}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-semibold text-slate-900 block">{ev.typeLabel}</span>
                          <span className="text-[11px] text-slate-500">{ev.description}</span>
                        </td>
                        <td className="py-2 px-3 text-slate-600">
                          {ev.accountName || "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-rose-700">
                          {ev.debit > 0 ? `+${formatDA(ev.debit)}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700">
                          {ev.credit > 0 ? `-${formatDA(ev.credit)}` : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {formatDA(ev.runningBalance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 mt-2 border-t border-slate-200 shrink-0">
              <button
                onClick={() => setSelectedSupplierForStatement(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                Fermer
              </button>
            </div>
            </>
            )}
          </div>
        </div>
      )}

      {/* ─── MODAL ENREGISTRER UNE DETTE INITIALE ───────────────────────────── */}
      {isInitialDebtOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setIsInitialDebtOpen(false);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-amber-600" />
                Enregistrer une Dette Initiale
              </h3>
              <button onClick={() => setIsInitialDebtOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
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
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
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
                  Montant de la Dette en DA *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  placeholder="Ex: 450000"
                  value={debtAmount}
                  onChange={(e) => setDebtAmount(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Cette écriture augmente le passif fournisseur sans générer d&apos;achat ni de flux de trésorerie.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Motif / Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Anciennes factures avant informatisation"
                  value={debtDescription}
                  onChange={(e) => setDebtDescription(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Date de la Dette
                </label>
                <input
                  type="date"
                  value={debtDate}
                  onChange={(e) => setDebtDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Notes Complémentaires (Optionnel)
                </label>
                <textarea
                  rows={2}
                  placeholder="Références des anciens bons papiers..."
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
                  {isPending ? "Enregistrement..." : "Confirmer la Dette"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL RÈGLEMENT FOURNISSEUR MULTI-COMPTES ──────────────────────── */}
      {isPaymentOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) setIsPaymentOpen(false);
          }}
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-emerald-600" />
                Enregistrer un Règlement Fournisseur
              </h3>
              <button onClick={() => setIsPaymentOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Fournisseur Bénéficiaire *
                </label>
                <select
                  required
                  value={preselectedSupplierId}
                  onChange={(e) => setPreselectedSupplierId(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">Sélectionnez un fournisseur...</option>
                  {initialSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — Dette restante : {formatDA(s.outstandingDebt)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Compte de Trésorerie Débité (Source) *
                </label>
                <select
                  required
                  value={paymentSourceAccountId}
                  onChange={(e) => setPaymentSourceAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-semibold"
                >
                  {treasuryAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.type === "cash" ? "Caisse" : acc.type === "safe" ? "Coffre" : acc.type === "bank" ? "Banque" : "Autre"}) &bull; Solde dispo : {formatDA(acc.currentBalance)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Montant en DA *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    placeholder="Ex: 200000"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Mode de Règlement
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="cash">Espèces</option>
                    <option value="transfer">Virement bancaire</option>
                    <option value="check">Chèque</option>
                    <option value="cib">CIB / Carte</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Date du Règlement
                </label>
                <input
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Notes / Référence du Règlement (Optionnel)
                </label>
                <textarea
                  rows={2}
                  placeholder="N° de chèque, bordereau de virement..."
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
                  {isPending ? "Validation..." : "Valider le Règlement"}
                </button>
              </div>
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
          <div className="relative w-full max-w-md bg-white rounded-xl shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-slate-800" />
                Nouveau Fournisseur
              </h3>
              <button onClick={() => setIsCreateSupplierOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupplier} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nom / Raison Sociale *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Société Algérienne de Bois"
                  value={newSuppName}
                  onChange={(e) => setNewSuppName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Téléphone
                  </label>
                  <input
                    type="text"
                    placeholder="0550 12 34 56"
                    value={newSuppPhone}
                    onChange={(e) => setNewSuppPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="contact@fournisseur.dz"
                    value={newSuppEmail}
                    onChange={(e) => setNewSuppEmail(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Adresse / Ville
                </label>
                <input
                  type="text"
                  placeholder="Ex: Zone industrielle Oued Smar"
                  value={newSuppAddress}
                  onChange={(e) => setNewSuppAddress(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Notes (Optionnel)
                </label>
                <textarea
                  rows={2}
                  placeholder="Conditions de paiement, contacts commerciaux..."
                  value={newSuppNotes}
                  onChange={(e) => setNewSuppNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-800"
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
