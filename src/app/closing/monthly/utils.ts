// ─── FUSEAU HORAIRE ALGÉRIE (AFRICA/ALGIERS, UTC+1) & UTILITAIRES DATE ────────

/**
 * Extrait la date effective au format "YYYY-MM-DD" en heure locale d'Algérie (Africa/Algiers)
 */
export function getEffectiveDayStr(d: Date): string {
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

/**
 * Retourne le mois courant au format "YYYY-MM" selon le fuseau horaire Africa/Algiers
 */
export function getCurrentMonthStr(): string {
  const now = new Date();
  const algiersDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
  }).format(now);
  return algiersDateStr.slice(0, 7); // "YYYY-MM"
}

/**
 * Calcule les bornes, libellés et objets Date d'un mois "YYYY-MM"
 */
export function getMonthBoundaries(monthStr: string) {
  const [yearStr, monthNumStr] = monthStr.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthNumStr, 10);

  const lastDayNum = new Date(year, monthNum, 0).getDate();
  const startDayStr = `${monthStr}-01`;
  const endDayStr = `${monthStr}-${String(lastDayNum).padStart(2, "0")}`;

  const monthNames = [
    "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
    "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"
  ];
  const monthLabel = `${monthNames[monthNum - 1]} ${year}`;

  return {
    year,
    monthNum,
    monthStr,
    monthLabel,
    startDayStr,
    endDayStr,
    periodStartStr: `${startDayStr} 00:00:00`,
    periodEndStr: `${endDayStr} 23:59:59`,
    startDateUtc: new Date(Date.UTC(year, monthNum - 1, 1, 0, 0, 0, 0)),
    endDateUtc: new Date(Date.UTC(year, monthNum - 1, lastDayNum, 23, 59, 59, 999)),
  };
}
