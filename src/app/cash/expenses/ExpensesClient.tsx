"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Receipt,
  Plus,
  Search,
  Calendar,
  X,
  Trash2,
  Printer,
  CheckCircle2,
  AlertCircle,
  Tag,
} from "lucide-react";
import {
  createExpenseAction,
  deleteExpenseAction,
  type CashLedgerItem,
} from "../actions";
import type { TreasuryAccountData } from "../treasury-actions";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import {
  formatDA,
  PrintableExpenseVoucher,
} from "@/components/cash/PrintableCashDocuments";

interface ExpensesClientProps {
  initialExpenses: CashLedgerItem[];
  accounts: TreasuryAccountData[];
}

export function ExpensesClient({ initialExpenses, accounts }: ExpensesClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [printingExpense, setPrintingExpense] = useState<CashLedgerItem | null>(null);

  // New Expense Form
  const [category, setCategory] = useState("transport");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [accountId, setAccountId] = useState<string>(
    accounts[0]?.id.toString() || ""
  );
  const [beneficiary, setBeneficiary] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  const selectedAccount = accounts.find((a) => a.id.toString() === accountId);

  const filteredExpenses = initialExpenses.filter((e) => {
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      e.reference.toLowerCase().includes(q) ||
      e.description.toLowerCase().includes(q) ||
      e.partyName.toLowerCase().includes(q) ||
      (e.docReference && e.docReference.toLowerCase().includes(q));

    const matchesCat = categoryFilter === "all" || e.category.toLowerCase().includes(categoryFilter.toLowerCase());
    const matchesAcc = accountFilter === "all" || (e.accountId && e.accountId.toString() === accountFilter);

    return matchesSearch && matchesCat && matchesAcc;
  });

  const totalAmount = filteredExpenses.reduce((s, e) => s + e.amount, 0);

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showNotification("error", "Le montant doit être strictement supérieur à zéro.");
      return;
    }

    if (selectedAccount && selectedAccount.currentBalance < amountNum) {
      showNotification(
        "error",
        `Fonds insuffisants sur "${selectedAccount.name}". Solde disponible : ${formatDA(
          selectedAccount.currentBalance
        )}.`
      );
      return;
    }

    const fd = new FormData();
    fd.set("type", "expense");
    fd.set("category", category);
    fd.set("description", description);
    fd.set("amount", amountNum.toString());
    fd.set("method", method);
    fd.set("accountId", accountId);
    fd.set("beneficiary", beneficiary);
    fd.set("receiptNumber", receiptNumber);
    fd.set("notes", notes);
    fd.set("date", date);

    startTransition(async () => {
      const res = await createExpenseAction(fd);
      if (res.success) {
        showNotification("success", res.message || "Charge enregistrée avec succès.");
        setIsModalOpen(false);
        setDescription("");
        setAmount("");
        setBeneficiary("");
        setReceiptNumber("");
        setNotes("");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de l'enregistrement.");
      }
    });
  };

  const handleDeleteExpense = (id: number, ref: string) => {
    if (!confirm(`Confirmez-vous la suppression de la charge ${ref} ?`)) return;
    startTransition(async () => {
      const res = await deleteExpenseAction(id);
      if (res.success) {
        showNotification("success", res.message || "Charge supprimée.");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de la suppression.");
      }
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast */}
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
            <Receipt className="h-6 w-6 text-amber-500" />
            Charges & Dépenses d&apos;Exploitation
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enregistrement et ventilation des frais d&apos;exploitation (Transport, loyer, salaires, énergie...).
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nouvelle Charge
        </button>
      </div>

      {/* Total Card */}
      <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-lg border border-slate-800 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase font-semibold text-slate-400 block tracking-wider">
            Total des Charges Répertoriées
          </span>
          <p className="text-xs text-slate-400 mt-0.5">
            Ventilées par compte débité et intégrées dans les rapports de gestion.
          </p>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-rose-400 font-mono">
            {formatDA(totalAmount)}
          </span>
        </div>
      </div>

      {/* Filtres */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par référence, libellé ou bénéficiaire..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Toutes les catégories</option>
              <option value="transport">Transport & Livraison</option>
              <option value="utilities">Électricité, Gaz & Eau</option>
              <option value="rent">Loyer & Charges locatives</option>
              <option value="maintenance">Entretien & Réparations</option>
              <option value="supplies">Fournitures & Petit matériel</option>
              <option value="salary">Salaires & Rémunérations</option>
              <option value="other">Autres charges diverses</option>
            </select>
          </div>

          <div>
            <select
              value={accountFilter}
              onChange={(e) => setAccountFilter(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tous les comptes débités</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id.toString()}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Référence</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Catégorie</th>
                <th className="py-3 px-4">Libellé / Description</th>
                <th className="py-3 px-4">Compte Débité</th>
                <th className="py-3 px-4">Bénéficiaire</th>
                <th className="py-3 px-4 text-right">Montant</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                    Aucune dépense enregistrée.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">
                      {exp.reference}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-xs">
                      {new Date(exp.date).toLocaleDateString("fr-DZ")}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-800">
                        <Tag className="h-3 w-3 text-slate-400" />
                        {exp.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-900 font-medium max-w-xs truncate">
                      {exp.description}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-slate-800">
                      {exp.accountName || "Caisse Principale"}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      {exp.partyName || "-"}
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-rose-700 text-sm">
                      -{formatDA(exp.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setPrintingExpense(exp)}
                          title="Imprimer le bon de décaissement"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition"
                        >
                          <Printer className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(exp.rawId, exp.reference)}
                          title="Supprimer la charge"
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

      {/* Modal Nouvelle Charge */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-amber-500" />
                Enregistrer une Charge d&apos;Exploitation
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Compte Débité <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                    className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    {accounts
                      .filter((a) => a.isActive)
                      .map((a) => (
                        <option key={a.id} value={a.id.toString()}>
                          {a.name} ({formatDA(a.currentBalance)})
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Catégorie de charge <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="transport">Transport & Livraison</option>
                    <option value="utilities">Électricité, Gaz & Eau</option>
                    <option value="rent">Loyer & Charges</option>
                    <option value="maintenance">Entretien & Réparations</option>
                    <option value="supplies">Fournitures & Emballages</option>
                    <option value="salary">Salaires & Main-d&apos;œuvre</option>
                    <option value="other">Autres charges diverses</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Montant de la dépense (DA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="Ex: 3500"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Mode de règlement</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="cash">Espèces</option>
                    <option value="transfer">Virement Bancaire</option>
                    <option value="check">Chèque</option>
                    <option value="cib">CIB / Carte</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Libellé / Description <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Facture carburant livraison camionnette..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bénéficiaire</label>
                  <input
                    type="text"
                    placeholder="Ex: Station Naftal"
                    value={beneficiary}
                    onChange={(e) => setBeneficiary(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">N° Pièce / Reçu</label>
                  <input
                    type="text"
                    placeholder="Ex: REC-4521"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Notes complémentaires</label>
                <textarea
                  rows={2}
                  placeholder="Notes..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Enregistrement..." : "Enregistrer la Charge"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Expense Voucher */}
      {printingExpense && (
        <PrintableExpenseVoucher
          expense={{
            id: printingExpense.rawId,
            reference: printingExpense.reference,
            type: "expense",
            category: printingExpense.category,
            description: printingExpense.description,
            amount: printingExpense.amount,
            method: printingExpense.method,
            beneficiary: printingExpense.partyName,
            receiptNumber: printingExpense.docReference || null,
            notes: printingExpense.notes || null,
            date: printingExpense.date,
          }}
          onClose={() => setPrintingExpense(null)}
        />
      )}
    </div>
  );
}
