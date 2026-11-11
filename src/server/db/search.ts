import { dbProvider } from "@/server/db/config";
import { caseInsensitiveSearch } from "@/server/db/capabilities";

/**
 * Construit un filtre `contains` de recherche textuelle cohérent entre moteurs.
 * - SQLite : `contains` est insensible à la casse par défaut (LIKE).
 * - PostgreSQL : `contains` est sensible à la casse → ajouter mode: "insensitive".
 */
export function buildContainsFilter(field: string, query: string) {
  if (caseInsensitiveSearch()) {
    return { [field]: { contains: query, mode: "insensitive" as const } };
  }
  return { [field]: { contains: query } };
}

/**
 * Variante pour recherches multi-champs : applique le bon mode sur chaque champ.
 */
export function buildContainsOR(filters: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  if (!caseInsensitiveSearch()) {
    return filters;
  }
  return filters.map((filter) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filter)) {
      if (
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        "contains" in (value as Record<string, unknown>)
      ) {
        out[key] = { ...(value as object), mode: "insensitive" as const };
      } else {
        out[key] = value;
      }
    }
    return out;
  });
}
