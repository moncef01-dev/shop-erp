"use server";

import {
  generateNextCustomerCode,
  findCustomersWithSales,
  findCustomerByPhone,
  findCustomerById,
  findCustomerWithSalesCount,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  findCustomerDetailsById,
} from "@/server/repositories/customers.repository";
import { revalidatePath } from "next/cache";

export type CustomerActionResponse<T = unknown> = {
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

export async function getCustomersData(searchQuery?: string) {
  const customers = await findCustomersWithSales(searchQuery);

  return customers.map((c) => {
    const totalPurchases = c.sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalPaid = c.sales.reduce((sum, s) => sum + s.paidAmount, 0);
    const outstandingBalance = Math.max(0, totalPurchases - totalPaid);
    const lastSale = c.sales[0];

    return {
      ...c,
      totalPurchases,
      totalPaid,
      outstandingBalance,
      lastPurchaseDate: lastSale ? lastSale.saleDate : null,
      confirmedSalesCount: c.sales.length,
    };
  });
}

export async function createCustomerAction(formData: FormData): Promise<CustomerActionResponse> {
  try {
    const name = (formData.get("name") as string)?.trim();
    const phone = (formData.get("phone") as string)?.trim() || null;
    const phone2 = (formData.get("phone2") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const address = (formData.get("address") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!name || name.length < 2) {
      return { success: false, error: "Le nom du client est obligatoire (au moins 2 caractères)." };
    }

    // Contrôler si un client avec le même téléphone existe déjà
    if (phone) {
      const existing = await findCustomerByPhone(phone);
      if (existing) {
        return {
          success: false,
          error: `Un client nommé "${existing.name}" est déjà enregistré avec ce numéro de téléphone (${phone}).`,
        };
      }
    }

    const code = await generateNextCustomerCode();

    const customer = await createCustomer({
      code,
      name,
      phone,
      phone2,
      email,
      address,
      notes,
      isActive: true,
    });

    safeRevalidate("/customers");
    safeRevalidate("/sales");

    return {
      success: true,
      message: `Client "${customer.name}" (${customer.code}) enregistré avec succès.`,
      data: customer,
    };
  } catch (err: unknown) {
    console.error("Erreur création client:", err);
    return { success: false, error: "Erreur lors de la création de la fiche client." };
  }
}

export async function updateCustomerAction(
  customerId: number,
  formData: FormData
): Promise<CustomerActionResponse> {
  try {
    const name = (formData.get("name") as string)?.trim();
    const phone = (formData.get("phone") as string)?.trim() || null;
    const phone2 = (formData.get("phone2") as string)?.trim() || null;
    const email = (formData.get("email") as string)?.trim() || null;
    const address = (formData.get("address") as string)?.trim() || null;
    const notes = (formData.get("notes") as string)?.trim() || null;

    if (!name || name.length < 2) {
      return { success: false, error: "Le nom du client est obligatoire." };
    }

    const existing = await findCustomerById(customerId);
    if (!existing) {
      return { success: false, error: "Fiche client introuvable." };
    }

    if (phone) {
      const dup = await findCustomerByPhone(phone, customerId);
      if (dup) {
        return {
          success: false,
          error: `Le numéro de téléphone ${phone} est déjà utilisé par le client "${dup.name}".`,
        };
      }
    }

    const updated = await updateCustomer(customerId, {
      name,
      phone,
      phone2,
      email,
      address,
      notes,
    });

    safeRevalidate("/customers");
    safeRevalidate("/sales");

    return {
      success: true,
      message: `Fiche de "${updated.name}" mise à jour avec succès.`,
      data: updated,
    };
  } catch (err: unknown) {
    console.error("Erreur modification client:", err);
    return { success: false, error: "Erreur lors de la modification de la fiche client." };
  }
}

export async function toggleCustomerStatusAction(customerId: number): Promise<CustomerActionResponse> {
  try {
    const customer = await findCustomerById(customerId);
    if (!customer) {
      return { success: false, error: "Fiche client introuvable." };
    }

    const newStatus = !customer.isActive;
    await updateCustomer(customerId, { isActive: newStatus });

    safeRevalidate("/customers");
    safeRevalidate("/sales");

    return {
      success: true,
      message: `Le client "${customer.name}" est désormais ${newStatus ? "Actif" : "Inactif"}.`,
    };
  } catch (err: unknown) {
    console.error("Erreur statut client:", err);
    return { success: false, error: "Impossible de modifier le statut du client." };
  }
}

export async function deleteCustomerAction(customerId: number): Promise<CustomerActionResponse> {
  try {
    const customer = await findCustomerWithSalesCount(customerId);

    if (!customer) {
      return { success: false, error: "Fiche client introuvable." };
    }

    if (customer._count.sales > 0) {
      return {
        success: false,
        error: `Impossible de supprimer définitivement le client "${customer.name}" car ${customer._count.sales} vente(s) lui sont rattachée(s). Pour préserver l'historique et la traçabilité comptable, veuillez plutôt le désactiver.`,
      };
    }

    await deleteCustomer(customerId);

    safeRevalidate("/customers");
    safeRevalidate("/sales");

    return {
      success: true,
      message: `Client "${customer.name}" supprimé avec succès.`,
    };
  } catch (err: unknown) {
    console.error("Erreur suppression client:", err);
    return { success: false, error: "Erreur lors de la suppression de la fiche client." };
  }
}

export async function getCustomerDetailsAction(customerId: number) {
  const customer = await findCustomerDetailsById(customerId);

  if (!customer) return null;

  const validSales = customer.sales.filter((s) => s.status !== "cancelled");
  const totalPurchases = validSales.reduce((sum, s) => sum + s.totalAmount, 0);
  const totalPaid = validSales.reduce((sum, s) => sum + s.paidAmount, 0);
  const outstandingBalance = Math.max(0, totalPurchases - totalPaid);

  return {
    ...customer,
    totalPurchases,
    totalPaid,
    outstandingBalance,
    salesCount: validSales.length,
  };
}
