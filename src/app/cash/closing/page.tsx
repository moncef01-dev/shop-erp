import { getCashDashboardData } from "../actions";
import { ClosingClient } from "./ClosingClient";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Clôture Caisse | ERP Meubles",
  description: "Gestion des clôtures journalières et sessions de caisse",
};

export const dynamic = "force-dynamic";

export default async function ClosingPage() {
  const data = await getCashDashboardData();

  return (
    <ClosingClient
      data={data}
      treasuryAccounts={data.treasury.accounts}
    />
  );
}
