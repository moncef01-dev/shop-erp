import type { Metadata } from "next";
import { getDocumentsData } from "./actions";
import { DocumentsClient } from "./DocumentsClient";

export const metadata: Metadata = {
  title: "Documents & Facturation — Shop ERP",
  description: "Archives centrales, factures, bons de livraison, réceptions et pièces comptables",
};

export const dynamic = "force-dynamic";

export default async function DocumentsPage() {
  const initialData = await getDocumentsData();
  return <DocumentsClient initialData={initialData} />;
}
