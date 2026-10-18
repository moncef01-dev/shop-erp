"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export type DeliveryActionResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
};

function safeRevalidate(path: string) {
  try {
    revalidatePath(path);
  } catch {
    // Silently ignore outside Next.js request context
  }
}

import {
  VALID_DELIVERY_STATUSES,
  STATUS_LABELS,
  type DeliveryStatusType,
} from "./types";

export async function getDeliveriesModuleData() {
  const [deliveries, settings] = await Promise.all([
    prisma.delivery.findMany({
      include: {
        sale: {
          include: {
            customer: true,
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    sku: true,
                    name: true,
                    model: true,
                    color: true,
                    sellingPrice: true,
                  },
                },
                location: {
                  select: { id: true, code: true, name: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.shopSettings.findUnique({ where: { id: 1 } }),
  ]);

  const todayStr = new Date().toISOString().slice(0, 10);

  // Normalisation des livraisons avec métadonnées client et vente
  const normalizedDeliveries = deliveries.map((d) => {
    const sale = d.sale;
    const customer = sale?.customer;
    const isPickup = d.method === "store_pickup";
    const plannedDateStr = d.deliveryDate ? new Date(d.deliveryDate).toISOString().slice(0, 10) : null;
    const isToday = plannedDateStr === todayStr;

    return {
      ...d,
      saleRef: sale?.reference || "—",
      saleDate: sale?.saleDate || null,
      customerName: customer?.name || "Client Passager",
      customerPhone: customer?.phone || null,
      customerAddress: customer?.address || null,
      totalAmount: sale?.totalAmount || 0,
      paidAmount: sale?.paidAmount || 0,
      isPickup,
      isToday,
      items: sale?.items || [],
    };
  });

  // Indicateurs clés pour le tableau de bord
  const totalDeliveries = normalizedDeliveries.length;

  // En attente domicile : méthode home_delivery et statut non terminé
  const pendingHomeDeliveries = normalizedDeliveries.filter(
    (d) =>
      !d.isPickup &&
      ["to_prepare", "pending", "ready", "in_transit"].includes(d.status)
  );

  // Prévues aujourd'hui
  const plannedTodayCount = normalizedDeliveries.filter(
    (d) => d.isToday && ["to_prepare", "pending", "ready", "in_transit"].includes(d.status)
  ).length;

  // Retraits magasin
  const storePickupsCount = normalizedDeliveries.filter((d) => d.isPickup).length;

  // Terminées (Livrées)
  const completedCount = normalizedDeliveries.filter((d) => d.status === "delivered").length;

  return {
    deliveries: normalizedDeliveries,
    settings,
    metrics: {
      totalDeliveries,
      pendingHomeCount: pendingHomeDeliveries.length,
      plannedTodayCount,
      storePickupsCount,
      completedCount,
    },
  };
}

export async function updateDeliveryStatusAction(
  deliveryId: number,
  newStatus: string,
  extra?: {
    carrierName?: string;
    recipientName?: string;
    notes?: string;
    deliveredAt?: string;
  }
): Promise<DeliveryActionResponse> {
  try {
    if (!VALID_DELIVERY_STATUSES.includes(newStatus as DeliveryStatusType)) {
      return { success: false, error: "Statut de livraison non valide." };
    }

    const delivery = await prisma.delivery.findUnique({
      where: { id: deliveryId },
    });
    if (!delivery) return { success: false, error: "Fiche livraison introuvable." };

    const isDelivered = newStatus === "delivered";
    const deliveredAtValue = isDelivered
      ? extra?.deliveredAt
        ? new Date(extra.deliveredAt)
        : delivery.deliveredAt || new Date()
      : delivery.deliveredAt;

    await prisma.$transaction(async (tx) => {
      await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status: newStatus,
          carrierName: extra?.carrierName !== undefined ? extra.carrierName.trim() || null : delivery.carrierName,
          recipientName: extra?.recipientName !== undefined ? extra.recipientName.trim() || null : delivery.recipientName,
          notes: extra?.notes !== undefined ? extra.notes.trim() || null : delivery.notes,
          deliveredAt: deliveredAtValue,
        },
      });

      if (delivery.saleId) {
        await tx.sales.update({
          where: { id: delivery.saleId },
          data: { deliveryStatus: newStatus },
        });
      }
    });

    safeRevalidate("/deliveries");
    safeRevalidate("/sales");
    safeRevalidate("/documents");

    const statusObj = STATUS_LABELS[newStatus];
    return {
      success: true,
      message: `Statut mis à jour : ${statusObj?.label || newStatus}.`,
    };
  } catch (err: unknown) {
    console.error("Erreur statut livraison:", err);
    return { success: false, error: "Erreur lors de la mise à jour de la livraison." };
  }
}

export async function updateDeliveryMethodAction(
  deliveryId: number,
  method: "home_delivery" | "store_pickup",
  address?: string
): Promise<DeliveryActionResponse> {
  try {
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!delivery) return { success: false, error: "Fiche livraison introuvable." };

    await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        method,
        address: method === "store_pickup" ? "Retrait au magasin" : (address?.trim() || delivery.address),
      },
    });

    safeRevalidate("/deliveries");
    safeRevalidate("/sales");
    safeRevalidate("/documents");

    return {
      success: true,
      message: `Mode de délivrance mis à jour : ${method === "store_pickup" ? "Retrait au magasin" : "Livraison à domicile"}.`,
    };
  } catch (err: unknown) {
    console.error("Erreur mise à jour mode livraison:", err);
    return { success: false, error: "Erreur lors de la modification du mode de livraison." };
  }
}
