import { notFound } from "next/navigation";
import { getZakatValuationByIdAction } from "../actions";
import { ZakatValuationDetailClient } from "./ZakatValuationDetailClient";

export const metadata = {
  title: "Détail de l'Évaluation de Zakat | Shop ERP",
  description: "Rapport détaillé et snapshot d'évaluation de la Zakat",
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ZakatValuationDetailPage(props: PageProps) {
  const resolvedParams = await props.params;
  const id = parseInt(resolvedParams.id, 10);

  if (isNaN(id)) {
    notFound();
  }

  const data = await getZakatValuationByIdAction(id);

  if (!data) {
    notFound();
  }

  return <ZakatValuationDetailClient initialData={data} />;
}

