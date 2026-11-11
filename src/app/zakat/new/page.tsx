import { NewZakatValuationClient } from "./NewZakatValuationClient";

export const metadata = {
  title: "Nouvelle Évaluation de la Zakat | Shop ERP",
  description: "Assistant guidé d'évaluation patrimoniale de la Zakat",
};

export const dynamic = "force-dynamic";

export default function NewZakatPage() {
  return <NewZakatValuationClient />;
}

