import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Truck,
  Users,
  Building2,
  Wallet,
  FileText,
  BarChart3,
  Settings,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
}

export const navItems: NavItem[] = [
  {
    label: "Tableau de bord",
    href: "/",
    icon: LayoutDashboard,
    description: "Vue d'ensemble et indicateurs clés",
  },
  {
    label: "Produits & Stock",
    href: "/products",
    icon: Package,
    description: "Catalogue, catégories et inventaire",
  },
  {
    label: "Ventes",
    href: "/sales",
    icon: ShoppingCart,
    description: "Bons de vente et commandes clients",
  },
  {
    label: "Achats & Fournisseurs",
    href: "/purchases",
    icon: Truck,
    description: "Commandes fournisseurs, réceptions et dettes",
  },
  {
    label: "Clients",
    href: "/customers",
    icon: Users,
    description: "Répertoire et historique clients",
  },
  {
    label: "Fournisseurs",
    href: "/suppliers",
    icon: Building2,
    description: "Répertoire et contacts fournisseurs",
  },
  {
    label: "Caisse & Trésorerie",
    href: "/cash",
    icon: Wallet,
    description: "Caisse physique, trésorerie et charges",
  },
  {
    label: "Documents",
    href: "/documents",
    icon: FileText,
    description: "Factures, bons et reçus",
  },
  {
    label: "Rapports",
    href: "/reports",
    icon: BarChart3,
    description: "Statistiques et analyses d'activité",
  },
  {
    label: "Paramètres",
    href: "/settings",
    icon: Settings,
    description: "Configuration de l'application",
  },
];
