"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Landmark,
  Plus,
  Eye,
  Edit2,
  SlidersHorizontal,
  Wallet,
  ShieldCheck,
  Building2,
  X,
  Printer,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  ArrowLeftRight,
} from "lucide-react";
import {
  createTreasuryAccountAction,
  updateTreasuryAccountAction,
  adjustAccountBalanceAction,
  getAccountMovements,
  type TreasuryAccountData,
  type AccountMovementItem,
} from "../treasury-actions";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import { formatDA } from "@/components/cash/PrintableCashDocuments";

interface AccountsClientProps {
  initialAccounts: TreasuryAccountData[];
}

export function AccountsClient({ initialAccounts }: AccountsClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Modals state
  const [isNewAccountModalOpen, setIsNewAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TreasuryAccountData | null>(null);
  const [adjustingAccount, setAdjustingAccount] = useState<TreasuryAccountData | null>(null);
  const [viewingAccount, setViewingAccount] = useState<TreasuryAccountData | null>(null);

  // Account Ledger view state
  const [movementsData, setMovementsData] = useState<{
    account: TreasuryAccountData | null;
    movements: AccountMovementItem[];
    openingBalance: number;
    finalBalance: number;
  } | null>(null);
  const [isLoadingMovements, setIsLoadingMovements] = useState(false);

  // New Account Form
  const [newAccName, setNewAccName] = useState("");
  const [newAccType, setNewAccType] = useState<"cash" | "safe" | "bank" | "other">("safe");
  const [newAccOpeningBalance, setNewAccOpeningBalance] = useState("0");
  const [newAccOpeningDate, setNewAccOpeningDate] = useState(new Date().toISOString().split("T")[0]);
  const [newAccNotes, setNewAccNotes] = useState("");

  // Edit Account Form
  const [editAccName, setEditAccName] = useState("");
  const [editAccNotes, setEditAccNotes] = useState("");
  const [editAccIsActive, setEditAccIsActive] = useState(true);

  // Adjust Balance Form
  const [adjustType, setAdjustType] = useState<"increase" | "decrease">("increase");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustDate, setAdjustDate] = useState(new Date().toISOString().split("T")[0]);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("name", newAccName);
    fd.set("type", newAccType);
    fd.set("openingBalance", newAccOpeningBalance);
    fd.set("openingDate", newAccOpeningDate);
    fd.set("notes", newAccNotes);

    startTransition(async () => {
      const res = await createTreasuryAccountAction(fd);
      if (res.success) {
        showNotification("success", res.message || "Compte créé avec succès.");
        setIsNewAccountModalOpen(false);
        setNewAccName("");
        setNewAccOpeningBalance("0");
        setNewAccNotes("");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de la création.");
      }
    });
  };

  const handleOpenEdit = (acc: TreasuryAccountData) => {
    setEditingAccount(acc);
    setEditAccName(acc.name);
    setEditAccNotes(acc.notes || "");
    setEditAccIsActive(acc.isActive);
  };

  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    const fd = new FormData();
    fd.set("name", editAccName);
    fd.set("notes", editAccNotes);
    fd.set("isActive", editAccIsActive ? "true" : "false");

    startTransition(async () => {
      const res = await updateTreasuryAccountAction(editingAccount.id, fd);
      if (res.success) {
        showNotification("success", res.message || "Compte mis à jour.");
        setEditingAccount(null);
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de la mise à jour.");
      }
    });
  };

  const handleOpenAdjust = (acc: TreasuryAccountData) => {
    setAdjustingAccount(acc);
    setAdjustType("increase");
    setAdjustAmount("");
    setAdjustReason("");
    setAdjustNotes("");
    setAdjustDate(new Date().toISOString().split("T")[0]);
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingAccount) return;
    const amountNum = parseFloat(adjustAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showNotification("error", "Le montant doit être strictement supérieur à zéro.");
      return;
    }

    startTransition(async () => {
      const res = await adjustAccountBalanceAction({
        accountId: adjustingAccount.id,
        adjustmentType: adjustType,
        amount: amountNum,
        reason: adjustReason,
        notes: adjustNotes,
        date: adjustDate,
      });

      if (res.success) {
        showNotification("success", res.message || "Ajustement de solde enregistré.");
        setAdjustingAccount(null);
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de l'ajustement.");
      }
    });
  };

  const handleOpenLedger = async (acc: TreasuryAccountData) => {
    setViewingAccount(acc);
    setIsLoadingMovements(true);
    setMovementsData(null);
    try {
      const data = await getAccountMovements(acc.id);
      setMovementsData(data);
    } catch {
      showNotification("error", "Erreur lors du chargement des mouvements du compte.");
    } finally {
      setIsLoadingMovements(false);
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "cash":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            <Wallet className="h-3 w-3" /> Caisse Journalière
          </span>
        );
      case "safe":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
            <ShieldCheck className="h-3 w-3" /> Coffre-Fort
          </span>
        );
      case "bank":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            <Building2 className="h-3 w-3" /> Compte Bancaire
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            <Landmark className="h-3 w-3" /> Autre Compte
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border transition-all ${
            notification.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          {notification.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : (
            <AlertCircle className="h-5 w-5 text-rose-600" />
          )}
          <span className="text-sm font-semibold">{notification.text}</span>
        </div>
      )}

      {/* Navigation Trésorerie */}
      <TreasuryNavigationTabs />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Landmark className="h-6 w-6 text-amber-500" />
            Comptes de Trésorerie (Caisses, Coffres & Banques)
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Création, paramétrage, consultation des soldes et relevés chronologiques des comptes.
          </p>
        </div>
        <button
          onClick={() => setIsNewAccountModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nouveau Compte
        </button>
      </div>

      {/* Tableau des Comptes */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Nom du Compte</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-right">Solde Initial</th>
                <th className="py-3 px-4 text-right">Solde Calculé Actuel</th>
                <th className="py-3 px-4 text-center">Statut</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialAccounts.map((acc) => (
                <tr key={acc.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">
                    {acc.code}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{acc.name}</span>
                      {acc.isDefault && (
                        <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                          Défaut / Caisse Magasin
                        </span>
                      )}
                    </div>
                    {acc.notes && (
                      <span className="text-xs text-slate-400 block mt-0.5 line-clamp-1">
                        {acc.notes}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">{getTypeBadge(acc.type)}</td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs text-slate-600">
                    {formatDA(acc.openingBalance)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-base text-slate-900">
                    <span className={acc.currentBalance < 0 ? "text-rose-600" : "text-slate-900"}>
                      {formatDA(acc.currentBalance)}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    {acc.isActive ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                        Actif
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                        Inactif
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        onClick={() => handleOpenLedger(acc)}
                        title="Consulter le relevé détaillé (mouvements & running balance)"
                        className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(acc)}
                        title="Modifier le nom ou désactiver le compte"
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleOpenAdjust(acc)}
                        title="Ajustement de solde tracé (Audit interne)"
                        className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-md transition"
                      >
                        <SlidersHorizontal className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal : Nouveau Compte */}
      {isNewAccountModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Landmark className="h-5 w-5 text-amber-500" />
                Nouveau Compte de Trésorerie
              </h3>
              <button
                onClick={() => setIsNewAccountModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom du compte <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Caisse Journalière OEB, Coffre maison..."
                  value={newAccName}
                  onChange={(e) => setNewAccName(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Type de compte <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newAccType}
                    onChange={(e) => setNewAccType(e.target.value as "cash" | "safe" | "bank" | "other")}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="safe">Coffre-fort / Sécurité</option>
                    <option value="cash">Caisse journalière / Espèces</option>
                    <option value="bank">Compte Bancaire</option>
                    <option value="other">Autre compte de trésorerie</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Solde initial d&apos;ouverture (DA)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={newAccOpeningBalance}
                    onChange={(e) => setNewAccOpeningBalance(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Date du solde initial
                </label>
                <input
                  type="date"
                  value={newAccOpeningDate}
                  onChange={(e) => setNewAccOpeningDate(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Description / Notes d&apos;utilisation
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Coffre secondaire situé au domicile pour sécurisation hebdomadaire..."
                  value={newAccNotes}
                  onChange={(e) => setNewAccNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsNewAccountModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Création en cours..." : "Créer le Compte"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Modifier Compte */}
      {editingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Paramètres de &quot;{editingAccount.name}&quot;
              </h3>
              <button
                onClick={() => setEditingAccount(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateAccount} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nom du compte
                </label>
                <input
                  type="text"
                  required
                  value={editAccName}
                  onChange={(e) => setEditAccName(e.target.value)}
                  className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editAccNotes}
                  onChange={(e) => setEditAccNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {!editingAccount.isDefault && (
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="accIsActive"
                    checked={editAccIsActive}
                    onChange={(e) => setEditAccIsActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
                  />
                  <label htmlFor="accIsActive" className="text-xs font-semibold text-slate-800 cursor-pointer">
                    Compte actif pour de nouvelles opérations
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingAccount(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Mise à jour..." : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Ajustement de Solde Tracé (Audit) */}
      {adjustingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-amber-500" />
                Ajustement de Solde Tracé
              </h3>
              <button
                onClick={() => setAdjustingAccount(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
              <p className="font-semibold">
                Compte : {adjustingAccount.name} ({adjustingAccount.code})
              </p>
              <p>
                Solde actuel avant ajustement : <strong>{formatDA(adjustingAccount.currentBalance)}</strong>
              </p>
              <p className="text-[11px] text-amber-700">
                Chaque ajustement est consigné avec son motif dans le journal d&apos;audit pour garantir une traçabilité comptable irréprochable.
              </p>
            </div>

            <form onSubmit={handleAdjustBalance} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Sens de l&apos;ajustement <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value as "increase" | "decrease")}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 font-semibold"
                  >
                    <option value="increase">Augmenter le solde (+)</option>
                    <option value="decrease">Diminuer le solde (-)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Montant de l&apos;écart (DA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="Ex: 5000"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motif / Justification obligatoire pour l&apos;audit <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Régularisation inventaire physique coffre, correction erreur de saisie..."
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={adjustDate}
                    onChange={(e) => setAdjustDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notes complémentaires</label>
                  <input
                    type="text"
                    placeholder="Optionnel..."
                    value={adjustNotes}
                    onChange={(e) => setAdjustNotes(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAdjustingAccount(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Enregistrement..." : "Valider l'Ajustement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Drawer / Modal : Relevé de Compte Détaillé */}
      {viewingAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full p-6 border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 shrink-0">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-amber-500" />
                  Relevé Chronologique : {viewingAccount.name} ({viewingAccount.code})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Solde d&apos;ouverture : {formatDA(viewingAccount.openingBalance)} • Solde calculé en direct :{" "}
                  <strong className="text-slate-900 font-mono">{formatDA(viewingAccount.currentBalance)}</strong>
                </p>
              </div>
              <button
                onClick={() => setViewingAccount(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-4 divide-y divide-slate-100">
              {isLoadingMovements ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  Chargement des mouvements et calcul du solde progressif...
                </div>
              ) : !movementsData || movementsData.movements.length === 0 ? (
                <div className="py-16 text-center text-slate-400 text-xs">
                  Aucun mouvement enregistré pour ce compte. Seul le solde d&apos;ouverture s&apos;applique.
                </div>
              ) : (
                <table className="w-full text-left text-xs text-slate-600">
                  <thead className="bg-slate-50 text-[11px] font-semibold text-slate-700 uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Réf</th>
                      <th className="py-2.5 px-3">Nature de l&apos;opération</th>
                      <th className="py-2.5 px-3 text-right text-emerald-700">Entrée (+)</th>
                      <th className="py-2.5 px-3 text-right text-rose-700">Sortie (-)</th>
                      <th className="py-2.5 px-3 text-right font-bold text-slate-900">Solde Courant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {movementsData.movements.map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50/70">
                        <td className="py-2 px-3 text-slate-500">
                          {new Date(m.date).toLocaleDateString("fr-DZ")}
                        </td>
                        <td className="py-2 px-3 font-mono font-semibold text-slate-800">
                          {m.reference}
                        </td>
                        <td className="py-2 px-3">
                          <span className="font-medium text-slate-900 block">{m.typeLabel}</span>
                          <span className="text-[11px] text-slate-400">{m.description}</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700 font-semibold">
                          {m.inflow > 0 ? `+${formatDA(m.inflow)}` : "-"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-rose-700 font-semibold">
                          {m.outflow > 0 ? `-${formatDA(m.outflow)}` : "-"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {formatDA(m.runningBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setViewingAccount(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
