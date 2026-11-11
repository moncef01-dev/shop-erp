/**
 * Input Validation for Business Zakat Accounting Engine
 */

import type {
  ZakatCalculationInput,
  ZakatYearType,
  NisabConfig,
  CustomerFundsConfirmation,
} from "./types";
import { normalizeDateStr, roundMoney } from "./date-utils";

export interface ValidatedZakatParams {
  valuationDateStr: string;
  periodStartDateStr: string;
  periodEndDateStr: string;
  zakatYearType: ZakatYearType;
  zakatRate: number;
  zakatRatePercent: number;
  nisabThresholdDZD: number;
  nisabGrams?: number;
  nisabGramPriceDZD?: number;
  nisabRuleExplanation: string;
  manualLiabilitiesDZD: number;
  manualLiabilitiesNote?: string;
  customerFundsConfirmation: CustomerFundsConfirmation;
  options?: {
    locationId?: number;
    includeSupplierPrepayments?: boolean;
    productIds?: number[];
  };
}

export function validateZakatCalculationInput(input: ZakatCalculationInput): ValidatedZakatParams {
  if (!input) {
    throw new Error("Paramètres de calcul Zakat manquants.");
  }

  // 1. Validation des dates
  const valuationDateStr = normalizeDateStr(input.valuationDate);
  const periodStartDateStr = normalizeDateStr(input.periodStartDate);
  const periodEndDateStr = normalizeDateStr(input.periodEndDate);

  if (periodStartDateStr > periodEndDateStr) {
    throw new Error(
      `Période invalide : La date de début (${periodStartDateStr}) ne peut pas être postérieure à la date de fin (${periodEndDateStr}).`
    );
  }

  // La date d'évaluation doit se situer dans la période ou correspondre à sa fin
  if (valuationDateStr < periodStartDateStr || valuationDateStr > periodEndDateStr) {
    throw new Error(
      `Date d'évaluation hors période : La date de valorisation (${valuationDateStr}) doit être comprise entre le début (${periodStartDateStr}) et la fin (${periodEndDateStr}) de la période du Hawl.`
    );
  }

  // 2. Validation du type d'année et du taux
  const zakatYearType = input.zakatYearType;
  if (zakatYearType !== "LUNAR" && zakatYearType !== "SOLAR") {
    throw new Error(
      `Type d'année Zakat non reconnu: "${zakatYearType}". Types supportés: "LUNAR" (Année lunaire) ou "SOLAR" (Année solaire).`
    );
  }

  let zakatRate: number;
  if (zakatYearType === "LUNAR") {
    // Année lunaire (Hijri) : taux standard 2.5% (1/40) par défaut si non spécifié
    zakatRate = input.zakatRate !== undefined ? Number(input.zakatRate) : 0.025;
  } else {
    // Année solaire (Grégorienne) : le taux doit être explicitement fourni ou confirmé (ex: 0.02577)
    if (input.zakatRate === undefined || input.zakatRate === null) {
      throw new Error(
        "Pour une année solaire (Grégorienne), le taux de Zakat doit être explicitement spécifié par le gestionnaire (ex: 0.02577 pour 2.577%). Aucun taux universel ne peut être supposé silencieusement."
      );
    }
    zakatRate = Number(input.zakatRate);
  }

  if (isNaN(zakatRate) || zakatRate <= 0 || zakatRate > 1) {
    throw new Error(
      `Taux de Zakat invalide: ${input.zakatRate}. Le taux doit être un nombre strictement positif compris entre 0 et 1 (ex: 0.025 pour 2.5%).`
    );
  }
  const zakatRatePercent = roundMoney(zakatRate * 100);

  // 3. Validation du Nisab
  const nisabConfig: NisabConfig = input.nisabConfig;
  if (!nisabConfig || !nisabConfig.standard) {
    throw new Error("Configuration du Nisab manquante ou invalide.");
  }

  let nisabThresholdDZD = 0;
  let nisabGrams: number | undefined;
  let nisabGramPriceDZD: number | undefined;
  let nisabRuleExplanation = "";

  switch (nisabConfig.standard) {
    case "SILVER": {
      const price = Number(nisabConfig.silverGramPriceDZD);
      if (isNaN(price) || price <= 0) {
        throw new Error(
          "Pour le standard de l'argent (Silver), le cours du gramme d'argent en DZD (silverGramPriceDZD) doit être strictement supérieur à 0."
        );
      }
      nisabGrams = 595;
      nisabGramPriceDZD = roundMoney(price);
      nisabThresholdDZD = roundMoney(595 * price);
      nisabRuleExplanation = `Nisab Argent: 595g × ${nisabGramPriceDZD.toLocaleString("fr-DZ")} DA/g = ${nisabThresholdDZD.toLocaleString("fr-DZ")} DA`;
      break;
    }
    case "GOLD": {
      const price = Number(nisabConfig.goldGramPriceDZD);
      if (isNaN(price) || price <= 0) {
        throw new Error(
          "Pour le standard de l'or (Gold), le cours du gramme d'or en DZD (goldGramPriceDZD) doit être strictement supérieur à 0."
        );
      }
      nisabGrams = 85;
      nisabGramPriceDZD = roundMoney(price);
      nisabThresholdDZD = roundMoney(85 * price);
      nisabRuleExplanation = `Nisab Or: 85g × ${nisabGramPriceDZD.toLocaleString("fr-DZ")} DA/g = ${nisabThresholdDZD.toLocaleString("fr-DZ")} DA`;
      break;
    }
    case "MANUAL": {
      const threshold = Number(nisabConfig.manualThresholdDZD);
      if (isNaN(threshold) || threshold <= 0) {
        throw new Error(
          "Pour un Nisab manuel, le montant seuil en DZD (manualThresholdDZD) doit être un nombre strictement supérieur à 0."
        );
      }
      nisabThresholdDZD = roundMoney(threshold);
      nisabRuleExplanation = `Nisab Spécifié Manuellement: ${nisabThresholdDZD.toLocaleString("fr-DZ")} DA`;
      break;
    }
    default:
      throw new Error(
        `Standard de Nisab non reconnu: "${(nisabConfig as { standard: string }).standard}". Standards autorisés: "SILVER", "GOLD", "MANUAL".`
      );
  }

  // 4. Validation des dettes déductibles saisies manuellement
  const manualLiabilitiesRaw = Number(input.manualLiabilitiesDZD);
  if (isNaN(manualLiabilitiesRaw) || manualLiabilitiesRaw < 0 || !isFinite(manualLiabilitiesRaw)) {
    throw new Error(
      `Montant des dettes manuelles invalide: ${input.manualLiabilitiesDZD}. Il doit s'agir d'un montant monétaire valide supérieur ou égal à 0 DA.`
    );
  }
  const manualLiabilitiesDZD = roundMoney(manualLiabilitiesRaw);

  // 5. Statut de confirmation de la réconciliation des fonds clients dans les dettes manuelles
  let customerFundsConfirmation: CustomerFundsConfirmation = "UNCONFIRMED";
  if (input.customerFundsConfirmation) {
    if (
      input.customerFundsConfirmation !== "CONFIRMED_INCLUDED" &&
      input.customerFundsConfirmation !== "CONFIRMED_EXCLUDED" &&
      input.customerFundsConfirmation !== "UNCONFIRMED"
    ) {
      throw new Error(
        `Statut de confirmation des fonds clients invalide: "${input.customerFundsConfirmation}". Valeurs acceptées: "CONFIRMED_INCLUDED", "CONFIRMED_EXCLUDED", "UNCONFIRMED".`
      );
    }
    customerFundsConfirmation = input.customerFundsConfirmation;
  }

  return {
    valuationDateStr,
    periodStartDateStr,
    periodEndDateStr,
    zakatYearType,
    zakatRate,
    zakatRatePercent,
    nisabThresholdDZD,
    nisabGrams,
    nisabGramPriceDZD,
    nisabRuleExplanation,
    manualLiabilitiesDZD,
    manualLiabilitiesNote: input.manualLiabilitiesNote?.trim(),
    customerFundsConfirmation,
    options: input.options,
  };
}
