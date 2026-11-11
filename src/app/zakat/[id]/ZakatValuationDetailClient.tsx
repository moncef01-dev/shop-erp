"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ZakatValuationDetailData } from "../types";
import {
  approveZakatValuationAction,
  rejectZakatValuationAction,
  deleteZakatDraftAction,
  addZakatAdjustmentAction,
  removeZakatAdjustmentAction,
} from "../actions";
import { formatZakatMoney } from "../formatters";
import {
  ArrowLeft,
  Printer,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  FileText,
  Package,
  Wallet,
  Users,
  Building2,
  Coins,
  Plus,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ZakatValuationDetailClientProps {
  initialData: ZakatValuationDetailData;
}

export function ZakatValuationDetailClient({ initialData }: ZakatValuationDetailClientProps) {
  const router = useRouter();
  const [data] = useState<ZakatValuationDetailData>(initialData);
  const [activeTab, setActiveTab] = useState<
    "overview" | "items" | "adjustments" | "anomalies" | "audit"
  >("overview");
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  // Approval Modal
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [approverName, setApproverName] = useState("Direction / Gérant");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [confirmDisclaimer, setConfirmDisclaimer] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  // Rejection Modal
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isRejecting, setIsRejecting] = useState(false);

  // Delete Draft
  const [isDeleting, setIsDeleting] = useState(false);

  // Add Adjustment Modal
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjCategory, setAdjCategory] = useState("INVENTORY");
  const [adjDescription, setAdjDescription] = useState("");
  const [adjAmount, setAdjAmount] = useState<number>(0);
  const [adjType, setAdjType] = useState<"ADD" | "DEDUCT">("DEDUCT");
  const [adjReason, setAdjReason] = useState("");
  const [isSubmittingAdj, setIsSubmittingAdj] = useState(false);

  const { valuation, items, adjustments, snapshot } = data;
  const isDraft = valuation.approvalStatus === "DRAFT" || valuation.approvalStatus === "REQUIRES_REVIEW" || valuation.approvalStatus === "INCOMPLETE";

  const formatMoney = formatZakatMoney;

  const getStatusBadge = (approvalStatus: string, calcStatus: string) => {
    if (approvalStatus === "APPROVED") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
          Approuvée & Verrouillée
        </span>
      );
    }
    if (approvalStatus === "REJECTED") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
          <XCircle className="w-3.5 h-3.5 text-rose-600" />
          Rejetée
        </span>
      );
    }
    if (calcStatus === "INCOMPLETE") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
          <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
          Incomplète (Provisoire)
        </span>
      );
    }
    if (calcStatus === "REQUIRES_REVIEW" || approvalStatus === "REQUIRES_REVIEW") {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-300">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          Revue requise
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
        <FileText className="w-3.5 h-3.5 text-blue-600" />
        Brouillon
      </span>
    );
  };

  const filteredItems = items.filter((i) => {
    if (categoryFilter === "ALL") return true;
    return i.category === categoryFilter;
  });

  const handleApprove = async () => {
    setIsApproving(true);
    setApproveError(null);

    try {
      const res = await approveZakatValuationAction({
        valuationId: valuation.id,
        approverName,
        approvalNotes,
        confirmDisclaimer,
      });

      if (res.success) {
        setIsApproveModalOpen(false);
        router.refresh();
      }
    } catch (err: unknown) {
      setApproveError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    setIsRejecting(true);
    try {
      await rejectZakatValuationAction({
        valuationId: valuation.id,
        operatorName: approverName,
        rejectionReason: rejectReason,
      });
      setIsRejectModalOpen(false);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRejecting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer définitivement cette évaluation brouillon ?")) {
      return;
    }
    setIsDeleting(true);
    try {
      await deleteZakatDraftAction(valuation.id);
      router.push("/zakat");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
      setIsDeleting(false);
    }
  };

  const handleAddAdjustmentSubmit = async () => {
    setIsSubmittingAdj(true);
    try {
      await addZakatAdjustmentAction({
        valuationId: valuation.id,
        category: adjCategory,
        description: adjDescription,
        amountDZD: adjAmount,
        adjustmentType: adjType,
        reason: adjReason,
      });
      setIsAdjModalOpen(false);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmittingAdj(false);
    }
  };

  const handleRemoveAdjustment = async (adjId: number) => {
    if (!confirm("Supprimer cet ajustement ?")) return;
    try {
      await removeZakatAdjustmentAction(adjId);
      router.refresh();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 print:p-0 print:max-w-none">
      {/* ── En-tête et Actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-4 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/zakat"
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-lg text-emerald-800">
                {valuation.reference}
              </span>
              {getStatusBadge(valuation.approvalStatus, valuation.calculationStatus)}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Arrêté patrimonial au {valuation.valuationDate} • Hawl du {valuation.hawlStartDate} au {valuation.hawlEndDate}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-lg transition-colors border border-gray-200"
          >
            <Printer className="w-4 h-4" />
            Imprimer / PDF
          </button>

          {isDraft && (
            <>
              {valuation.calculationStatus !== "INCOMPLETE" && (
                <button
                  type="button"
                  onClick={() => setIsApproveModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
                >
                  <ShieldCheck className="w-4 h-4" />
                  Approuver l&apos;évaluation
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsRejectModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-gray-100 hover:bg-rose-50 text-gray-700 hover:text-rose-700 text-xs font-medium rounded-lg transition-colors border border-gray-200"
              >
                Rejeter
              </button>

              <button
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-rose-600 hover:bg-rose-50 text-xs font-medium rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Supprimer
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── En-tête imprimable (uniquement pour l'impression) ── */}
      <div className="hidden print:block border-b-2 border-gray-900 pb-4 mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black uppercase text-gray-900">
              Rapport d&apos;Évaluation de la Zakat Commerciale
            </h1>
            <p className="text-sm text-gray-600">
              Shop ERP — États financiers et patrimoniaux (Zakāt ‘Urūd al-Tijārah)
            </p>
          </div>
          <div className="text-right">
            <span className="font-mono font-bold text-lg text-emerald-800 block">
              {valuation.reference}
            </span>
            <span className="text-xs text-gray-500">Date d&apos;émission : {valuation.valuationDate}</span>
          </div>
        </div>
      </div>

      {/* ── Cartes d'indicateurs clés ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Total Actifs Confirmés
          </span>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatMoney(valuation.totalAssetsDZD)}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">
            Stock + Trésorerie + Créances + Avances
          </span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Dettes & Passifs Déductibles
          </span>
          <p className="text-2xl font-bold text-red-700 mt-1">
            - {formatMoney(valuation.manualLiabilitiesDZD)}
          </p>
          <span className="text-xs text-gray-500 mt-1 block">
            {valuation.manualLiabilitiesNote || "Passif déductible saisi par le gérant"}
          </span>
        </div>

        <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
          <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
            Assiette Imposable (Base)
          </span>
          <p className="text-2xl font-bold text-emerald-950 mt-1">
            {formatMoney(valuation.zakatableBaseDZD)}
          </p>
          <span className="text-xs text-emerald-700 mt-1 block font-medium">
            {valuation.isNisabReached ? "✓ Nisab atteint" : "✗ En dessous du Nisab"} (Seuil: {formatMoney(valuation.nisabValueDZD)})
          </span>
        </div>

        <div className="bg-emerald-700 text-white rounded-xl p-4 shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-xs font-medium text-emerald-200 uppercase tracking-wider">
              Zakat Due ({valuation.zakatYearType === "LUNAR" ? "Lunaire 2.5%" : "Solaire"})
            </span>
            <p className="text-3xl font-black mt-1">
              {formatMoney(valuation.zakatDueDZD)}
            </p>
          </div>
          <span className="text-xs text-emerald-200 mt-2 block">
            Taux : {(valuation.zakatRate * 100).toFixed(3)}%
          </span>
        </div>
      </div>

      {/* ── Navigation par Onglets ── */}
      <div className="border-b border-gray-200 flex gap-6 text-sm font-medium print:hidden">
        <button
          type="button"
          onClick={() => setActiveTab("overview")}
          className={cn(
            "pb-3 border-b-2 transition-colors",
            activeTab === "overview"
              ? "border-emerald-600 text-emerald-800 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Vue d&apos;ensemble & Synthèse
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("items")}
          className={cn(
            "pb-3 border-b-2 transition-colors",
            activeTab === "items"
              ? "border-emerald-600 text-emerald-800 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Détail des actifs ({items.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("adjustments")}
          className={cn(
            "pb-3 border-b-2 transition-colors",
            activeTab === "adjustments"
              ? "border-emerald-600 text-emerald-800 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Ajustements du gérant ({adjustments.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("anomalies")}
          className={cn(
            "pb-3 border-b-2 transition-colors",
            activeTab === "anomalies"
              ? "border-emerald-600 text-emerald-800 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Anomalies & Avertissements ({snapshot?.reconciliation.allWarnings.length ?? 0})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("audit")}
          className={cn(
            "pb-3 border-b-2 transition-colors",
            activeTab === "audit"
              ? "border-emerald-600 text-emerald-800 font-bold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          )}
        >
          Audit & Approbation
        </button>
      </div>

      {/* ── Contenu des Onglets ── */}

      {/* TAB 1: VUE D'ENSEMBLE */}
      {(activeTab === "overview" || typeof window === "undefined") && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
            <h3 className="font-bold text-gray-900 text-base">Ventilation patrimoniale réconciliée</h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 text-indigo-700 font-semibold text-xs mb-1">
                  <Package className="w-4 h-4" />
                  Marchandises en stock
                </div>
                <p className="text-xl font-bold text-gray-900">{formatMoney(valuation.totalInventoryDZD)}</p>
                <span className="text-[11px] text-gray-500 mt-1 block">Prix de revient d&apos;achat</span>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 text-emerald-700 font-semibold text-xs mb-1">
                  <Wallet className="w-4 h-4" />
                  Trésorerie & Fonds
                </div>
                <p className="text-xl font-bold text-gray-900">{formatMoney(valuation.totalTreasuryDZD)}</p>
                <span className="text-[11px] text-gray-500 mt-1 block">Caisses, coffres et banques</span>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 text-amber-700 font-semibold text-xs mb-1">
                  <Users className="w-4 h-4" />
                  Créances clients
                </div>
                <p className="text-xl font-bold text-gray-900">{formatMoney(valuation.totalReceivablesDZD)}</p>
                <span className="text-[11px] text-gray-500 mt-1 block">Restes dus clients identifiés</span>
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                <div className="flex items-center gap-2 text-blue-700 font-semibold text-xs mb-1">
                  <Building2 className="w-4 h-4" />
                  Avances fournisseurs
                </div>
                <p className="text-xl font-bold text-gray-900">{formatMoney(valuation.totalSupplierPrepaymentsDZD)}</p>
                <span className="text-[11px] text-gray-500 mt-1 block">
                  {valuation.unverifiedAssetsDZD > 0
                    ? `(${formatMoney(valuation.unverifiedAssetsDZD)} non vérifiés exclus)`
                    : "Créances sur fournisseurs"}
                </span>
              </div>
            </div>

            {/* Réconciliation Fonds clients vs Passif */}
            <div className="p-5 bg-amber-50/60 rounded-xl border border-amber-200 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-amber-950">
                <Coins className="w-4 h-4 text-amber-700" />
                Réconciliation des fonds clients (Amānāt : {formatMoney(valuation.customerFundsHeldDZD)})
              </div>
              <p className="text-amber-900 leading-relaxed">
                Les caisses contiennent {formatMoney(valuation.customerFundsHeldDZD)} appartenant aux clients.
                Statut de confirmation du gestionnaire : <strong className="font-mono bg-white px-2 py-0.5 rounded border border-amber-300">{valuation.customerFundsConfirmation}</strong>.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DÉTAIL DES ACTIFS */}
      {activeTab === "items" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden space-y-4">
          <div className="p-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold text-gray-900 text-sm">Lignes détaillées du snapshot</h3>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-gray-500">Filtrer par catégorie :</span>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="py-1 px-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none"
              >
                <option value="ALL">Toutes les catégories</option>
                <option value="INVENTORY">Marchandises en stock</option>
                <option value="TREASURY">Trésorerie</option>
                <option value="RECEIVABLE">Créances clients</option>
                <option value="SUPPLIER_PREPAYMENT">Avances fournisseurs</option>
                <option value="CUSTOMER_FUNDS">Fonds tiers (Amānāt)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-gray-700">
              <thead className="bg-gray-50 text-[10px] text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Catégorie</th>
                  <th className="py-2.5 px-4 font-semibold">Référence / SKU</th>
                  <th className="py-2.5 px-4 font-semibold">Description</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Quantité</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Valeur Unitaire</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Total Reconstitué</th>
                  <th className="py-2.5 px-4 font-semibold text-center">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/50">
                      <td className="py-2.5 px-4 font-medium text-gray-500">
                        {item.category}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-semibold text-gray-900">
                        {item.reference || "—"}
                      </td>
                      <td className="py-2.5 px-4">
                        <p className="font-medium text-gray-900">{item.description}</p>
                        {item.notes && <p className="text-[10px] text-gray-400">{item.notes}</p>}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono">
                        {item.quantity !== null && item.quantity !== undefined ? item.quantity : "—"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-gray-500">
                        {item.unitValueDZD !== null && item.unitValueDZD !== undefined
                          ? formatMoney(item.unitValueDZD)
                          : "Non renseigné"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900">
                        {formatMoney(item.totalValueDZD)}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-semibold",
                            item.status === "VERIFIED" || item.status === "CONFIRMED"
                              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                              : item.status === "UNPRICED_ANOMALY" || item.status === "NEGATIVE_BALANCE"
                              ? "bg-red-50 text-red-800 border border-red-200"
                              : "bg-amber-50 text-amber-800 border border-amber-200"
                          )}
                        >
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-gray-400 italic">
                      Aucune ligne d&apos;actif pour cette catégorie.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: AJUSTEMENTS DU GÉRANT */}
      {activeTab === "adjustments" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3">
            <div>
              <h3 className="font-bold text-gray-900 text-sm">
                Ajustements manuels audités ({adjustments.length})
              </h3>
              <p className="text-xs text-gray-500">
                Impact net sur l&apos;assiette : {formatMoney(valuation.totalAdjustmentsDZD)}
              </p>
            </div>

            {isDraft && (
              <button
                type="button"
                onClick={() => setIsAdjModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 text-white rounded-lg text-xs font-semibold hover:bg-emerald-800 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter un ajustement
              </button>
            )}
          </div>

          {adjustments.length > 0 ? (
            <div className="divide-y divide-gray-100 border border-gray-200 rounded-xl overflow-hidden">
              {adjustments.map((a) => (
                <div key={a.id} className="p-3 bg-white flex items-center justify-between text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold",
                          a.adjustmentType === "ADD"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-red-100 text-red-800"
                        )}
                      >
                        {a.adjustmentType === "ADD" ? "+ AJOUT" : "- DÉDUCTION"}
                      </span>
                      <span className="font-semibold text-gray-900">{a.description}</span>
                      <span className="text-gray-400">({a.category})</span>
                    </div>
                    <p className="text-gray-500 text-[11px] mt-0.5">Motif : {a.reason}</p>
                    <p className="text-gray-400 text-[10px]">Par {a.createdBy} le {new Date(a.createdAt).toLocaleDateString("fr-DZ")}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-gray-900">
                      {formatMoney(a.amountDZD)}
                    </span>
                    {isDraft && (
                      <button
                        type="button"
                        onClick={() => handleRemoveAdjustment(a.id)}
                        className="text-gray-400 hover:text-red-600 p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic bg-gray-50 p-6 rounded-xl text-center">
              Aucun ajustement manuel enregistré.
            </p>
          )}
        </div>
      )}

      {/* TAB 4: ANOMALIES & AVERTISSEMENTS */}
      {activeTab === "anomalies" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">
            Rapport des contrôles d&apos;intégrité et anomalies
          </h3>

          <div className="space-y-3">
            {snapshot?.reconciliation.allWarnings && snapshot.reconciliation.allWarnings.length > 0 ? (
              snapshot.reconciliation.allWarnings.map((w: string, idx: number) => (
                <div
                  key={idx}
                  className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{w}</span>
                </div>
              ))
            ) : (
              <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <span>Aucune anomalie bloquante détectée. Tous les sous-systèmes sont réconciliés.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: AUDIT & APPROBATION */}
      {activeTab === "audit" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h3 className="font-bold text-gray-900 text-sm">Journal d&apos;audit et traçabilité</h3>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-700">
            <p className="font-bold text-slate-900 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
              Notice d&apos;architecture locale sans authentification individuelle
            </p>
            <p className="text-[11px] leading-relaxed text-slate-600">
              L&apos;ERP fonctionne en monoposte local partagé sans comptes utilisateurs individuels ni mot de passe.
              Les mentions d&apos;opérateur approbateur ou de rejet sont des saisies manuelles déclaratives non vérifiées,
              consignées pour le suivi interne. La sécurité d&apos;accès dépend des protections physiques et réseau.
            </p>
          </div>

          <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs space-y-2">
            <p><strong>Identifiant interne :</strong> #{valuation.id}</p>
            <p><strong>Référence unique :</strong> {valuation.reference}</p>
            <p><strong>Créée le :</strong> {new Date(valuation.createdAt).toLocaleString("fr-DZ")}</p>
            <p><strong>Dernière mise à jour :</strong> {new Date(valuation.updatedAt).toLocaleString("fr-DZ")}</p>
            {valuation.approvedAt && (
              <>
                <p className="text-emerald-800 font-semibold">
                  <strong>Approuvée le :</strong> {new Date(valuation.approvedAt).toLocaleString("fr-DZ")} par {valuation.approvedBy}
                </p>
                {valuation.approvalNotes && <p><strong>Notes d&apos;approbation :</strong> {valuation.approvalNotes}</p>}
              </>
            )}
            {valuation.rejectedAt && (
              <p className="text-rose-800 font-semibold">
                <strong>Rejetée le :</strong> {new Date(valuation.rejectedAt).toLocaleString("fr-DZ")} par {valuation.rejectedBy} (Motif : {valuation.rejectionReason})
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Modal d'Approbation Sécurisée ── */}
      {isApproveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3">
              <div className="p-2 bg-emerald-100 text-emerald-800 rounded-lg">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">Approuver l&apos;évaluation de Zakat</h3>
                <p className="text-xs text-gray-500">Référence {valuation.reference}</p>
              </div>
            </div>

            <div className="space-y-4 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                <p className="font-semibold text-amber-950">Règle d&apos;immutabilité stricte</p>
                <p className="text-[11px] leading-relaxed">
                  L&apos;approbation verrouille définitivement cette évaluation. Les montants calculés ({formatMoney(valuation.zakatDueDZD)} de Zakat due) deviendront immuables et ne pourront plus être modifiés ou supprimés.
                </p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 space-y-1">
                <p className="font-semibold text-slate-900 text-xs flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-slate-500" />
                  Attribution manuelle déclarative (Sans authentification utilisateur)
                </p>
                <p className="text-[11px] leading-relaxed text-slate-600">
                  L&apos;ERP n&apos;intègre pas de comptes utilisateurs individuels. Le nom saisi ci-dessous est enregistré tel quel en tant que mention manuelle déclarative non vérifiée pour l&apos;audit.
                </p>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  Nom de l&apos;opérateur approbateur (Saisie manuelle déclarative)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Direction / Gérant du magasin"
                  value={approverName}
                  onChange={(e) => setApproverName(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">
                  Notes ou observations d&apos;approbation (facultatif)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Évaluation validée en assemblée d'associés..."
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg"
                />
              </div>

              {/* Engagement et disclaimer */}
              <label className="flex items-start gap-2.5 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmDisclaimer}
                  onChange={(e) => setConfirmDisclaimer(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-700 focus:ring-emerald-500"
                />
                <span className="text-gray-700 text-[11px] leading-relaxed">
                  Je confirme avoir vérifié l&apos;exactitude des passifs déductibles saisis et je reconnais que ce logiciel fournit une estimation comptable patrimoniale sans constituer une décision religieuse formelle.
                </span>
              </label>

              {approveError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                  {approveError}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsApproveModalOpen(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isApproving || !confirmDisclaimer || !approverName.trim()}
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 disabled:opacity-50 shadow-sm"
              >
                {isApproving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Verrouillage en cours...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Confirmer l&apos;approbation définitive
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal de Rejet ── */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-gray-900 text-sm">Rejeter l&apos;évaluation</h3>
            <div className="space-y-3 text-xs">
              <label className="block text-gray-700 font-semibold mb-1">
                Motif du rejet
              </label>
              <textarea
                rows={3}
                placeholder="Indiquez pourquoi cette évaluation est rejetée (ex: erreur de date de Hawl, inventaire incomplet)..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsRejectModalOpen(false)}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={isRejecting || !rejectReason.trim()}
                className="px-4 py-1.5 bg-rose-700 text-white text-xs font-semibold rounded-lg hover:bg-rose-800 disabled:opacity-50"
              >
                Confirmer le rejet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Ajout d'Ajustement ── */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <h3 className="font-bold text-gray-900 text-sm">Ajouter un ajustement manuel audité</h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-700 font-semibold mb-1">Catégorie</label>
                <select
                  value={adjCategory}
                  onChange={(e) => setAdjCategory(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                >
                  <option value="INVENTORY">Stock de marchandises</option>
                  <option value="TREASURY">Trésorerie & Fonds</option>
                  <option value="RECEIVABLES">Créances clients</option>
                  <option value="SUPPLIER_PREPAYMENTS">Avances fournisseurs</option>
                  <option value="LIABILITIES">Dettes & Charges</option>
                  <option value="OTHER">Autre ajustement patrimonial</option>
                </select>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Type d&apos;ajustement</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjType("DEDUCT")}
                    className={cn(
                      "p-2 rounded-lg border font-semibold transition-colors",
                      adjType === "DEDUCT"
                        ? "bg-red-50 border-red-500 text-red-800"
                        : "bg-white border-gray-200 text-gray-600"
                    )}
                  >
                    - Déduire de l&apos;actif
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjType("ADD")}
                    className={cn(
                      "p-2 rounded-lg border font-semibold transition-colors",
                      adjType === "ADD"
                        ? "bg-emerald-50 border-emerald-500 text-emerald-800"
                        : "bg-white border-gray-200 text-gray-600"
                    )}
                  >
                    + Ajouter à l&apos;actif
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Description</label>
                <input
                  type="text"
                  placeholder="Ex: Dépréciation stock endommagé"
                  value={adjDescription}
                  onChange={(e) => setAdjDescription(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Montant en DZD</label>
                <input
                  type="number"
                  min="0"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(Number(e.target.value))}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-gray-700 font-semibold mb-1">Motif / Justification</label>
                <textarea
                  rows={2}
                  placeholder="Justification légale ou commerciale..."
                  value={adjReason}
                  onChange={(e) => setAdjReason(e.target.value)}
                  className="w-full p-2 bg-gray-50 border border-gray-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setIsAdjModalOpen(false)}
                className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs rounded-lg hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleAddAdjustmentSubmit}
                disabled={isSubmittingAdj || !adjDescription || adjAmount <= 0 || !adjReason}
                className="px-4 py-1.5 bg-emerald-700 text-white text-xs font-semibold rounded-lg hover:bg-emerald-800 disabled:opacity-50"
              >
                Confirmer l&apos;ajustement
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

