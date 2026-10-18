export const VALID_DELIVERY_STATUSES = [
  "to_prepare",
  "ready",
  "in_transit",
  "delivered",
  "postponed",
  "cancelled",
  "pending", // Pour compatibilité historique
] as const;

export type DeliveryStatusType = (typeof VALID_DELIVERY_STATUSES)[number];

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  to_prepare: { label: "À préparer", color: "bg-amber-100 text-amber-900 border-amber-300" },
  pending: { label: "À préparer", color: "bg-amber-100 text-amber-900 border-amber-300" },
  ready: { label: "Prête à livrer", color: "bg-blue-100 text-blue-900 border-blue-300" },
  in_transit: { label: "En cours de livraison", color: "bg-indigo-100 text-indigo-900 border-indigo-300" },
  delivered: { label: "Livrée", color: "bg-emerald-100 text-emerald-900 border-emerald-300" },
  postponed: { label: "Reportée", color: "bg-orange-100 text-orange-900 border-orange-300" },
  cancelled: { label: "Annulée", color: "bg-rose-100 text-rose-900 border-rose-300" },
};
