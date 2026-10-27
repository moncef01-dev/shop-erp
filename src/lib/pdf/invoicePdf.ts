import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { PrintableSale } from "@/components/sales/PrintableInvoice";
import type { ShopSettingsData } from "@/app/settings/actions";

export type InvoiceCopyType = "client" | "internal" | "both";

export interface GenerateInvoicePdfOptions {
  sale: PrintableSale;
  settings?: ShopSettingsData | null;
  copyType?: InvoiceCopyType;
}

function formatDAPdf(amount: number): string {
  return `${amount.toLocaleString("fr-DZ")} DA`;
}

function renderInvoicePage(
  doc: jsPDF,
  sale: PrintableSale,
  settings: ShopSettingsData | null | undefined,
  copyType: "client" | "internal"
) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const isInternal = copyType === "internal";

  // 1. En-tête Entreprise
  const shopName = settings?.shopName || "Shop ERP Mobilier";
  const shopActivity = settings?.activity || "Magasin d'Ameublement & Décoration d'Intérieur";
  const shopAddress = settings?.address || "Alger, Algérie";
  const shopPhone = settings?.phone || "+213 (0) 550 12 34 56";
  const shopNif = settings?.nifRc ? `NIF/RC: ${settings.nifRc}` : "";

  // Titre & Réf du document
  const isDraft = sale.status === "draft";
  const isCancelled = sale.status === "cancelled";
  const docTitle = isCancelled
    ? "FACTURE ANNULÉE"
    : isDraft
    ? "DEVIS / BON DE COMMANDE"
    : "FACTURE DE VENTE";

  doc.setTextColor(0, 0, 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(docTitle, pageWidth - 14, 23, { align: "right" });

  doc.setFont("courier", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text(sale.reference, pageWidth - 14, 29, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  const saleDateStr = new Date(sale.saleDate).toLocaleDateString("fr-DZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  doc.text(`Date : ${saleDateStr}`, pageWidth - 14, 34, { align: "right" });

  const pStatusStr =
    sale.paymentStatus === "paid"
      ? "PAYÉE (COMPTANT / SOLDÉE)"
      : sale.paymentStatus === "partial"
      ? "PARTIELLEMENT RÉGLÉE (ACOMPTE)"
      : "À CRÉDIT / NON RÉGLÉE";
  doc.setFont("helvetica", "bold");
  doc.text(`Règlement : ${pStatusStr}`, pageWidth - 14, 38.5, { align: "right" });

  // Coordonnées Magasin (gauche)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(shopName, 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text(shopActivity, 14, 23);
  doc.text(shopAddress, 14, 27.5);
  doc.text(`Tél : ${shopPhone}`, 14, 32);
  if (shopNif) doc.text(shopNif, 14, 36.5);

  // Ligne de séparation
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.line(14, 42, pageWidth - 14, 42);

  // 2. Bloc Client (Cadre)
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, 45, pageWidth - 28, 25, 1, 1, "F");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, 45, pageWidth - 28, 25, 1, 1, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("CLIENT / DESTINATAIRE :", 18, 50.5);

  if (sale.customer) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(0, 0, 0);
    doc.text(sale.customer.name.toUpperCase(), 18, 56.5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    const code = sale.customer.code || `CLI-${sale.customer.id}`;
    let phoneText = sale.customer.phone ? `Tél : ${sale.customer.phone}` : "Tél : Non renseigné";
    const phone2 = (sale.customer as { phone2?: string | null }).phone2;
    if (phone2) {
      phoneText += ` / ${phone2}`;
    }
    doc.text(`Code : ${code}  •  ${phoneText}`, 18, 61.5);

    if (sale.customer.address) {
      doc.text(`Adresse : ${sale.customer.address}`, 18, 66);
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text("Client Passager / Vente Comptoir", 18, 58);
  }

  // 3. Tableau des Articles
  const tableHeaders = isInternal
    ? ["Réf / SKU", "Désignation & Modèle", "Dépôt", "Qté", "P.U (DA)", "Remise", "Total Net (DA)"]
    : ["Réf / SKU", "Désignation & Modèle", "Qté", "P.U (DA)", "Remise", "Total Net (DA)"];

  const tableBody = (sale.items || []).map((item) => {
    const sku = item.product?.sku || "—";
    let name = item.product?.name || "Article Mobilier";
    if (item.product?.model) name += ` (${item.product.model})`;
    const locationName = item.location?.name || "Magasin";
    const qty = item.quantity;
    const pu = formatDAPdf(item.unitPrice);
    const disc = (item.discount || 0) > 0 ? formatDAPdf(item.discount || 0) : "—";
    const total = formatDAPdf(item.subtotal);

    return isInternal
      ? [sku, name, locationName, String(qty), pu, disc, total]
      : [sku, name, String(qty), pu, disc, total];
  });

  autoTable(doc, {
    startY: 73,
    head: [tableHeaders],
    body: tableBody,
    theme: "grid",
    headStyles: {
      fillColor: [0, 0, 0],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      halign: "left",
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [0, 0, 0],
      cellPadding: 2.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: isInternal
      ? {
          0: { cellWidth: 24, font: "courier", fontStyle: "bold" },
          1: { cellWidth: "auto", fontStyle: "bold" },
          2: { cellWidth: 26 },
          3: { cellWidth: 12, halign: "center", fontStyle: "bold" },
          4: { cellWidth: 22, halign: "right" },
          5: { cellWidth: 18, halign: "right" },
          6: { cellWidth: 24, halign: "right", fontStyle: "bold" },
        }
      : {
          0: { cellWidth: 28, font: "courier", fontStyle: "bold" },
          1: { cellWidth: "auto", fontStyle: "bold" },
          2: { cellWidth: 14, halign: "center", fontStyle: "bold" },
          3: { cellWidth: 25, halign: "right" },
          4: { cellWidth: 20, halign: "right" },
          5: { cellWidth: 28, halign: "right", fontStyle: "bold" },
        },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY || 140;

  // 4. Totaux & Règlements
  const totalsY = finalY + 6;
  const totalsBoxWidth = 84;
  const totalsBoxX = pageWidth - 14 - totalsBoxWidth;

  doc.setFillColor(255, 255, 255);
  doc.roundedRect(totalsBoxX, totalsY, totalsBoxWidth, 42, 1, 1, "F");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.roundedRect(totalsBoxX, totalsY, totalsBoxWidth, 42, 1, 1, "S");

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);

  const subtotal = sale.subtotal || sale.totalAmount;
  doc.text("Sous-total brut :", totalsBoxX + 4, totalsY + 6);
  doc.text(formatDAPdf(subtotal), totalsBoxX + totalsBoxWidth - 4, totalsY + 6, { align: "right" });

  if ((sale.discount || 0) > 0) {
    doc.text("Remise accordée :", totalsBoxX + 4, totalsY + 11.5);
    doc.text(`-${formatDAPdf(sale.discount || 0)}`, totalsBoxX + totalsBoxWidth - 4, totalsY + 11.5, {
      align: "right",
    });
  }

  if ((sale.deliveryFee || 0) > 0) {
    const isIncluded = sale.includeDeliveryFee !== false;
    const label = isIncluded ? "Frais de livraison :" : "Frais livraison (hors fact.) :";
    const prefix = isIncluded ? "+" : "";
    doc.text(label, totalsBoxX + 4, totalsY + 17);
    doc.text(`${prefix}${formatDAPdf(sale.deliveryFee || 0)}`, totalsBoxX + totalsBoxWidth - 4, totalsY + 17, {
      align: "right",
    });
  }

  // Ligne de total
  doc.setLineWidth(0.4);
  doc.line(totalsBoxX + 4, totalsY + 20.5, totalsBoxX + totalsBoxWidth - 4, totalsY + 20.5);

  // Total TTC
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text("TOTAL NET À PAYER :", totalsBoxX + 4, totalsY + 26);
  doc.text(formatDAPdf(sale.totalAmount), totalsBoxX + totalsBoxWidth - 4, totalsY + 26, { align: "right" });

  // Acompte / Versé
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Montant Versé / Acompte :", totalsBoxX + 4, totalsY + 32);
  doc.text(formatDAPdf(sale.paidAmount || 0), totalsBoxX + totalsBoxWidth - 4, totalsY + 32, { align: "right" });

  // Reste Dû
  const remaining = Math.max(0, (sale.totalAmount || 0) - (sale.paidAmount || 0));
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Solde Restant Dû :", totalsBoxX + 4, totalsY + 38);
  doc.text(formatDAPdf(remaining), totalsBoxX + totalsBoxWidth - 4, totalsY + 38, { align: "right" });

  // Détails règlement (gauche)
  const leftBoxWidth = totalsBoxX - 14 - 6;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(14, totalsY, leftBoxWidth, 42, 1, 1, "F");
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.roundedRect(14, totalsY, leftBoxWidth, 42, 1, 1, "S");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(0, 0, 0);
  doc.text("MODALITÉS DE RÈGLEMENT & ACOMPTES :", 18, totalsY + 6);

  if (sale.payments && sale.payments.length > 0) {
    let pY = totalsY + 11.5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);

    sale.payments.slice(0, 3).forEach((p) => {
      const pDate = new Date(p.paymentDate).toLocaleDateString("fr-DZ");
      const pMode = p.method === "cash" ? "Espèces" : p.method === "transfer" ? "Virement" : "Autre";
      const pRef = p.reference ? `(${p.reference})` : "";
      doc.text(`• ${pDate} : ${formatDAPdf(p.amount)} par ${pMode} ${pRef}`, 18, pY);
      pY += 4.5;
    });

    if (sale.payments.length > 3) {
      doc.text(`... et ${sale.payments.length - 3} autre(s) versement(s)`, 18, pY);
    }
  } else {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.text("Aucun acompte encaissé lors de la création.", 18, totalsY + 12);
  }

  // Internal Notes (only visible on Internal copy)
  if (isInternal && sale.notes) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text("NOTES & DIRECTIVES INTERNES MAGASIN :", 18, totalsY + 29);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text(sale.notes.slice(0, 80), 18, totalsY + 34);
  }

  // 5. Signatures & Mentions Légales
  const sigY = totalsY + 48;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.4);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(18, sigY + 16, 75, sigY + 16);
  doc.line(pageWidth - 75, sigY + 16, pageWidth - 18, sigY + 16);
  doc.setLineDashPattern([], 0);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 0);
  doc.text("Cachet & Signature Magasin", 18, sigY);
  doc.text("Signature & Accord Client", pageWidth - 75, sigY);

  // Bas de page
  const footerText =
    settings?.documentFooter ||
    "Les marchandises livrées demeurent la propriété du magasin jusqu'au complet paiement du prix conformément aux clauses de réserve de propriété.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.text(footerText, pageWidth / 2, pageHeight - 8, { align: "center" });
}

export async function buildInvoicePdf({
  sale,
  settings,
  copyType = "client",
}: GenerateInvoicePdfOptions): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  if (copyType === "client") {
    renderInvoicePage(doc, sale, settings, "client");
  } else if (copyType === "internal") {
    renderInvoicePage(doc, sale, settings, "internal");
  } else {
    // Both copies: page 1 Client, page 2 Internal
    renderInvoicePage(doc, sale, settings, "client");
    doc.addPage("a4", "portrait");
    renderInvoicePage(doc, sale, settings, "internal");
  }

  return doc;
}

export async function downloadInvoicePdf(
  sale: PrintableSale,
  settings: ShopSettingsData | null | undefined,
  copyType: InvoiceCopyType = "client"
) {
  const doc = await buildInvoicePdf({ sale, settings, copyType });
  const ref = sale.reference || "FACTURE";
  const suffix = copyType === "both" ? "CLIENT_ET_INTERNE" : copyType === "internal" ? "INTERNE" : "CLIENT";
  doc.save(`${ref}_${suffix}.pdf`);
}
