import type { Metadata } from "next";
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
  const journalData = await getDailyCashJournal(params.date);

  return (
    <div className="max-w-7xl mx-auto">
      <DailyJournalClient initialData={journalData} />
    </div>
  );
}
