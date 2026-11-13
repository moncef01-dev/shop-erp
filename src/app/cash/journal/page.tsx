import type { Metadata } from "next";
import Link from "next/link";
import { Wallet } from "lucide-react";
import { getDailyCashJournal } from "../actions";
import { DailyJournalClient } from "./DailyJournalClient";

export const metadata: Metadata = {
  title: "Journal Journalier de Caisse | Trésorerie | Shop ERP",
  description: "Journal comptable chronologique des entrées et sorties de la caisse journalière.",
};

export const dynamic = "force-dynamic";

interface DailyJournalPageProps {
  searchParams: Promise<{ date?: string }>;
}

export default async function DailyJournalPage({ searchParams }: DailyJournalPageProps) {
  const params = await searchParams;

  let journalData: Awaited<ReturnType<typeof getDailyCashJournal>> | null = null;
  try {
    journalData = await getDailyCashJournal(params.date);
  } catch (error) {
    console.error("Journal journalier : compte de caisse indisponible.", error);
  }

  if (!journalData) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs py-16 px-4 text-center">
          <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 mb-3">
            <Wallet className="h-6 w-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">Caisse journalière non configurée</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Aucun compte de caisse par défaut n&apos;existe encore. Créez le compte
            &laquo;&nbsp;Caisse journalière&nbsp;&raquo; depuis la gestion des comptes de trésorerie pour
            consulter le journal.
          </p>
          <Link
            href="/cash/accounts"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-amber-400 hover:bg-amber-500 rounded-lg shadow-xs transition-colors"
          >
            <Wallet className="h-4 w-4" />
            Configurer les comptes de trésorerie
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <DailyJournalClient initialData={journalData} />
    </div>
  );
}
