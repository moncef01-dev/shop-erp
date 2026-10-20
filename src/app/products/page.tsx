import type { Metadata } from "next";
import { getProductsModuleData } from "./actions";
import { ProductsModuleClient } from "./ProductsModuleClient";

export const metadata: Metadata = {
  title: "Produits & Stock",
  description: "Gestion du catalogue de meubles, des emplacements et de l'inventaire.",
};

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const { products, categories, locations, movements, todayMovementsCount } = await getProductsModuleData();

  return (
    <ProductsModuleClient
      initialProducts={products}
      initialCategories={categories}
      initialLocations={locations}
      initialMovements={movements}
      initialTodayMovementsCount={todayMovementsCount}
    />
  );
}
