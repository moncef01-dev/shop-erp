/**
 * Date and Timezone Utilities for Business Zakat Accounting
 * Strict adherence to business timezone: Africa/Algiers (UTC+1)
 */

export const BUSINESS_TIMEZONE = "Africa/Algiers";

/**
 * Extracts effective date string "YYYY-MM-DD" respecting Africa/Algiers timezone.
 * Handles both midnight UTC storage and intraday local timestamps.
 */
export function getEffectiveDayStr(d: Date): string {
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0) {
    return d.toISOString().slice(0, 10);
  }
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Normalizes string or Date into a standardized "YYYY-MM-DD" format.
 */
export function normalizeDateStr(input: string | Date): string {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) {
      return getEffectiveDayStr(parsed);
    }
    throw new Error(`Format de date invalide: "${input}". Format attendu: YYYY-MM-DD.`);
  }
  if (input instanceof Date && !isNaN(input.getTime())) {
    return getEffectiveDayStr(input);
  }
  throw new Error(`Objet Date invalide fourni.`);
}

/**
 * Calculates UTC date boundaries for a given local day in Africa/Algiers (UTC+1).
 * In Africa/Algiers, local midnight (00:00:00) corresponds to 23:00:00 UTC of previous day.
 * End of local day (23:59:59.999) corresponds to 22:59:59.999 UTC of the target day.
 *
 * For database queries with date-only storage (e.g. 2026-11-10T00:00:00Z),
 * query filters should span up to nextDayUtcMax to ensure all relevant records are captured,
 * followed by getEffectiveDayStr filtering.
 */
export function getAlgiersDayBoundariesUtc(dayStr: string): {
  localDayStr: string;
  startOfDayUtc: Date;
  endOfDayUtc: Date;
  nextDayStartUtc: Date;
  dbQueryMaxUtc: Date;
} {
  const normalized = normalizeDateStr(dayStr);
  const [yearStr, monthStr, dateStr] = normalized.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1; // 0-based
  const day = parseInt(dateStr, 10);

  // Africa/Algiers is UTC+1 year round (no DST)
  // Local 00:00:00 is (day - 1) at 23:00:00 UTC
  const startOfDayUtc = new Date(Date.UTC(year, month, day - 1, 23, 0, 0, 0));
  // Local 23:59:59.999 is day at 22:59:59.999 UTC
  const endOfDayUtc = new Date(Date.UTC(year, month, day, 22, 59, 59, 999));
  // Local next day 00:00:00 is day at 23:00:00 UTC
  const nextDayStartUtc = new Date(Date.UTC(year, month, day, 23, 0, 0, 0));
  // Safety margin for DB queries to safely include records stored at UTC midnight or near boundary:
  // Day at 23:59:59.999 UTC
  const dbQueryMaxUtc = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));

  return {
    localDayStr: normalized,
    startOfDayUtc,
    endOfDayUtc,
    nextDayStartUtc,
    dbQueryMaxUtc,
  };
}

/**
 * Checks if a transaction date falls on or before the cutoff local date.
 */
export function isEffectiveOnOrBefore(txDate: Date, cutoffLocalDayStr: string): boolean {
  const dayStr = getEffectiveDayStr(txDate);
  return dayStr <= cutoffLocalDayStr;
}

/**
 * Precision-safe rounding for currency in DZD (2 decimal places).
 */
export function roundMoney(amount: number): number {
  if (isNaN(amount) || !isFinite(amount)) return 0;
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

/**
 * Converts DZD float to integer cents (centimes) to prevent floating-point accumulation drift.
 */
export function toCents(amount: number): bigint {
  if (isNaN(amount) || !isFinite(amount)) return BigInt(0);
  return BigInt(Math.round(amount * 100));
}

/**
 * Converts integer cents back to DZD float.
 */
export function fromCents(cents: bigint): number {
  return Number(cents) / 100;
}
