/**
 * Formatters for Zakat Financial Accounting
 * Standard French-DZ number format (Dinar Algérien DA / DZD).
 *
 * Rules:
 * - Null / undefined / NaN => "0 DA"
 * - Whole amounts => without unnecessary decimal zeros (e.g. 15101550 => "15 101 550 DA", 0 => "0 DA")
 * - Amounts with cents => up to two decimal places, preserving cents (e.g. 433247.90 => "433 247,90 DA")
 * - French-DZ typography with comma decimal separator and DA suffix
 */

export function formatZakatMoney(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) {
    return "0 DA";
  }

  // Check if amount is practically an integer (within 0.005 DZD of nearest whole dinar)
  const isWhole = Math.abs(val - Math.round(val)) < 0.005;

  const formatted = new Intl.NumberFormat("fr-DZ", {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(val);

  return `${formatted} DA`;
}

