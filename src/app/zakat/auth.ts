/**
 * Shop ERP — Architecture de Sécurité et Attribution du Module Zakat
 *
 * NOTE IMPORTANTE D'ARCHITECTURE :
 * L'application Shop ERP est un logiciel d'entreprise monoposte / réseau local (on-premise)
 * qui NE COMPORTE PAS de système d'authentification utilisateur (aucun écran de connexion,
 * aucun compte nominatif, aucun mot de passe, aucune session cryptographique, aucun RBAC).
 *
 * RÈGLES DE SÉCURITÉ ET D'ATTRIBUTION DU MODULE ZAKAT :
 * 1. Aucun en-tête client (ex: x-user-role, x-user-name, Authorization) n'est accepté ou interprété
 *    pour octroyer des privilèges ou feindre une authentification.
 * 2. Aucune identité d'administrateur ou de gérant n'est forgée ou présentée comme "authentifiée".
 * 3. L'attribution des actions sensibles (approbation, rejet, ajustements) repose sur une saisie
 *    manuelle déclarative par l'opérateur, enregistrée explicitement comme NON VÉRIFIÉE.
 * 4. La date et l'heure d'approbation ou de rejet sont générées exclusivement côté serveur.
 * 5. La sécurité du système contre les accès non autorisés dépend impérativement des contrôles
 *    d'accès réseau physiques et logiques (pare-feu local, écoute restreinte à 127.0.0.1 ou LAN de confiance).
 */

export interface OperatorAttribution {
  rawName: string;
  formattedName: string;
  isVerified: false;
  recordedAt: string;
}

/**
 * Formate le nom de l'opérateur saisi manuellement pour l'audit comptable.
 * Qualifie expressément la mention comme déclarative et non vérifiée,
 * sans jamais la qualifier d'identité authentifiée.
 */
export function formatDeclarativeOperator(rawName?: string | null): string {
  const trimmed = rawName?.trim();
  if (!trimmed) {
    return "Opérateur non spécifié (Déclaratif non vérifié)";
  }
  return `${trimmed} (Déclaratif non vérifié)`;
}
