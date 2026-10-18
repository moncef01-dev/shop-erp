import type { Metadata } from "next";
import { SettingsClient } from "./SettingsClient";
import {
  getShopSettings,
  listBackupsAction,
  getSystemInfoAction,
  getLocationsAction,
} from "./actions";

export const metadata: Metadata = {
  title: "Paramètres, Sauvegarde & Sécurité | Shop ERP",
  description: "Configuration du magasin, identité commerciale, sauvegardes SQLite et sécurité des données.",
};

export default async function SettingsPage() {
  const [settings, backupRes, systemInfo, locations] = await Promise.all([
    getShopSettings(),
    listBackupsAction(),
    getSystemInfoAction(),
    getLocationsAction(),
  ]);

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <SettingsClient
        initialSettings={settings}
        initialBackups={backupRes.backups}
        initialLatestVerified={backupRes.latestVerified}
        initialSystemInfo={systemInfo}
        locations={locations}
      />
    </div>
  );
}
