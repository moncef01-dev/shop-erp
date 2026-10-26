import { prisma } from "@/lib/prisma";

export class PeriodLockedError extends Error {
  public readonly month: string;
  public readonly reference?: string | null;

  constructor(month: string, reference?: string | null, actionDescription?: string) {
    const actionText = actionDescription ? `l'action "${actionDescription}"` : "cette opération";
    const refText = reference ? ` (Référence de clôture : ${reference})` : "";
    super(
      `Période verrouillée : Le mois ${month} est définitivement clôturé et verrouillé${refText}. Il est strictement interdit d'exécuter ${actionText} sur une période clôturée. Pour modifier ou corriger des écritures antérieures, une réouverture exceptionnelle doit être formellement demandée et motivée depuis le module Clôture Mensuelle (/closing/monthly).`
    );
    this.name = "PeriodLockedError";
    this.month = month;
    this.reference = reference;
  }
}

/**
 * Extrait le mois "YYYY-MM" en tenant compte du fuseau horaire de référence Africa/Algiers
 */
export function getMonthFromDate(date: Date | string | null | undefined): string {
  if (!date) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("fr-CA", {
      timeZone: "Africa/Algiers",
      year: "numeric",
      month: "2-digit",
    }).format(now);
    return parts.slice(0, 7);
  }

  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) {
    throw new Error(`Date invalide passée au contrôle de période : ${String(date)}`);
  }

  const parts = new Intl.DateTimeFormat("fr-CA", {
    timeZone: "Africa/Algiers",
    year: "numeric",
    month: "2-digit",
  }).format(d);

  return parts.slice(0, 7);
}

/**
 * Vérifie si un mois donné est actuellement verrouillé (status = 'FINAL' ou isLocked = true)
 */
export async function isMonthLocked(month: string): Promise<boolean> {
  try {
    const period = await prisma.monthlyClosingPeriod.findUnique({
      where: { month },
      select: { isLocked: true, status: true },
    });
    return Boolean(period?.isLocked || period?.status === "FINAL");
  } catch (err) {
    console.error("Erreur vérification verrouillage période:", err);
    // En cas d'erreur de base de données, ne bloque pas les transactions de manière intempestive mais journalise
    return false;
  }
}

/**
 * Récupère les informations de verrouillage pour un mois
 */
export async function getLockedPeriodInfo(month: string) {
  return await prisma.monthlyClosingPeriod.findUnique({
    where: { month },
    select: {
      id: true,
      month: true,
      status: true,
      isLocked: true,
      finalSnapshotRef: true,
      approvedBy: true,
      approvedAt: true,
    },
  });
}

import type { PrismaTransactionClient } from "@/lib/inventory-transaction";

/**
 * Assure qu'une date donnée n'appartient pas à une période clôturée et verrouillée.
 * Lève une exception PeriodLockedError si le mois est verrouillé.
 */
export async function assertPeriodNotLocked(
  date: Date | string | null | undefined,
  actionDescription?: string,
  txClient?: PrismaTransactionClient
): Promise<void> {
  const db = txClient || prisma;
  const month = getMonthFromDate(date);
  const period = await db.monthlyClosingPeriod.findUnique({
    where: { month },
    select: { isLocked: true, status: true, finalSnapshotRef: true },
  });

  if (period?.isLocked || period?.status === "FINAL") {
    throw new PeriodLockedError(month, period.finalSnapshotRef, actionDescription);
  }
}

/**
 * Assure que l'ensemble des dates passées (ex: date originale + nouvelle date) ne sont pas verrouillées.
 */
export async function assertDatesNotLocked(
  dates: (Date | string | null | undefined)[],
  actionDescription?: string,
  txClient?: PrismaTransactionClient
): Promise<void> {
  const checkedMonths = new Set<string>();
  for (const d of dates) {
    if (!d) continue;
    const month = getMonthFromDate(d);
    if (!checkedMonths.has(month)) {
      checkedMonths.add(month);
      await assertPeriodNotLocked(d, actionDescription, txClient);
    }
  }
}
