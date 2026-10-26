"use client";

import React, { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  Plus,
  Search,
  Eye,
  Edit2,
  Calendar,
  X,
  Printer,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react";
import {
  createTreasuryTransferAction,
  updateTreasuryTransferAction,
  type TreasuryAccountData,
  type TreasuryTransferData,
} from "../treasury-actions";
import { TreasuryNavigationTabs } from "@/components/cash/TreasuryNavigationTabs";
import { formatDA, formatDateTime } from "@/components/cash/PrintableCashDocuments";

export function getEffectiveDateYMD(dInput: string | Date): string {
  const d = typeof dInput === "string" ? new Date(dInput) : dInput;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return d.toISOString().slice(0, 10);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function formatEffectiveDateDZ(dInput: string | Date): string {
  const ymd = getEffectiveDateYMD(dInput);
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

interface TransfersClientProps {
  initialTransfers: TreasuryTransferData[];
  accounts: TreasuryAccountData[];
}

export function TransfersClient({
  initialTransfers,
  accounts,
}: TransfersClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notification, setNotification] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [viewingTransfer, setViewingTransfer] = useState<TreasuryTransferData | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<TreasuryTransferData | null>(null);

  // New Transfer Form
  const [sourceAccountId, setSourceAccountId] = useState<number | "">(
    accounts.find((a) => a.isDefault)?.id || accounts[0]?.id || ""
  );
  const [destinationAccountId, setDestinationAccountId] = useState<number | "">(
    accounts.find((a) => a.type === "safe")?.id || accounts[1]?.id || ""
  );
  const [transferAmount, setTransferAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [transferMotif, setTransferMotif] = useState("");
  const [transferDate, setTransferDate] = useState(() => getEffectiveDateYMD(new Date()));
  const [transferNotes, setTransferNotes] = useState("");

  // Edit Transfer Form
  const [editFromAccountId, setEditFromAccountId] = useState<number | "">("");
  const [editToAccountId, setEditToAccountId] = useState<number | "">("");
  const [editAmount, setEditAmount] = useState("");
  const [editMethod, setEditMethod] = useState("cash");
  const [editMotif, setEditMotif] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editReason, setEditReason] = useState("");

  const showNotification = (type: "success" | "error", text: string) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 6000);
  };

  const selectedSourceAccount = accounts.find((a) => a.id === sourceAccountId);

  // Filtered & Paginated transfers
  const filteredTransfers = useMemo(() => {
    return initialTransfers.filter((t) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        t.reference.toLowerCase().includes(q) ||
        t.fromAccountName.toLowerCase().includes(q) ||
        t.toAccountName.toLowerCase().includes(q) ||
        t.motif.toLowerCase().includes(q);

      const matchesAccount =
        accountFilter === "all" ||
        t.fromAccountId.toString() === accountFilter ||
        t.toAccountId.toString() === accountFilter;

      const matchesMethod =
        methodFilter === "all" || (t.paymentMethod || "cash") === methodFilter;

      let matchesDate = true;
      const tYmd = getEffectiveDateYMD(t.date);
      if (startDate) {
        matchesDate = matchesDate && tYmd >= startDate;
      }
      if (endDate) {
        matchesDate = matchesDate && tYmd <= endDate;
      }

      return matchesSearch && matchesAccount && matchesMethod && matchesDate;
    });
  }, [initialTransfers, searchQuery, accountFilter, methodFilter, startDate, endDate]);

  const totalPages = Math.max(1, Math.ceil(filteredTransfers.length / pageSize));
  const paginatedTransfers = filteredTransfers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceAccountId || !destinationAccountId) {
      showNotification("error", "Veuillez sélectionner le compte source et le compte destination.");
      return;
    }
    const amountNum = parseFloat(transferAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showNotification("error", "Le montant doit être un nombre strictement positif en DA.");
      return;
    }
    if (!transferDate) {
      showNotification("error", "La date du mouvement est obligatoire.");
      return;
    }

    startTransition(async () => {
      const res = await createTreasuryTransferAction({
        sourceAccountId: Number(sourceAccountId),
        destinationAccountId: Number(destinationAccountId),
        amount: amountNum,
        paymentMethod,
        motif: transferMotif,
        notes: transferNotes,
        date: transferDate,
      });

      if (res.success) {
        showNotification("success", res.message || "Transfert effectué avec succès.");
        setIsCreateModalOpen(false);
        setTransferAmount("");
        setTransferMotif("");
        setTransferNotes("");
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors du transfert.");
      }
    });
  };

  const handleOpenEdit = (t: TreasuryTransferData) => {
    setEditingTransfer(t);
    setEditFromAccountId(t.fromAccountId);
    setEditToAccountId(t.toAccountId);
    setEditAmount(t.amount.toString());
    setEditMethod(t.paymentMethod || "cash");
    setEditMotif(t.motif);
    setEditDate(getEffectiveDateYMD(t.date));
    setEditNotes(t.notes || "");
    setEditReason("");
  };

  const handleUpdateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTransfer || !editFromAccountId || !editToAccountId) return;
    const amountNum = parseFloat(editAmount);
    if (isNaN(amountNum) || amountNum <= 0) {
      showNotification("error", "Le montant doit être un nombre strictement supérieur à zéro.");
      return;
    }
    if (!editDate) {
      showNotification("error", "La date du mouvement est obligatoire.");
      return;
    }

    startTransition(async () => {
      const res = await updateTreasuryTransferAction({
        transferId: editingTransfer.id,
        fromAccountId: Number(editFromAccountId),
        toAccountId: Number(editToAccountId),
        amount: amountNum,
        paymentMethod: editMethod,
        motif: editMotif,
        notes: editNotes,
        date: editDate,
        editReason,
      });

      if (res.success) {
        showNotification("success", res.message || "Transfert mis à jour.");
        setEditingTransfer(null);
        router.refresh();
      } else {
        showNotification("error", res.error || "Erreur lors de la mise à jour du transfert.");
      }
    });
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
            <ArrowLeftRight className="h-6 w-6 text-amber-500" />
            Mouvements & Virements Inter-Comptes
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Transferts internes de fonds d&apos;un compte vers un autre (Caisse → Coffre, Coffre → Banque).
          </p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition cursor-pointer"
        >
          <Plus className="h-4 w-4" />
          Nouveau Mouvement
        </button>
      </div>

      {/* Barre de filtres et recherche */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par référence (TRF-...), motif ou compte..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <select
              value={accountFilter}
              onChange={(e) => {
                setAccountFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="all">Tous les comptes</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id.toString()}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Du..."
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Au..."
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
      </div>

      {/* Table des virements */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase tracking-wider">
              <tr>
                <th className="py-3 px-4">Référence</th>
                <th className="py-3 px-4">Date du mouvement</th>
                <th className="py-3 px-4">Flux Directionnel</th>
                <th className="py-3 px-4 text-right">Montant</th>
                <th className="py-3 px-4">Mode</th>
                <th className="py-3 px-4">Observation</th>
                <th className="py-3 px-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedTransfers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 text-xs">
                    Aucun virement trouvé pour les critères sélectionnés.
                  </td>
                </tr>
              ) : (
                paginatedTransfers.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-xs">
                      {t.reference}
                      {t.sessionRef && (
                        <span className="block text-[10px] text-slate-400 font-normal">
                          Clôture {t.sessionRef}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600 text-xs">
                      <span className="font-semibold text-slate-900 block">
                        {formatEffectiveDateDZ(t.date)}
                      </span>
                      <span className="block text-[10px] text-slate-400 font-normal">
                        Saisi le : {formatDateTime(t.createdAt)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 text-xs">
                          {t.fromAccountName}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="font-bold text-slate-900 text-xs">
                          {t.toAccountName}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900 text-sm">
                      {formatDA(t.amount)}
                    </td>
                    <td className="py-3.5 px-4 text-xs capitalize">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                        {t.paymentMethod === "cash"
                          ? "Espèces"
                          : t.paymentMethod === "transfer"
                          ? "Virement"
                          : t.paymentMethod === "check"
                          ? "Chèque"
                          : "Interne"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-600 max-w-xs truncate">
                      {t.motif}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setViewingTransfer(t)}
                          title="Détails du mouvement"
                          className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(t)}
                          title="Modifier le mouvement (avec audit)"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-t border-slate-100 text-xs text-slate-600">
            <span>
              Page {currentPage} sur {totalPages} ({filteredTransfers.length} mouvements)
            </span>
            <div className="flex gap-1">
              <button
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-white border border-slate-200 rounded-md disabled:opacity-40"
              >
                Précédent
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 bg-white border border-slate-200 rounded-md disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal : Nouveau Mouvement */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowLeftRight className="h-5 w-5 text-amber-500" />
                Nouveau Virement Interne
              </h3>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTransfer} className="mt-4 space-y-4">
              {/* Direction du virement */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="grid grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                      Compte Source (Débité)
                    </label>
                    <select
                      value={sourceAccountId}
                      onChange={(e) => setSourceAccountId(Number(e.target.value))}
                      className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {accounts
                        .filter((a) => a.isActive)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({formatDA(acc.currentBalance)})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 uppercase mb-1">
                      Compte Destination (Crédité)
                    </label>
                    <select
                      value={destinationAccountId}
                      onChange={(e) => setDestinationAccountId(Number(e.target.value))}
                      className="w-full text-xs font-semibold bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {accounts
                        .filter((a) => a.isActive && a.id !== sourceAccountId)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({formatDA(acc.currentBalance)})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {selectedSourceAccount && (
                  <div className="text-[11px] text-slate-500 flex justify-between items-center pt-1 border-t border-slate-200">
                    <span>Fonds disponibles sur {selectedSourceAccount.name} :</span>
                    <strong className="font-mono text-slate-900">
                      {formatDA(selectedSourceAccount.currentBalance)}
                    </strong>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Montant du virement (DA) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="Ex: 50000"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-mono font-bold focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mode de transfert
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="cash">Espèces</option>
                    <option value="transfer">Virement Bancaire</option>
                    <option value="check">Chèque</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date du mouvement <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={transferDate}
                    onChange={(e) => setTransferDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    Date d&apos;effet comptable du mouvement
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Motif explicite <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Alimentation coffre, transfert banque..."
                    value={transferMotif}
                    onChange={(e) => setTransferMotif(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observation / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Notes ou détails supplémentaires..."
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Exécution..." : "Confirmer le Virement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Détails d'un Mouvement */}
      {viewingTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Fiche Mouvement : {viewingTransfer.reference}
              </h3>
              <button
                onClick={() => setViewingTransfer(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs text-slate-700">
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-500">Date d&apos;effet (mouvement) :</span>
                <span className="font-bold text-slate-900">
                  {formatEffectiveDateDZ(viewingTransfer.date)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-400">Date de saisie (système) :</span>
                <span className="text-slate-500 font-mono text-[11px]">
                  {formatDateTime(viewingTransfer.createdAt)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-400">Compte Source :</span>
                <span className="font-semibold text-slate-900">
                  {viewingTransfer.fromAccountName} ({viewingTransfer.fromAccountCode})
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-400">Compte Destination :</span>
                <span className="font-semibold text-slate-900">
                  {viewingTransfer.toAccountName} ({viewingTransfer.toAccountCode})
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-400">Montant transféré :</span>
                <span className="font-mono font-bold text-base text-slate-900">
                  {formatDA(viewingTransfer.amount)}
                </span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-100">
                <span className="text-slate-400">Mode de paiement :</span>
                <span className="font-medium text-slate-900 uppercase">
                  {viewingTransfer.paymentMethod || "Espèces"}
                </span>
              </div>
              <div className="py-2 border-b border-slate-100">
                <span className="text-slate-400 block mb-1">Motif :</span>
                <p className="font-medium text-slate-900 bg-slate-50 p-2 rounded-lg">
                  {viewingTransfer.motif}
                </p>
              </div>
              {viewingTransfer.notes && (
                <div className="py-2 border-b border-slate-100">
                  <span className="text-slate-400 block mb-1">Notes :</span>
                  <p className="text-slate-600 bg-slate-50 p-2 rounded-lg">{viewingTransfer.notes}</p>
                </div>
              )}

              {/* Historique d'audit des modifications si présent */}
              {viewingTransfer.editHistory && (
                <div className="mt-3 p-3 bg-amber-50/60 rounded-xl border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-900 block mb-1">
                    Journal d&apos;Audit des Modifications
                  </span>
                  <pre className="text-[10px] text-amber-800 font-mono whitespace-pre-wrap">
                    {viewingTransfer.editHistory}
                  </pre>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end pt-4 border-t border-slate-200 mt-4">
              <button
                type="button"
                onClick={() => setViewingTransfer(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal : Modifier Mouvement */}
      {editingTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-bold text-slate-900">
                Corriger le mouvement {editingTransfer.reference}
              </h3>
              <button
                onClick={() => setEditingTransfer(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateTransfer} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Compte Source</label>
                  <select
                    value={editFromAccountId}
                    onChange={(e) => setEditFromAccountId(Number(e.target.value))}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-900"
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Compte Destination</label>
                  <select
                    value={editToAccountId}
                    onChange={(e) => setEditToAccountId(Number(e.target.value))}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-slate-900"
                  >
                    {accounts
                      .filter((a) => a.id !== editFromAccountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Montant (DA)</label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full text-sm bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date du mouvement <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-800"
                  />
                  <span className="block text-[10px] text-slate-400 mt-0.5">
                    Date d&apos;effet comptable du mouvement
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Motif</label>
                <input
                  type="text"
                  required
                  value={editMotif}
                  onChange={(e) => setEditMotif(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Justification / Motif de la modification (Audit) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Correction montant saisi suite au recomptage..."
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  className="w-full text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingTransfer(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="px-5 py-2 text-xs font-bold text-slate-900 bg-amber-500 hover:bg-amber-400 rounded-lg shadow-sm transition disabled:opacity-50"
                >
                  {isPending ? "Modification..." : "Enregistrer la correction"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
