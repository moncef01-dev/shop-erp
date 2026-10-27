import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { PreventWheelOnNumberInputs } from "@/components/common/PreventWheelOnNumberInputs";

export const metadata: Metadata = {
  title: {
    default: "Shop ERP — Gestion de Mobilier",
    template: "%s | Shop ERP",
  },
  description:
    "ERP local pour magasin de meubles — catalogue, stock, ventes, achats, caisse et livraisons.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        <PreventWheelOnNumberInputs />
        <div id="app-root" className="app-shell flex flex-col min-h-screen">
          <Sidebar />
          {/* Main area offset by the fixed sidebar width */}
          <div className="pl-64 flex flex-col min-h-screen flex-1">
            <TopBar />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
        {/* Isolated portal container for print documents */}
        <div id="print-root" className="print-root" />
      </body>
    </html>
  );
}
