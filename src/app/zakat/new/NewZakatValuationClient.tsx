"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  NisabStandard,
  ZakatYearType,
  CustomerFundsConfirmation,
  ZakatCalculationResult,
} from "../types";
import {
  calculateZakatPreviewAction,
  saveZakatValuationAction,
} from "../actions";
import { formatZakatMoney } from "../formatters";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Package,
  Wallet,
  Users,
  Building2,
  Coins,
  RefreshCw,
  Plus,
  Trash2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LocalAdjustment {
  id: string;
  category: string;
  description: string;
  amountDZD: number;
  adjustmentType: "ADD" | "DEDUCT";
  reason: string;
}

export function NewZakatValuationClient() {
  const router = useRouter();

  // Wizard Step (1 to 6)
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Step 1: Configuration (initialized lazily to respect React purity)
  const [valuationDate, setValuationDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [hawlStartDate, setHawlStartDate] = useState<string>(
    () => new Date(Date.now() - 354 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [hawlEndDate, setHawlEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [nisabMethod, setNisabMethod] = useState<NisabStandard>("SILVER");
  const [silverGramPriceDZD, setSilverGramPriceDZD] = useState<number>(130);
  const [goldGramPriceDZD, setGoldGramPriceDZD] = useState<number>(12500);
  const [manualNisabDZD, setManualNisabDZD] = useState<number>(77350);
  const [zakatYearType, setZakatYearType] = useState<ZakatYearType>("LUNAR");
  const [zakatRate, setZakatRate] = useState<number>(0.025);

  // Step 2 & 3: Results from engine & Confirmation
  const [isLoadingCalculation, setIsLoadingCalculation] = useState<boolean>(false);
  const [calcError, setCalcError] = useState<string | null>(null);
  const [calculationResult, setCalculationResult] = useState<ZakatCalculationResult | null>(null);
  const [customerFundsConfirmation, setCustomerFundsConfirmation] =
    useState<CustomerFundsConfirmation>("UNCONFIRMED");

  // Step 4: Liabilities & Adjustments
  const [manualLiabilitiesDZD, setManualLiabilitiesDZD] = useState<number>(0);
  const [manualLiabilitiesNote, setManualLiabilitiesNote] = useState<string>("");
  const [adjustments, setAdjustments] = useState<LocalAdjustment[]>([]);

  // Adjustment Modal
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjCategory, setAdjCategory] = useState("INVENTORY");
  const [adjDescription, setAdjDescription] = useState("");
  const [adjAmount, setAdjAmount] = useState<number>(0);
  const [adjType, setAdjType] = useState<"ADD" | "DEDUCT">("DEDUCT");
  const [adjReason, setAdjReason] = useState("");

  // Step 6: Saving
  const [valuationNotes, setValuationNotes] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const formatMoney = formatZakatMoney;

  // Run calculation preview via Phase 2 engine
  const handleRunCalculation = async () => {
    setIsLoadingCalculation(true);
    setCalcError(null);

    try {
      const res = await calculateZakatPreviewAction({
        valuationDate,
        hawlStartDate,
        hawlEndDate,
        nisabMethod,
        silverGramPriceDZD: nisabMethod === "SILVER" ? silverGramPriceDZD : undefined,
        goldGramPriceDZD: nisabMethod === "GOLD" ? goldGramPriceDZD : undefined,
        manualNisabDZD: nisabMethod === "MANUAL" ? manualNisabDZD : undefined,
        zakatYearType,
        zakatRate,
        manualLiabilitiesDZD,
        manualLiabilitiesNote,
        customerFundsConfirmation,
      });

      setCalculationResult(res);
      setCurrentStep(2);
    } catch (err: unknown) {
      setCalcError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingCalculation(false);
    }
  };

  // Re-run engine when liabilities or customer funds confirmation changes
  const handleRefreshCalculation = async (newConfirm?: CustomerFundsConfirmation, newLiab?: number) => {
    setIsLoadingCalculation(true);
    try {
      const res = await calculateZakatPreviewAction({
        valuationDate,
        hawlStartDate,
        hawlEndDate,
        nisabMethod,
        silverGramPriceDZD: nisabMethod === "SILVER" ? silverGramPriceDZD : undefined,
        goldGramPriceDZD: nisabMethod === "GOLD" ? goldGramPriceDZD : undefined,
        manualNisabDZD: nisabMethod === "MANUAL" ? manualNisabDZD : undefined,
        zakatYearType,
        zakatRate,
        manualLiabilitiesDZD: newLiab !== undefined ? newLiab : manualLiabilitiesDZD,
        manualLiabilitiesNote,
        customerFundsConfirmation: newConfirm !== undefined ? newConfirm : customerFundsConfirmation,
      });
      setCalculationResult(res);
    } catch (err: unknown) {
      setCalcError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoadingCalculation(false);
    }
  };

  // Adjustment handlers
  const handleAddAdjustment = () => {
    if (!adjDescription || adjAmount <= 0 || !adjReason) return;

    const newAdj: LocalAdjustment = {
      id: Math.random().toString(36).substring(2, 9),
      category: adjCategory,
      description: adjDescription,
      amountDZD: adjAmount,
      adjustmentType: adjType,
      reason: adjReason,
    };

    setAdjustments([...adjustments, newAdj]);
    setIsAdjModalOpen(false);
    setAdjDescription("");
    setAdjAmount(0);
    setAdjReason("");
  };

  const handleRemoveAdjustment = (id: string) => {
    setAdjustments(adjustments.filter((a) => a.id !== id));
  };

  // Computations with local adjustments
  const netAdjustments = adjustments.reduce((acc, a) => {
    return acc + (a.adjustmentType === "ADD" ? a.amountDZD : -a.amountDZD);
  }, 0);

  const confirmedAssets = calculationResult?.assets.confirmedAssetsDZD ?? 0;
  const currentBase = Math.max(0, confirmedAssets + netAdjustments - manualLiabilitiesDZD);
  const nisabThreshold = calculationResult?.nisab.thresholdDZD ?? 77350;
  const isNisabReached = currentBase >= nisabThreshold;
  const finalZakatDue = isNisabReached ? Math.round(currentBase * zakatRate) : 0;

  // Final Save Handler
  const handleSaveValuation = async () => {
    if (!calculationResult) return;
    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await saveZakatValuationAction({
        valuationDate,
        hawlStartDate,
        hawlEndDate,
        nisabMethod,
        nisabValueDZD: nisabThreshold,
        nisabGoldPriceDZD: nisabMethod === "GOLD" ? goldGramPriceDZD : null,
        nisabSilverPriceDZD: nisabMethod === "SILVER" ? silverGramPriceDZD : null,
        zakatRate,
        zakatYearType,
        inventoryValuationMethod: "COST",
        manualLiabilitiesDZD,
        manualLiabilitiesNote,
        customerFundsConfirmation,
        notes: valuationNotes,
        calculationResult,
        adjustments: adjustments.map((a) => ({
          category: a.category,
          description: a.description,
          amountDZD: a.amountDZD,
          adjustmentType: a.adjustmentType,
          reason: a.reason,
        })),
      });

      if (res.success) {
        router.push(`/zakat/${res.valuationId}`);
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : String(err));
      setIsSaving(false);
    }
  };

  const steps = [
    { num: 1, title: "Configuration", desc: "Dates, Nisab & Taux" },
    { num: 2, title: "Calcul des Actifs", desc: "Moteur historique Phase 2" },
    { num: 3, title: "Anomalies & Revue", desc: "Contrôles d'intégrité" },
    { num: 4, title: "Passif & Ajustements", desc: "Dettes déductibles" },
    { num: 5, title: "Synthèse", desc: "Assiette et montant" },
    { num: 6, title: "Enregistrement", desc: "Sauvegarde du snapshot" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* ── En-tête et Fil d'Ariane ── */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-4">
        <div className="flex items-center gap-3">
          <Link
            href="/zakat"
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Nouvelle évaluation de la Zakat commerciale
            </h1>
            <p className="text-xs text-gray-500">
              Assistant guidé étape par étape conforme aux règles comptables et religieuses
            </p>
          </div>
        </div>
      </div>

      {/* ── Indicateur des étapes ── */}
      <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {steps.map((s) => {
            const isActive = currentStep === s.num;
            const isDone = currentStep > s.num;
            return (
              <div
                key={s.num}
                className={cn(
                  "p-2.5 rounded-lg border text-xs transition-colors",
                  isActive
                    ? "bg-emerald-50 border-emerald-300 text-emerald-900 font-semibold"
                    : isDone
                    ? "bg-gray-50 border-gray-200 text-gray-700"
                    : "bg-white border-transparent text-gray-400"
                )}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  <span
                    className={cn(
                      "w-4 h-4 rounded-full flex items-center justify-center text-[10px]",
                      isActive
                        ? "bg-emerald-700 text-white"
                        : isDone
                        ? "bg-emerald-200 text-emerald-800"
                        : "bg-gray-200 text-gray-600"
                    )}
                  >
                    {isDone ? "✓" : s.num}
                  </span>
                  <span className="truncate">{s.title}</span>
                </div>
                <p className="text-[10px] text-gray-500 truncate">{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Contenu de l'étape active ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
        {/* ========================================================================= */}
        {/* ÉTAPE 1 : CONFIGURATION */}
        {/* ========================================================================= */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div className="border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">Étape 1 : Paramétrage de l&apos;évaluation</h2>
              <p className="text-xs text-gray-500">
                Définissez la date de valorisation, la période du Hawl et le référentiel de calcul
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Date de valorisation (Cutoff T)
                </label>
                <input
                  type="date"
                  value={valuationDate}
                  onChange={(e) => setValuationDate(e.target.value)}
                  className="w-full text-sm p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[10px] text-gray-500">Date à laquelle le patrimoine est arrêté</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Début de la période (Hawl)
                </label>
                <input
                  type="date"
                  value={hawlStartDate}
                  onChange={(e) => setHawlStartDate(e.target.value)}
                  className="w-full text-sm p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Fin de la période (Hawl)
                </label>
                <input
                  type="date"
                  value={hawlEndDate}
                  onChange={(e) => setHawlEndDate(e.target.value)}
                  className="w-full text-sm p-2.5 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Référentiel du Nisab */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
              <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Référentiel du seuil de Nisab
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer flex flex-col justify-between text-xs transition-colors",
                    nisabMethod === "SILVER"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-medium"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">Nisab Argent (595g)</span>
                    <input
                      type="radio"
                      name="nisab"
                      checked={nisabMethod === "SILVER"}
                      onChange={() => setNisabMethod("SILVER")}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500">Recommandé par la majorité des juristes contemporains</span>
                </label>

                <label
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer flex flex-col justify-between text-xs transition-colors",
                    nisabMethod === "GOLD"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-medium"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">Nisab Or (85g)</span>
                    <input
                      type="radio"
                      name="nisab"
                      checked={nisabMethod === "GOLD"}
                      onChange={() => setNisabMethod("GOLD")}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500">Seuil basé sur 85 grammes d&apos;or pur</span>
                </label>

                <label
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer flex flex-col justify-between text-xs transition-colors",
                    nisabMethod === "MANUAL"
                      ? "bg-emerald-50 border-emerald-500 text-emerald-950 font-medium"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold">Montant Personnalisé</span>
                    <input
                      type="radio"
                      name="nisab"
                      checked={nisabMethod === "MANUAL"}
                      onChange={() => setNisabMethod("MANUAL")}
                    />
                  </div>
                  <span className="text-[11px] text-gray-500">Saisie directe du montant officiel du ministère</span>
                </label>
              </div>

              {/* Prix du gramme */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {nisabMethod === "SILVER" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Prix du gramme d&apos;argent en DZD (595g × Prix)
                    </label>
                    <input
                      type="number"
                      value={silverGramPriceDZD}
                      onChange={(e) => setSilverGramPriceDZD(Number(e.target.value))}
                      className="w-full text-sm p-2 bg-white border border-gray-300 rounded-lg"
                    />
                    <span className="text-xs text-emerald-700 font-medium mt-1 block">
                      Seuil calculé : {formatMoney(595 * silverGramPriceDZD)}
                    </span>
                  </div>
                )}

                {nisabMethod === "GOLD" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Prix du gramme d&apos;or en DZD (85g × Prix)
                    </label>
                    <input
                      type="number"
                      value={goldGramPriceDZD}
                      onChange={(e) => setGoldGramPriceDZD(Number(e.target.value))}
                      className="w-full text-sm p-2 bg-white border border-gray-300 rounded-lg"
                    />
                    <span className="text-xs text-emerald-700 font-medium mt-1 block">
                      Seuil calculé : {formatMoney(85 * goldGramPriceDZD)}
                    </span>
                  </div>
                )}

                {nisabMethod === "MANUAL" && (
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">
                      Seuil officiel du Nisab en DZD
                    </label>
                    <input
                      type="number"
                      value={manualNisabDZD}
                      onChange={(e) => setManualNisabDZD(Number(e.target.value))}
                      className="w-full text-sm p-2 bg-white border border-gray-300 rounded-lg"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Année et Taux de Zakat */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Type de calendrier (Convention de l&apos;année)
                </label>
                <select
                  value={zakatYearType}
                  onChange={(e) => {
                    const yt = e.target.value as ZakatYearType;
                    setZakatYearType(yt);
                    setZakatRate(yt === "LUNAR" ? 0.025 : 0.02577);
                  }}
                  className="w-full text-sm p-2.5 bg-gray-50 border border-gray-300 rounded-lg"
                >
                  <option value="LUNAR">Année Lunaire / Hégirienne (354 jours — 2.500%)</option>
                  <option value="SOLAR">Année Solaire / Grégorienne (365 jours — 2.577%)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Taux de Zakat applicable
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.0001"
                    value={zakatRate}
                    onChange={(e) => setZakatRate(Number(e.target.value))}
                    className="w-full text-sm p-2.5 bg-gray-50 border border-gray-300 rounded-lg"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-500">
                    {(zakatRate * 100).toFixed(3)}%
                  </span>
                </div>
              </div>
            </div>

            {calcError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {calcError}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={handleRunCalculation}
                disabled={isLoadingCalculation}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white font-medium rounded-lg hover:bg-emerald-800 transition-colors shadow-sm disabled:opacity-50"
              >
                {isLoadingCalculation ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Calcul historique en cours...
                  </>
                ) : (
                  <>
                    Lancer le calcul historique
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ÉTAPE 2 : ACTIFS RECONSTITUÉS */}
        {/* ========================================================================= */}
        {currentStep === 2 && calculationResult && (
          <div className="space-y-6">
            <div className="border-b border-gray-100 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-900">
                  Étape 2 : Actifs Zakatables Reconstitués
                </h2>
                <p className="text-xs text-gray-500">
                  Résultats historiques arrêtés au {valuationDate} selon le moteur Phase 2
                </p>
              </div>
              <span className="text-xs font-mono bg-emerald-50 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200">
                Total Confirmé : {formatMoney(calculationResult.assets.confirmedAssetsDZD)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Inventaire */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-gray-800">1. Marchandises en Stock</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-gray-900">
                    {formatMoney(calculationResult.assets.inventory.confirmedValueDZD)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>Produits évalués : {calculationResult.assets.inventory.productsCount}</p>
                  <p>Produits en stock positif : {calculationResult.assets.inventory.productsWithStockCount}</p>
                  {calculationResult.assets.inventory.missingCostPriceCount > 0 && (
                    <p className="text-amber-700 font-medium">
                      ⚠️ {calculationResult.assets.inventory.missingCostPriceCount} produit(s) sans prix de revient exclus
                    </p>
                  )}
                </div>
              </div>

              {/* Trésorerie */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-gray-800">2. Trésorerie & Disponibilités</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-gray-900">
                    {formatMoney(calculationResult.assets.treasury.totalBalanceDZD)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>Comptes actifs : {calculationResult.assets.treasury.activeAccountsCount}</p>
                  <p>
                    Virements internes : {calculationResult.assets.treasury.isTransfersNetZero ? "Équilibrés (0 DA)" : "Écart détecté"}
                  </p>
                </div>
              </div>

              {/* Créances */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-bold text-gray-800">3. Créances Clients</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-gray-900">
                    {formatMoney(calculationResult.assets.receivables.totalReceivablesDZD)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>Clients débiteurs : {calculationResult.assets.receivables.customersWithDebtCount}</p>
                  <p className="text-amber-700">Revue de solvabilité obligatoire par le gérant</p>
                </div>
              </div>

              {/* Avances Fournisseurs */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-bold text-gray-800">4. Avances Fournisseurs</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-gray-900">
                    {formatMoney(calculationResult.assets.supplierPrepayments.confirmedUnallocatedPrepaymentsDZD)}
                  </span>
                </div>
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>Statut : {calculationResult.assets.supplierPrepayments.reconstructionStatus}</p>
                  {calculationResult.assets.supplierPrepayments.unverifiedPrepaymentsDZD > 0 && (
                    <p className="text-red-700 font-medium">
                      ⚠️ {formatMoney(calculationResult.assets.supplierPrepayments.unverifiedPrepaymentsDZD)} non vérifiés exclus
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Fonds clients détenus en trésorerie */}
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-amber-700" />
                  <span className="text-xs font-bold text-amber-900">
                    Fonds appartenant à des tiers (Amānāt logées en caisse)
                  </span>
                </div>
                <span className="text-xs font-mono font-bold text-amber-950">
                  {formatMoney(calculationResult.customerFundsHeld.totalCustomerFundsDZD)}
                </span>
              </div>
              <p className="text-xs text-amber-800">
                Ces fonds (acomptes clients non affectés et solde d&apos;épargne) sont physiquement dans vos caisses mais ne constituent pas un actif de votre entreprise. Vous pourrez confirmer leur déduction à l&apos;étape suivante.
              </p>
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
              >
                Retour configuration
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white font-medium text-xs rounded-lg hover:bg-emerald-800 shadow-sm"
              >
                Examiner les anomalies
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ÉTAPE 3 : ANOMALIES & REVUE D'INTÉGRITÉ */}
        {/* ========================================================================= */}
        {currentStep === 3 && calculationResult && (
          <div className="space-y-6">
            <div className="border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">
                Étape 3 : Examen des Anomalies et Confirmations
              </h2>
              <p className="text-xs text-gray-500">
                Examinez les avertissements du moteur et confirmez le traitement des fonds clients
              </p>
            </div>

            {/* Confirmation des fonds clients (Correction A) */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-3">
              <div className="flex items-center gap-2 text-gray-900 font-bold text-xs uppercase tracking-wider">
                <Coins className="w-4 h-4 text-emerald-700" />
                Réconciliation des Fonds Clients (Amānāt : {formatMoney(calculationResult.customerFundsHeld.totalCustomerFundsDZD)})
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">
                Les comptes de trésorerie ({formatMoney(calculationResult.assets.treasury.totalBalanceDZD)}) contiennent physiquement les fonds appartenant aux clients. Indiquez explicitement votre décision pour éviter une surévaluation ou une double déduction :
              </p>

              <div className="space-y-2 pt-1">
                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="custFunds"
                    value="CONFIRMED_INCLUDED"
                    checked={customerFundsConfirmation === "CONFIRMED_INCLUDED"}
                    onChange={() => {
                      setCustomerFundsConfirmation("CONFIRMED_INCLUDED");
                      handleRefreshCalculation("CONFIRMED_INCLUDED");
                    }}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-gray-900">
                      CONFIRMÉ INCLUS : Ces fonds sont déjà inclus dans mes dettes déductibles manuelles
                    </span>
                    <p className="text-gray-500 text-[11px] mt-0.5">
                      J&apos;ai déjà saisi (ou je vais saisir) ce montant dans mes dettes manuelles. Le système ne doit pas le déduire une seconde fois.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="custFunds"
                    value="CONFIRMED_EXCLUDED"
                    checked={customerFundsConfirmation === "CONFIRMED_EXCLUDED"}
                    onChange={() => {
                      setCustomerFundsConfirmation("CONFIRMED_EXCLUDED");
                      handleRefreshCalculation("CONFIRMED_EXCLUDED");
                    }}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-gray-900">
                      CONFIRMÉ EXCLU : Ces fonds ne sont pas inclus dans mes dettes manuelles
                    </span>
                    <p className="text-gray-500 text-[11px] mt-0.5">
                      Je confirme conserver ce choix méthodologique sous ma responsabilité.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border border-gray-200 cursor-pointer text-xs">
                  <input
                    type="radio"
                    name="custFunds"
                    value="UNCONFIRMED"
                    checked={customerFundsConfirmation === "UNCONFIRMED"}
                    onChange={() => {
                      setCustomerFundsConfirmation("UNCONFIRMED");
                      handleRefreshCalculation("UNCONFIRMED");
                    }}
                    className="mt-0.5"
                  />
                  <div>
                    <span className="font-semibold text-gray-900">
                      NON CONFIRMÉ (Revue requise)
                    </span>
                    <p className="text-gray-500 text-[11px] mt-0.5">
                      L&apos;évaluation restera en statut &apos;Revue requise&apos; et ne pourra pas être approuvée sans confirmation préalable.
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* Avertissements du moteur */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Avertissements et Points d&apos;Attention Détectés ({calculationResult.reconciliation.allWarnings.length})
              </h3>

              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {calculationResult.reconciliation.allWarnings.map((w, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5"
                  >
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
              >
                Retour aux actifs
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white font-medium text-xs rounded-lg hover:bg-emerald-800 shadow-sm"
              >
                Passif et Ajustements
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ÉTAPE 4 : PASSIF & AJUSTEMENTS DU GÉRANT */}
        {/* ========================================================================= */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <div className="border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">
                Étape 4 : Dettes Déductibles et Ajustements du Gérant
              </h2>
              <p className="text-xs text-gray-500">
                Saisissez les dettes exigibles déductibles selon les règles de conformité
              </p>
            </div>

            {/* Dettes manuelles */}
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-4">
              <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                Dettes déductibles de l&apos;exercice (Saisie Manuelle Gérant)
              </h3>
              <p className="text-xs text-gray-600">
                Conformément aux normes fiqh (AAOIFI FAS 9), seules les dettes certaines exigibles à court terme liées à l&apos;activité commerciale sont déductibles (dettes fournisseurs, charges d&apos;exploitation échues, salaires dus).
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Montant total des dettes déductibles en DZD
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={manualLiabilitiesDZD}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setManualLiabilitiesDZD(val);
                      handleRefreshCalculation(undefined, val);
                    }}
                    className="w-full text-sm p-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    Justification / Notes explicatives
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Dettes fournisseurs à court terme + salaires d'octobre"
                    value={manualLiabilitiesNote}
                    onChange={(e) => setManualLiabilitiesNote(e.target.value)}
                    className="w-full text-sm p-2.5 bg-white border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* Ajustements audités du gérant */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    Ajustements Manuels Audités ({adjustments.length})
                  </h3>
                  <p className="text-xs text-gray-500">
                    Ajouts ou déductions justifiées sur l&apos;actif (ex: créance douteuse exclue, stock détérioré)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAdjModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Ajouter un ajustement
                </button>
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
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-mono font-bold text-gray-900">
                          {formatMoney(a.amountDZD)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveAdjustment(a.id)}
                          className="text-gray-400 hover:text-red-600 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic bg-gray-50 p-4 rounded-xl text-center">
                  Aucun ajustement manuel enregistré. Le calcul utilise directement les données d&apos;actifs réconciliées.
                </p>
              )}
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
              >
                Retour anomalies
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(5)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white font-medium text-xs rounded-lg hover:bg-emerald-800 shadow-sm"
              >
                Synthèse finale
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ÉTAPE 5 : SYNTHÈSE DE CALCUL */}
        {/* ========================================================================= */}
        {currentStep === 5 && calculationResult && (
          <div className="space-y-6">
            <div className="border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">
                Étape 5 : Synthèse et Détermination de la Zakat
              </h2>
              <p className="text-xs text-gray-500">
                Vérification de l&apos;assiette imposable et conformité avec le seuil du Nisab
              </p>
            </div>

            <div className="bg-gradient-to-r from-emerald-50 to-white p-6 rounded-2xl border border-emerald-200 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actifs Confirmés + Ajustements
                  </span>
                  <p className="text-2xl font-bold text-gray-900 mt-1">
                    {formatMoney(confirmedAssets + netAdjustments)}
                  </p>
                  <span className="text-[11px] text-gray-500">
                    Actifs ({formatMoney(confirmedAssets)}) {netAdjustments !== 0 ? `Ajust. (${formatMoney(netAdjustments)})` : ""}
                  </span>
                </div>

                <div>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Dettes Déductibles
                  </span>
                  <p className="text-2xl font-bold text-red-700 mt-1">
                    - {formatMoney(manualLiabilitiesDZD)}
                  </p>
                  <span className="text-[11px] text-gray-500">Passif exigible validé</span>
                </div>

                <div>
                  <span className="text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                    Assiette Imposable (Base)
                  </span>
                  <p className="text-3xl font-extrabold text-emerald-950 mt-1">
                    {formatMoney(currentBase)}
                  </p>
                  <span className="text-[11px] text-emerald-700 font-medium">
                    {isNisabReached ? "✓ Supérieure au seuil de Nisab" : "✗ Inférieure au seuil de Nisab"}
                  </span>
                </div>
              </div>

              <div className="p-4 bg-emerald-700 text-white rounded-xl flex items-center justify-between shadow-sm">
                <div>
                  <span className="text-xs font-medium text-emerald-200 uppercase tracking-wider">
                    Montant de la Zakat Estimée ({zakatYearType === "LUNAR" ? "Année Lunaire 2.500%" : "Année Solaire"})
                  </span>
                  <p className="text-3xl font-black mt-1">
                    {formatMoney(finalZakatDue)}
                  </p>
                </div>
                <div className="text-right text-xs text-emerald-100">
                  <p>Nisab requis : {formatMoney(nisabThreshold)}</p>
                  <p className="font-semibold mt-1">
                    Statut : {calculationResult.status}
                  </p>
                </div>
              </div>
            </div>

            {/* Statut Global */}
            <div className="p-4 rounded-xl border text-xs space-y-1">
              <div className="flex items-center gap-2 font-bold">
                {calculationResult.status === "INCOMPLETE" ? (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-red-900">Évaluation Incomplète (Provisoire)</span>
                  </>
                ) : calculationResult.status === "REQUIRES_REVIEW" ? (
                  <>
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-amber-900">Revue Requise par le Gérant</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-900">Calcul Complet et Réconcilié</span>
                  </>
                )}
              </div>
              <p className="text-gray-600">{calculationResult.calculation.statusReason}</p>
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCurrentStep(4)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
              >
                Retour passif
              </button>
              <button
                type="button"
                onClick={() => setCurrentStep(6)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-700 text-white font-medium text-xs rounded-lg hover:bg-emerald-800 shadow-sm"
              >
                Passer à l&apos;enregistrement
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ÉTAPE 6 : ENREGISTREMENT & PERSISTANCE */}
        {/* ========================================================================= */}
        {currentStep === 6 && calculationResult && (
          <div className="space-y-6">
            <div className="border-b border-gray-100 pb-3">
              <h2 className="text-lg font-bold text-gray-900">
                Étape 6 : Enregistrement de l&apos;Évaluation
              </h2>
              <p className="text-xs text-gray-500">
                Sauvegardez l&apos;évaluation sous forme de snapshot immuable et traçable
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Notes ou observations du gestionnaire (facultatif)
                </label>
                <textarea
                  rows={3}
                  placeholder="Indiquez ici les détails méthodologiques, accords entre associés ou circonstances particulières de cette clôture..."
                  value={valuationNotes}
                  onChange={(e) => setValuationNotes(e.target.value)}
                  className="w-full text-xs p-3 bg-gray-50 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-xs text-gray-700 space-y-2">
                <p className="font-semibold text-gray-900">Garanties de persistance :</p>
                <ul className="list-disc pl-5 space-y-1 text-gray-600 text-[11px]">
                  <li>L&apos;évaluation sera enregistrée avec le statut initial : <strong>{calculationResult.status === "INCOMPLETE" ? "INCOMPLETE (Brouillon Provisoire)" : calculationResult.status === "REQUIRES_REVIEW" ? "REQUIRES_REVIEW (En attente de revue)" : "DRAFT (Brouillon)"}</strong></li>
                  <li>Toutes les lignes de détail de stock, comptes, créances et avances sont figées à la date de valorisation.</li>
                  <li>Une évaluation incomplète ne pourra être approuvée qu&apos;après résolution des données sources manquantes.</li>
                  <li>Aucun paiement ni mouvement de trésorerie n&apos;est exécuté automatiquement.</li>
                </ul>
              </div>

              {saveError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {saveError}
                </div>
              )}
            </div>

            <div className="flex justify-between pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setCurrentStep(5)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-50"
              >
                Retour synthèse
              </button>
              <button
                type="button"
                onClick={handleSaveValuation}
                disabled={isSaving}
                className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-700 text-white font-medium text-xs rounded-lg hover:bg-emerald-800 shadow-sm disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enregistrement du snapshot...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Sauvegarder l&apos;évaluation
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Modal d'ajout d'ajustement ── */}
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
                  placeholder="Ex: Exclusion créance douteuse client X"
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
                  placeholder="Ex: Débiteur en faillite, créance non recouvrable selon Fiqh"
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
                onClick={handleAddAdjustment}
                disabled={!adjDescription || adjAmount <= 0 || !adjReason}
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

