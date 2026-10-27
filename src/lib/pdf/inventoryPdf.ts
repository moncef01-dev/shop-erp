import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { type PrintableInventoryItem } from "@/components/documents/PrintableNewDocuments";
import { type ShopSettingsData } from "@/app/settings/actions";

export interface InventoryPdfData {
  locationName: string;
  locationCode?: string;
  isGlobal?: boolean;
  locations?: { id: number; name: string; code: string }[];
  items: PrintableInventoryItem[];
}

export interface GenerateInventoryPdfOptions {
  data: InventoryPdfData;
  settings?: ShopSettingsData | null;
}

/**
 * Nettoie une chaîne pour un nom de fichier sûr
 */
function sanitizeFileName(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40);
}

/**
 * Construit l'objet jsPDF complet avec tableau autoTable paginé et styles soignés
 */
export async function buildInventoryPdf({
  data,
  settings,
}: GenerateInventoryPdfOptions): Promise<jsPDF> {
  const isGlobal = data.isGlobal !== false && (!data.locationCode || data.locationCode === "GLOBAL");
  const orientation = isGlobal ? "landscape" : "portrait";

  const doc = new jsPDF({
    orientation,
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const now = new Date();
  const dateStr = now.toLocaleDateString("fr-DZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("fr-DZ", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const shopName = settings?.shopName || "Shop ERP Mobilier";
  const shopActivity = settings?.activity || "Magasin d'Ameublement & Décoration d'Intérieur";
  const shopAddress = settings?.address || "Alger, Algérie";
  const shopPhone = settings?.phone || "";
  const shopNif = settings?.nifRc ? `NIF/RC: ${settings.nifRc}` : "";
  const shopNis = settings?.nis ? `NIS: ${settings.nis}` : "";
  const locationTitle = data.locationName;

  // 1. Tenter d'insérer le logo si disponible
  let logoOffsetLeft = 14;
  if (settings?.logoUrl) {
    try {
      if (settings.logoUrl.startsWith("data:image/")) {
        const format = settings.logoUrl.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(settings.logoUrl, format, 14, 11, 14, 14);
        logoOffsetLeft = 31;
      }
    } catch {
      // Ignorer silencieusement si l'image ne peut pas être rendue
    }
  }

  // 2. En-tête gauche : Identité de l'entreprise
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(shopName, logoOffsetLeft, 15);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  let headerY = 19.5;
  if (shopActivity) {
    doc.text(shopActivity, logoOffsetLeft, headerY);
    headerY += 3.8;
  }
  if (shopAddress) {
    doc.text(shopAddress, logoOffsetLeft, headerY);
    headerY += 3.8;
  }
  const legalDetails = [shopPhone, shopNif, shopNis].filter(Boolean).join("  •  ");
  if (legalDetails) {
    doc.text(legalDetails, logoOffsetLeft, headerY);
  }

  // 3. En-tête droit : Badge & Références d'Inventaire
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text("FICHE D'INVENTAIRE PHYSIQUE", pageWidth - 14, 15, { align: "right" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Emplacement : ${locationTitle}${data.locationCode && data.locationCode !== "GLOBAL" ? ` (${data.locationCode})` : ""}`,
    pageWidth - 14,
    19.5,
    { align: "right" }
  );

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(`Date d'audit : ${dateStr} à ${timeStr}`, pageWidth - 14, 23.5, { align: "right" });

  const totalStockCount = data.items.reduce((sum, it) => sum + (it.systemStock || 0), 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Articles répertoriés : ${data.items.length}  |  Stock théorique total : ${totalStockCount} ${data.items[0]?.unit || "unités"}`,
    pageWidth - 14,
    27.5,
    { align: "right" }
  );

  // 4. Ligne séparatrice
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(14, 31, pageWidth - 14, 31);

  // 5. Encadré consignes pour les auditeurs
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, 33, pageWidth - 28, 8, 1, 1, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text(
    "Consignes d'inventaire : Dénombrer physiquement chaque article. Inscrire le comptage constaté dans la colonne « Comptage Réel », noter les écarts (+/-) et consigner toute dégradation ou remarque dans la colonne « Observations ».",
    16,
    38
  );

  // 6. Tri des articles : groupés et triés par catégorie (alphabétique),
  // puis triés par SKU / désignation au sein de chaque catégorie.
  // Les articles non catégorisés sont placés à la fin.
  const sortedItems = [...data.items].sort((a, b) => {
    const catA = (a.category || "").trim();
    const catB = (b.category || "").trim();

    if (!catA && catB) return 1;
    if (catA && !catB) return -1;

    if (catA.toLowerCase() !== catB.toLowerCase()) {
      return catA.localeCompare(catB, "fr", { sensitivity: "base" });
    }

    const skuA = (a.sku || "").trim();
    const skuB = (b.sku || "").trim();
    if (skuA && skuB && skuA.toLowerCase() !== skuB.toLowerCase()) {
      return skuA.localeCompare(skuB, "fr", { numeric: true, sensitivity: "base" });
    }

    const nameA = (a.name || "").trim();
    const nameB = (b.name || "").trim();
    return nameA.localeCompare(nameB, "fr", { sensitivity: "base" });
  });

  // 6. Définition du tableau selon l'orientation
  const knownLocations = data.locations && data.locations.length > 0
    ? data.locations
    : [
        { id: 1, name: "Showroom", code: "SHOWROOM" },
        { id: 2, name: "Garage Chaaban", code: "GARAGE_CHAABAN" },
        { id: 3, name: "Garage Cheikh", code: "GARAGE_CHEIKH" },
        { id: 4, name: "3ème Garage / Dépôt", code: "GARAGE_3" },
      ];

  let tableHead: Array<Array<{ content: string; styles?: Record<string, unknown>; colSpan?: number }>> = [];
  let tableBody: Array<Array<string | number>> = [];
  let tableFoot: Array<Array<{ content: string; styles?: Record<string, unknown>; colSpan?: number }>> = [];
  let columnStyles: Record<number, Record<string, unknown>> = {};

  if (isGlobal) {
    // Mode Paysage : Toutes les localisations détaillées
    tableHead = [
      [
        { content: "N°", styles: { halign: "center" } },
        { content: "Réf. SKU", styles: { halign: "left" } },
        { content: "Désignation de l'Article", styles: { halign: "left" } },
        { content: "Catégorie", styles: { halign: "left" } },
        ...knownLocations.map((loc) => ({
          content: loc.name.replace("Garage ", "G. "),
          styles: { halign: "center" as const },
        })),
        { content: "Stock Théorique", styles: { halign: "center", fontStyle: "bold" } },
        { content: "Comptage Réel", styles: { halign: "center", fontStyle: "bold" } },
        { content: "Écart", styles: { halign: "center" } },
        { content: "Observations / Remarques", styles: { halign: "left" } },
      ],
    ];

    const locationSums: Record<number, number> = {};
    for (const loc of knownLocations) locationSums[loc.id] = 0;

    tableBody = sortedItems.map((it, idx) => {
      const locCells = knownLocations.map((loc) => {
        const q = it.locationStocks ? (it.locationStocks[loc.id] || 0) : 0;
        locationSums[loc.id] = (locationSums[loc.id] || 0) + q;
        return q > 0 ? String(q) : "-";
      });

      return [
        String(idx + 1),
        it.sku,
        it.name,
        it.category || "Général",
        ...locCells,
        String(it.systemStock),
        "", // Comptage réel manuscrit
        "", // Écart
        "", // Observations
      ];
    });

    tableFoot = [
      [
        { content: "TOTAL GÉNÉRAL", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
        ...knownLocations.map((loc) => ({
          content: String(locationSums[loc.id] || 0),
          styles: { halign: "center" as const, fontStyle: "bold" as const },
        })),
        { content: String(totalStockCount), styles: { halign: "center", fontStyle: "bold" } },
        { content: "", styles: { halign: "center" } },
        { content: "", styles: { halign: "center" } },
        { content: "", styles: { halign: "center" } },
      ],
    ];

    columnStyles = {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 22, fontStyle: "bold" },
      2: { cellWidth: 54 },
      3: { cellWidth: 24 },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 16, halign: "center" },
      6: { cellWidth: 16, halign: "center" },
      7: { cellWidth: 16, halign: "center" },
      8: { cellWidth: 20, halign: "center", fontStyle: "bold", textColor: [0, 0, 0] },
      9: { cellWidth: 22, halign: "center", fillColor: [255, 255, 255] },
      10: { cellWidth: 15, halign: "center" },
      11: { cellWidth: 40 },
    };
  } else {
    // Mode Portrait : Emplacement spécifique (Fiche d'Inventaire Dépôt)
    tableHead = [
      [
        { content: "N°", styles: { halign: "center" } },
        { content: "Réf. SKU", styles: { halign: "left" } },
        { content: "Désignation de l'Article", styles: { halign: "left" } },
        { content: "Catégorie", styles: { halign: "left" } },
        { content: `Stock Dépôt (${data.locationCode || "DÉPÔT"})`, styles: { halign: "center", fontStyle: "bold" } },
        { content: "Comptage Réel", styles: { halign: "center", fontStyle: "bold" } },
        { content: "Écart", styles: { halign: "center" } },
        { content: "Observations", styles: { halign: "left" } },
      ],
    ];

    tableBody = sortedItems.map((it, idx) => {
      return [
        String(idx + 1),
        it.sku,
        it.name,
        it.category || "Général",
        String(it.systemStock),
        "", // Comptage réel manuscrit
        "", // Écart
        "", // Observations
      ];
    });

    tableFoot = [
      [
        { content: "TOTAL GÉNÉRAL", colSpan: 4, styles: { halign: "right", fontStyle: "bold" } },
        { content: String(totalStockCount), styles: { halign: "center", fontStyle: "bold" } },
        { content: "", styles: { halign: "center" } },
        { content: "", styles: { halign: "center" } },
        { content: "", styles: { halign: "center" } },
      ],
    ];

    columnStyles = {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 22, fontStyle: "bold" },
      2: { cellWidth: 50 },
      3: { cellWidth: 26 },
      4: { cellWidth: 22, halign: "center", fontStyle: "bold", textColor: [0, 0, 0] },
      5: { cellWidth: 20, halign: "center", fillColor: [255, 255, 255] },
      6: { cellWidth: 14, halign: "center" },
      7: { cellWidth: 20 },
    };
  }

  // 7. Génération du tableau avec jsPDF-AutoTable
  autoTable(doc, {
    startY: 43,
    head: tableHead,
    body: tableBody,
    foot: tableFoot,
    theme: "grid",
    showHead: "everyPage",
    showFoot: "lastPage",
    margin: { top: 16, bottom: 25, left: 14, right: 14 },
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1.5,
      overflow: "linebreak",
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: "bold",
      halign: "center",
      minCellHeight: 6,
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontSize: 7.5,
      fontStyle: "bold",
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles,
    didDrawPage: (hookData) => {
      // Rappel discret sur les pages suivantes
      if (hookData.pageNumber > 1) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(0, 0, 0);
        doc.text(
          `${shopName} — Fiche d'Inventaire Physique (${locationTitle}) — ${dateStr}`,
          14,
          11
        );
      }

      // Pied de page numéroté
      const pageStr = `Page ${hookData.pageNumber} sur {total_pages_count_string}`;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      doc.text(
        "Shop ERP — Document officiel de contrôle d'inventaire physique",
        14,
        pageHeight - 9
      );
      doc.text(pageStr, pageWidth - 14, pageHeight - 9, { align: "right" });
    },
  });

  // 8. Bloc Signatures sur la dernière page
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || pageHeight - 40;
  let signY = finalY + 8;
  if (signY + 26 > pageHeight - 12) {
    doc.addPage();
    signY = 20;
  }

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.line(14, signY, pageWidth - 14, signY);
  signY += 4;

  const colWidth = (pageWidth - 28) / 3;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);

  // Colonne 1 : Équipe d'inventaire
  doc.text("L'ÉQUIPE D'INVENTAIRE / COMPTAGE", 14 + colWidth * 0.5, signY + 3, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text("Nom(s), date et signature(s)", 14 + colWidth * 0.5, signY + 7, { align: "center" });

  // Colonne 2 : Responsable Stock
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("LE RESPONSABLE DÉPÔT / MAGASIN", 14 + colWidth * 1.5, signY + 3, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text("Observations, date et visa", 14 + colWidth * 1.5, signY + 7, { align: "center" });

  // Colonne 3 : Direction
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("VISA DIRECTION GÉNÉRALE", 14 + colWidth * 2.5, signY + 3, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text("Date, cachet et approbation", 14 + colWidth * 2.5, signY + 7, { align: "center" });

  // 9. Remplacement dynamique du nombre total de pages
  if (typeof doc.putTotalPages === "function") {
    doc.putTotalPages("{total_pages_count_string}");
  }

  // 10. Métadonnées du document PDF
  doc.setProperties({
    title: `Fiche d'Inventaire - ${locationTitle}`,
    subject: `Inventaire Physique - ${dateStr}`,
    author: shopName,
    creator: "Shop ERP Mobilier",
  });

  return doc;
}

/**
 * Génère et déclenche immédiatement le téléchargement du fichier PDF dans le navigateur
 */
export async function downloadInventoryPdf(options: GenerateInventoryPdfOptions): Promise<string> {
  const doc = await buildInventoryPdf(options);

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const dateFormatted = `${y}-${m}-${d}`;

  const isGlobal = options.data.isGlobal !== false && (!options.data.locationCode || options.data.locationCode === "GLOBAL");
  const locSlug = isGlobal ? "General" : sanitizeFileName(options.data.locationName);
  const fileName = `Fiche_Inventaire_${locSlug}_${dateFormatted}.pdf`;

  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 2000);

  return fileName;
}
