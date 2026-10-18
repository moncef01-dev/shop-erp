import type { Metadata } from "next";
import {
  Package,
  ShoppingCart,
  Truck,
  PackageCheck,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Tableau de bord",
};

export const dynamic = "force-dynamic";

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "amber" | "blue" | "green" | "rose";
}

const accentMap = {
  amber: {
    bg: "bg-amber-50",
    icon: "bg-amber-100 text-amber-600",
    border: "border-amber-200",
  },
  blue: {
    bg: "bg-blue-50",
    icon: "bg-blue-100 text-blue-600",
    border: "border-blue-200",
  },
  green: {
    bg: "bg-green-50",
    icon: "bg-green-100 text-green-600",
    border: "border-green-200",
  },
  rose: {
    bg: "bg-rose-50",
    icon: "bg-rose-100 text-rose-600",
    border: "border-rose-200",
  },
};

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  accent,
}: SummaryCardProps) {
  const colors = accentMap[accent];
  return (
    <div className={`rounded-xl border ${colors.border} ${colors.bg} p-5 flex items-start gap-4`}>
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${colors.icon}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        <p className="mt-0.5 text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">{value}</p>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
      <AlertTriangle className="mb-2 h-8 w-8 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const [
    productsCount,
    confirmedSales,
    purchasesCount,
    pendingDeliveriesCount,
    recentPayments,
    allProducts,
  ] = await Promise.all([
    prisma.product.count({ where: { isActive: true } }),
    prisma.sales.findMany({
      where: { status: "confirmed" },
      select: { totalAmount: true, paidAmount: true },
    }),
    prisma.purchase.count(),
    prisma.delivery.count({ where: { status: { in: ["pending", "in_transit"] } } }),
    prisma.payment.findMany({
      where: { status: "completed" },
      take: 5,
      orderBy: { paymentDate: "desc" },
      include: {
        sale: {
          select: {
            reference: true,
            customer: { select: { name: true } },
          },
        },
      },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, stock: true, minStock: true },
    }),
  ]);

  const totalRevenue = confirmedSales.reduce((acc, s) => acc + s.totalAmount, 0);
  const lowStockProducts = allProducts.filter((p) => p.stock <= p.minStock);

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Bienvenue sur votre Espace de Gestion 👋
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Aperçu en temps réel de votre magasin de meubles. Suivi des stocks, catalogue, facturation et créances clients.
            </p>
          </div>
          <TrendingUp className="h-6 w-6 text-slate-300" />
        </div>
      </div>

      {/* Summary cards with real data */}
      <section>
        <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-500">
          Indicateurs Clés du Magasin
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            title="Produits au Catalogue"
            value={String(productsCount)}
            subtitle={`${productsCount} meuble(s) actif(s)`}
            icon={Package}
            accent="amber"
          />
          <SummaryCard
            title="Chiffre d'Affaires Ventes"
            value={`${totalRevenue.toLocaleString("fr-DZ")} DA`}
            subtitle={`${confirmedSales.length} vente(s) facturée(s)`}
            icon={ShoppingCart}
            accent="blue"
          />
          <SummaryCard
            title="Achats Fournisseurs"
            value={String(purchasesCount)}
            subtitle={`${purchasesCount} commande(s) d'achat`}
            icon={Truck}
            accent="green"
          />
          <SummaryCard
            title="Livraisons en Cours"
            value={String(pendingDeliveriesCount)}
            subtitle={`${pendingDeliveriesCount} colis à livrer`}
            icon={PackageCheck}
            accent="rose"
          />
        </div>
      </section>

      {/* Recent Payments & Transactions */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Derniers Règlements Encaissés
          </h3>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          {recentPayments.length === 0 ? (
            <EmptyState message="Aucun règlement récent — les encaissements apparaîtront ici." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Référence</th>
                    <th className="py-3 px-4">Facture / Client</th>
                    <th className="py-3 px-4">Mode</th>
                    <th className="py-3 px-4 text-right">Montant (DA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentPayments.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 text-slate-600">
                        {new Date(p.paymentDate).toLocaleDateString("fr-DZ")}
                      </td>
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">
                        {p.reference || `PAY-${p.id}`}
                      </td>
                      <td className="py-2.5 px-4 text-slate-800">
                        <span className="font-semibold">{p.sale?.reference || "Vente directe"}</span>
                        {p.sale?.customer?.name && (
                          <span className="text-slate-500 ml-1">({p.sale.customer.name})</span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 capitalize text-slate-600">
                        {p.method === "cash"
                          ? "Espèces"
                          : p.method === "cib"
                          ? "CIB / Edahabia"
                          : p.method === "check"
                          ? "Chèque"
                          : "Virement"}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-emerald-700">
                        +{p.amount.toLocaleString("fr-DZ")} DA
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Low stock alert section */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
            Alertes Stock Faible ({lowStockProducts.length})
          </h3>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          {lowStockProducts.length === 0 ? (
            <EmptyState message="Tous les meubles ont un stock supérieur à leur seuil minimum." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold">
                    <th className="py-3 px-4">Référence</th>
                    <th className="py-3 px-4">Meuble</th>
                    <th className="py-3 px-4 text-center">Stock Actuel</th>
                    <th className="py-3 px-4 text-center">Seuil Minimum</th>
                    <th className="py-3 px-4 text-right">État</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lowStockProducts.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-mono font-bold text-slate-900">{p.sku}</td>
                      <td className="py-2.5 px-4 font-semibold text-slate-800">{p.name}</td>
                      <td className="py-2.5 px-4 text-center font-mono font-bold text-rose-700">
                        {p.stock}
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono text-slate-500">
                        {p.minStock}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className="inline-block bg-rose-100 text-rose-800 text-xs font-bold px-2.5 py-1 rounded-md">
                          {p.stock === 0 ? "Rupture" : "Stock Faible"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
