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
  CreditCard,
  LineChart,
  ArrowUpRight,
  Receipt,
  Landmark,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Coins,
  Lock,
  BookOpen,
} from "lucide-react";

export interface SubNavItem {
  label: string;
  href: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description?: string;
  subItems?: SubNavItem[];
}

export const treasurySubItems: SubNavItem[] = [
  {
    label: "Journal journalier",
    href: "/cash/journal",
    icon: BookOpen,
  },
  {
    label: "Situation financière globale",
    href: "/cash",
    icon: LineChart,
  },
  {
    label: "Paiements Clients",
    href: "/cash/customer-payments",
    icon: CreditCard,
  },
  {
    label: "Paiement Fournisseurs",
    href: "/cash/supplier-payments",
    icon: ArrowUpRight,
  },
  {
    label: "Charges",
    href: "/cash/expenses",
    icon: Receipt,
  },
  {
    label: "Compte",
    href: "/cash/accounts",
    icon: Landmark,
  },
  {
    label: "Apport",
    href: "/cash/deposits",
    icon: ArrowDownToLine,
  },
  {
    label: "Retrait",
    href: "/cash/withdrawals",
    icon: ArrowUpFromLine,
  },
  {
    label: "Mouvement",
    href: "/cash/transfers",
    icon: ArrowLeftRight,
  },
  {
    label: "Acompte",
    href: "/cash/advances",
    icon: Coins,
  },
  {
    label: "Clôture Caisse",
    href: "/cash/closing",
    icon: Lock,
  },
];

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
    description: "Comptes fournisseurs, dettes initiales et règlements",
  },
  {
    label: "Trésorerie",
    href: "/cash",
    icon: Wallet,
    description: "Comptes, mouvements, règlements, charges et clôture",
    subItems: treasurySubItems,
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
