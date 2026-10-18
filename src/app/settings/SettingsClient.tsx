"use client";

import React, { useState, useTransition } from "react";
import {
  Store,
  Database,
  CalendarClock,
  ShieldCheck,
  Upload,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  HardDrive,
  Check,
  AlertCircle,
  Clock,
  Info,
  Server,
  DownloadCloud,
} from "lucide-react";
import {
  type ShopSettingsData,
  type BackupFileInfo,
  type SystemInfo,
  updateShopSettingsAction,
  uploadLogoAction,
  deleteLogoAction,
  createBackupAction,
  listBackupsAction,
  verifyBackupAction,
  deleteBackupAction,
  restoreBackupAction,
} from "./actions";

interface SettingsClientProps {
  initialSettings: ShopSettingsData;
  initialBackups: BackupFileInfo[];
  initialLatestVerified?: string;
  initialSystemInfo: SystemInfo;
  locations: Array<{ id: number; name: string; code: string }>;
}

export function SettingsClient({
  initialSettings,
  initialBackups,
  initialLatestVerified,
  initialSystemInfo,
  locations,
}: SettingsClientProps) {
  const [activeTab, setActiveTab] = useState<"identity" | "backup" | "scheduler" | "system">("identity");
  const [settings, setSettings] = useState<ShopSettingsData>(initialSettings);
  const [backups, setBackups] = useState<BackupFileInfo[]>(initialBackups);
  const [latestVerified, setLatestVerified] = useState<string | undefined>(initialLatestVerified);
  const [systemInfo] = useState<SystemInfo>(initialSystemInfo);

  // Form states
  const [shopName, setShopName] = useState(settings.shopName || "");
  const [activity, setActivity] = useState(settings.activity || "");
  const [legalForm, setLegalForm] = useState(settings.legalForm || "");
  const [address, setAddress] = useState(settings.address || "");
  const [phone, setPhone] = useState(settings.phone || "");
  const [email, setEmail] = useState(settings.email || "");
  const [nifRc, setNifRc] = useState(settings.nifRc || "");
  const [nis, setNis] = useState(settings.nis || "");
  const [documentFooter, setDocumentFooter] = useState(settings.documentFooter || "");
  const [currency] = useState("DA");
  const [defaultLocationId, setDefaultLocationId] = useState<number | "">(
    settings.defaultLocationId ?? ""
  );
  const [backupRetentionCount, setBackupRetentionCount] = useState<number>(
    settings.backupRetentionCount ?? 30
  );

  // Status feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; message: string } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  // Logo upload state
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(settings.logoUrl || null);

  // Modals for Restore and Delete
  const [restoreModalBackup, setRestoreModalBackup] = useState<BackupFileInfo | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [deleteModalBackup, setDeleteModalBackup] = useState<BackupFileInfo | null>(null);

  // Clear feedback after 5 seconds
  const showFeedback = (type: "success" | "error" | "info", message: string) => {
    setFeedback({ type, message });
    setTimeout(() => {
      setFeedback((curr) => (curr?.message === message ? null : curr));
    }, 6000);
  };

  // ─── 1. SAUVEGARDE DES PARAMÈTRES GÉNÉRAUX ────────────────────────────────
  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateShopSettingsAction({
        shopName,
        activity,
        legalForm,
        address,
        phone,
        email,
        nifRc,
        nis,
        documentFooter,
        currency,
        defaultLocationId: defaultLocationId === "" ? null : Number(defaultLocationId),
        backupRetentionCount: Number(backupRetentionCount),
      });

      if (res.success && res.settings) {
        setSettings(res.settings);
        showFeedback("success", "Les paramètres du magasin ont été enregistrés avec succès.");
      } else {
        showFeedback("error", res.error || "Impossible d'enregistrer les paramètres.");
      }
    });
  };

  // ─── 2. GESTION DU LOGO ────────────────────────────────────────────────────
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showFeedback("error", "La taille du logo ne doit pas dépasser 2 Mo.");
        return;
      }
      setLogoFile(file);
      setLogoPreview(URL.createObjectURL(file));
    }
  };

  const handleUploadLogo = () => {
    if (!logoFile) return;
    const formData = new FormData();
    formData.append("logo", logoFile);

    startTransition(async () => {
      const res = await uploadLogoAction(formData);
      if (res.success && res.logoUrl) {
        setSettings((prev) => ({ ...prev, logoUrl: res.logoUrl || null }));
        setLogoPreview(res.logoUrl);
        setLogoFile(null);
        showFeedback("success", "Logo du magasin téléversé et appliqué aux documents.");
      } else {
        showFeedback("error", res.error || "Erreur lors du téléversement du logo.");
      }
    });
  };

  const handleDeleteLogo = () => {
    startTransition(async () => {
      const res = await deleteLogoAction();
      if (res.success) {
        setSettings((prev) => ({ ...prev, logoUrl: null }));
        setLogoPreview(null);
        setLogoFile(null);
        showFeedback("success", "Logo supprimé. Les documents utiliseront l'en-tête standard.");
      } else {
        showFeedback("error", res.error || "Erreur lors de la suppression du logo.");
      }
    });
  };

  // ─── 3. ACTIONS DE SAUVEGARDE ──────────────────────────────────────────────
  const refreshBackups = async () => {
    const res = await listBackupsAction();
    if (res.success) {
      setBackups(res.backups);
      setLatestVerified(res.latestVerified);
    }
  };

  const handleCreateBackup = () => {
    startTransition(async () => {
      showFeedback("info", "Création et vérification du snapshot SQLite en cours...");
      const res = await createBackupAction();
      if (res.success && res.backup) {
        await refreshBackups();
        showFeedback(
          "success",
          `Sauvegarde créée et vérifiée avec succès (${res.backup.filename} - ${res.backup.formattedSize}).`
        );
      } else {
        showFeedback("error", res.error || "Échec de création de la sauvegarde.");
      }
    });
  };

  const handleVerifyBackup = (filename: string) => {
    startTransition(async () => {
      const res = await verifyBackupAction(filename);
      if (res.success) {
        await refreshBackups();
        if (res.verified) {
          showFeedback("success", `Vérification réussie pour "${filename}" : ${res.message}`);
        } else {
          showFeedback("error", `Échec du contrôle pour "${filename}" : ${res.message}`);
        }
      } else {
        showFeedback("error", res.error || "Erreur lors du contrôle de la sauvegarde.");
      }
    });
  };

  const handleDeleteBackup = () => {
    if (!deleteModalBackup) return;
    startTransition(async () => {
      const res = await deleteBackupAction(deleteModalBackup.filename);
      if (res.success) {
        await refreshBackups();
        showFeedback("success", `Sauvegarde "${deleteModalBackup.filename}" supprimée avec succès.`);
        setDeleteModalBackup(null);
      } else {
        showFeedback("error", res.error || "Échec de la suppression.");
      }
    });
  };

  const handleRestoreBackup = () => {
    if (!restoreModalBackup) return;
    if (restoreConfirmText.trim() !== restoreModalBackup.filename) {
      showFeedback("error", "Le nom de confirmation saisi ne correspond pas exactement.");
      return;
    }

    startTransition(async () => {
      showFeedback(
        "info",
        "Restauration en cours : création de la sauvegarde de sécurité préalable, remplacement et reconnexion..."
      );
      const res = await restoreBackupAction(restoreModalBackup.filename, restoreConfirmText.trim());
      if (res.success) {
        await refreshBackups();
        setRestoreModalBackup(null);
        setRestoreConfirmText("");
        showFeedback(
          "success",
          res.message || "Base de données restaurée avec succès et client reconnecté."
        );
      } else {
        showFeedback("error", res.error || "Erreur lors de la restauration.");
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Store className="h-6 w-6 text-amber-600" />
            Paramètres, Sauvegarde & Sécurité
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Identité commerciale du magasin, coordonnées pour documents imprimables, sauvegardes SQLite transactionnelles et intégrité.
          </p>
        </div>

        {/* Quick status pill */}
        <div className="flex items-center gap-3">
          <div className="bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-800 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Base active : SQLite (LibSQL pure-JS)
          </div>
          {latestVerified && (
            <div className="bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Dernière sauvegarde vérifiée
            </div>
          )}
        </div>
      </div>

      {/* Alert / Feedback message */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-900"
              : feedback.type === "error"
              ? "bg-rose-50 border-rose-200 text-rose-900"
              : "bg-blue-50 border-blue-200 text-blue-900"
          }`}
        >
          {feedback.type === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />}
          {feedback.type === "error" && <AlertTriangle className="h-5 w-5 text-rose-600 shrink-0 mt-0.5" />}
          {feedback.type === "info" && <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />}
          <div className="text-sm font-medium leading-relaxed">{feedback.message}</div>
        </div>
      )}

      {/* Tabs navigation */}
      <div className="flex border-b border-slate-200 space-x-1 overflow-x-auto bg-slate-50/70 p-1 rounded-xl">
        <button
          onClick={() => setActiveTab("identity")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activeTab === "identity"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          }`}
        >
          <Store className="h-4 w-4 text-amber-600" />
          Identité & Magasin
        </button>
        <button
          onClick={() => setActiveTab("backup")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activeTab === "backup"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          }`}
        >
          <Database className="h-4 w-4 text-emerald-600" />
          Sauvegardes & Restauration
          <span className="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full font-mono">
            {backups.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("scheduler")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activeTab === "scheduler"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          }`}
        >
          <CalendarClock className="h-4 w-4 text-blue-600" />
          Automatisation & Planificateur
        </button>
        <button
          onClick={() => setActiveTab("system")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all cursor-pointer ${
            activeTab === "system"
              ? "bg-white text-slate-900 shadow-xs border border-slate-200"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60"
          }`}
        >
          <Server className="h-4 w-4 text-purple-600" />
          Système & Sécurité
        </button>
      </div>

      {/* ─── TAB 1: IDENTITÉ & MAGASIN ────────────────────────────────────────── */}
      {activeTab === "identity" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Settings form */}
          <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Coordonnées du Magasin</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Ces informations apparaîtront automatiquement sur toutes vos factures, devis, bons de commande et reçus imprimables.
              </p>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nom commercial du magasin *
                  </label>
                  <input
                    type="text"
                    required
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="Ex: Shop ERP Mobilier"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Activité & Spécialité
                  </label>
                  <input
                    type="text"
                    value={activity}
                    onChange={(e) => setActivity(e.target.value)}
                    placeholder="Ex: Ameublement, Salons & Décoration"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Forme Juridique (Facultatif)
                  </label>
                  <input
                    type="text"
                    value={legalForm}
                    onChange={(e) => setLegalForm(e.target.value)}
                    placeholder="Ex: SARL, EURL, ETS, SPA..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    N° d&apos;Identification Statistique (NIS - Facultatif)
                  </label>
                  <input
                    type="text"
                    value={nis}
                    onChange={(e) => setNis(e.target.value)}
                    placeholder="Ex: 000116000000000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Adresse complète du magasin
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Ex: Zone Commerciale & Exposition — Alger, Algérie"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Numéro(s) de Téléphone
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ex: +213 (0) 550 12 34 56"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email de contact
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Ex: contact@magasin.dz"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    NIF / N° Registre de Commerce (RC)
                  </label>
                  <input
                    type="text"
                    value={nifRc}
                    onChange={(e) => setNifRc(e.target.value)}
                    placeholder="Ex: 002416000000000"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dépôt / Entrepôt principal par défaut
                  </label>
                  <select
                    value={defaultLocationId}
                    onChange={(e) =>
                      setDefaultLocationId(e.target.value === "" ? "" : Number(e.target.value))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                  >
                    <option value="">Sélectionner un dépôt par défaut...</option>
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Pied de page des documents imprimables (Conditions de garantie, mentions légales)
                </label>
                <textarea
                  rows={3}
                  value={documentFooter}
                  onChange={(e) => setDocumentFooter(e.target.value)}
                  placeholder="Ex: Les marchandises vendues bénéficient d'une garantie de 12 mois..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Devise active
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      disabled
                      value="Dinar Algérien (DA)"
                      className="w-full px-3 py-2 text-sm bg-slate-100 border border-slate-200 rounded-lg text-slate-600 cursor-not-allowed font-medium"
                    />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Règle métier ERP : la devise par défaut du magasin est fixée en Dinar Algérien (DA / DZD).
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Rétention des sauvegardes (Nb. max conservé)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={365}
                    value={backupRetentionCount}
                    onChange={(e) => setBackupRetentionCount(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    La dernière sauvegarde valide n&apos;est jamais supprimée.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-medium px-5 py-2.5 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <Check className="h-4 w-4" />
                  {isPending ? "Enregistrement..." : "Enregistrer les modifications"}
                </button>
              </div>
            </form>
          </div>

          {/* Logo management */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Logo du Magasin</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Affiché sur les factures de vente, bons de commande, bons de réception et fiches de caisse.
              </p>
            </div>

            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              {logoPreview ? (
                <div className="relative group flex flex-col items-center">
                  <img
                    src={logoPreview}
                    alt="Logo magasin"
                    className="max-h-32 max-w-full object-contain rounded-lg p-2 bg-white border border-slate-200 shadow-xs"
                  />
                  <p className="text-xs text-slate-500 mt-2 font-medium">Aperçu du logo actuel</p>
                  <button
                    onClick={handleDeleteLogo}
                    disabled={isPending}
                    className="mt-3 flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer le logo
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <div className="w-16 h-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                    <Store className="h-8 w-8" />
                  </div>
                  <p className="text-xs font-medium text-slate-700">Aucun logo configuré</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    L&apos;application affiche le nom textuel par défaut.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-700">
                Télécharger un nouveau logo
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                onChange={handleLogoFileChange}
                className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200 cursor-pointer"
              />
              <p className="text-[11px] text-slate-400">
                Formats acceptés : PNG, JPG, WebP, SVG. Taille maximale autorisée : 2 Mo.
              </p>

              {logoFile && (
                <button
                  onClick={handleUploadLogo}
                  disabled={isPending}
                  className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold py-2.5 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  <Upload className="h-4 w-4" />
                  {isPending ? "Téléversement..." : "Appliquer ce logo"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 2: SAUVEGARDES & RESTAURATION ─────────────────────────────────── */}
      {activeTab === "backup" && (
        <div className="space-y-6">
          {/* Action Banner */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-6 rounded-xl shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Database className="h-5 w-5 text-emerald-400" />
                Sauvegarde SQLite Transactionnelle & Cohérente
              </h2>
              <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
                Les sauvegardes sont générées via l&apos;instruction SQLite <code>VACUUM INTO</code>. Cette méthode garantit une copie intègre sans bloquer les ventes en cours, et valide l&apos;intégrité physique de la base par <code>PRAGMA integrity_check</code>.
              </p>
            </div>

            <button
              onClick={handleCreateBackup}
              disabled={isPending}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-3 rounded-xl shadow-md transition-all cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <DownloadCloud className="h-5 w-5" />
              {isPending ? "Création en cours..." : "Créer une sauvegarde maintenant"}
            </button>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase">Taille Base Active</span>
              <p className="text-xl font-bold text-slate-900 mt-1 font-mono">
                {systemInfo.formattedDatabaseSize}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">prisma/shop.db</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase">Total Sauvegardes</span>
              <p className="text-xl font-bold text-slate-900 mt-1 font-mono">{backups.length}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Dossier prisma/backups</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-emerald-700 uppercase">Sauvegardes Intègres</span>
              <p className="text-xl font-bold text-emerald-700 mt-1 font-mono">
                {backups.filter((b) => b.isVerified).length}
              </p>
              <p className="text-[11px] text-emerald-600 mt-0.5">Contrôle PRAGMA conforme</p>
            </div>
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-semibold text-slate-500 uppercase">Dernière Sauvegarde</span>
              <p className="text-sm font-bold text-slate-900 mt-1 font-mono truncate" title={latestVerified}>
                {latestVerified || "Aucune"}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">Vérifiée et prête à l&apos;emploi</p>
            </div>
          </div>

          {/* Table of Backups */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">Archives des Sauvegardes Disponibles</h3>
                <p className="text-xs text-slate-500">
                  Conservez vos sauvegardes et vérifiez leur état avant toute restauration.
                </p>
              </div>
              <button
                onClick={refreshBackups}
                disabled={isPending}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                Actualiser
              </button>
            </div>

            {backups.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Database className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-medium text-slate-600">Aucune sauvegarde trouvée</p>
                <p className="text-xs text-slate-400 mt-1">
                  Cliquez sur &quot;Créer une sauvegarde maintenant&quot; pour générer un premier snapshot.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4">Fichier de Sauvegarde</th>
                      <th className="py-3 px-4">Date de Création</th>
                      <th className="py-3 px-4">Taille</th>
                      <th className="py-3 px-4">Statut d&apos;Intégrité</th>
                      <th className="py-3 px-4 text-right">Actions de Sécurité</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {backups.map((b) => {
                      const isLatest = b.filename === latestVerified;
                      return (
                        <tr
                          key={b.filename}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isLatest ? "bg-emerald-50/30" : ""
                          }`}
                        >
                          <td className="py-3.5 px-4 font-mono font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <HardDrive className="h-4 w-4 text-slate-400 shrink-0" />
                              <span>{b.filename}</span>
                              {isLatest && (
                                <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-sans font-bold">
                                  Dernière vérifiée
                                </span>
                              )}
                              {b.isPreRestore && (
                                <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-sans font-bold">
                                  Sécurité pré-restauration
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            {new Date(b.createdAt).toLocaleString("fr-DZ", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-700">{b.formattedSize}</td>
                          <td className="py-3.5 px-4">
                            {b.isVerified ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="h-3 w-3" />
                                Intègre & Vérifiée
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200"
                                title={b.verificationMessage}
                              >
                                <AlertTriangle className="h-3 w-3" />
                                Invalide / Erreur
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleVerifyBackup(b.filename)}
                                disabled={isPending}
                                title="Tester l'intégrité SQLite"
                                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              >
                                <FileCheck className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setRestoreModalBackup(b);
                                  setRestoreConfirmText("");
                                }}
                                disabled={isPending || !b.isVerified}
                                title={
                                  b.isVerified
                                    ? "Restaurer cette base de données"
                                    : "Restauration désactivée car la sauvegarde n'est pas intègre"
                                }
                                className="px-2.5 py-1 text-xs font-semibold text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Restaurer
                              </button>
                              <button
                                onClick={() => setDeleteModalBackup(b)}
                                disabled={isPending}
                                title="Supprimer définitivement"
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── TAB 3: AUTOMATISATION & PLANIFICATEUR ────────────────────────────── */}
      {activeTab === "scheduler" && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-blue-600" />
              Sauvegardes Automatiques &amp; Planificateur Windows
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Configuration pour automatiser la sauvegarde sans dépendre d&apos;un navigateur ouvert.
            </p>
          </div>

          {/* Standalone script explanation */}
          <div className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2">
            <h3 className="text-sm font-bold text-blue-900 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-700" />
              Script de Sauvegarde Autonome Inclus
            </h3>
            <p className="text-xs text-blue-800 leading-relaxed">
              Un script Node.js autonome dédié est intégré dans le projet :{" "}
              <code className="bg-blue-100 px-1.5 py-0.5 rounded text-blue-900 font-mono">
                scripts/backup.mjs
              </code>
              . Il effectue le checkpoint WAL, exécute <code>VACUUM INTO</code>, teste l&apos;intégrité SQLite, et applique la politique de rétention sans nécessiter de serveur Next.js en cours d&apos;exécution.
            </p>
            <div className="pt-2">
              <span className="text-xs font-semibold text-blue-900">Commande manuelle console :</span>
              <pre className="mt-1 bg-slate-900 text-slate-100 p-2.5 rounded-lg text-xs font-mono select-all">
                npm run db:backup
              </pre>
            </div>
          </div>

          {/* Windows Task Scheduler Guide */}
          <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/50">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              Guide d&apos;installation dans le Planificateur de tâches Windows
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pour assurer une sauvegarde automatique quotidienne à la fermeture de votre magasin (ex: 20h00) :
            </p>
            <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 leading-relaxed font-medium">
              <li>
                Ouvrez le menu Démarrer de Windows, tapez <code className="font-mono bg-white px-1 border rounded">Planificateur de tâches</code> et appuyez sur Entrée.
              </li>
              <li>
                Dans le volet d&apos;actions à droite, cliquez sur <strong className="text-slate-900">Créer une tâche de base...</strong>.
              </li>
              <li>
                Nommez la tâche : <code className="font-mono bg-white px-1 border rounded">ShopERP-Sauvegarde-Quotidienne</code>.
              </li>
              <li>
                Déclencheur : sélectionnez <strong className="text-slate-900">Tous les jours</strong> à <strong className="text-slate-900">20:00</strong>.
              </li>
              <li>
                Action : sélectionnez <strong className="text-slate-900">Démarrer un programme</strong>.
              </li>
              <li>
                Programme/script : tapez <code className="font-mono bg-white px-1 border rounded">node</code>
              </li>
              <li>
                Ajouter des arguments : tapez <code className="font-mono bg-white px-1 border rounded">scripts/backup.mjs</code>
              </li>
              <li>
                Démarrer dans : indiquez le dossier du projet : <code className="font-mono bg-white px-1 border rounded">C:\Users\Moncef\Desktop\shop-erp</code>
              </li>
              <li>
                Cliquez sur <strong className="text-slate-900">Terminer</strong>. La sauvegarde s&apos;exécutera automatiquement chaque jour même si le navigateur est fermé.
              </li>
            </ol>
          </div>

          {/* Warning on disk failure */}
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-900">
              <p className="font-bold">Avertissement important de protection des données :</p>
              <p className="leading-relaxed">
                Les sauvegardes sont créées dans le dossier local <code>prisma/backups</code>. En cas de panne physique ou de défaillance matérielle du disque dur de votre ordinateur, la base active ET les sauvegardes locales seraient perdues.
              </p>
              <p className="font-semibold text-amber-950">
                Recommandation pratique : Copiez régulièrement le dossier <code>prisma/backups</code> sur une clé USB ou un disque dur externe branché à la fin de chaque semaine.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAB 4: SYSTÈME & SÉCURITÉ ────────────────────────────────────────── */}
      {activeTab === "system" && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-purple-600" />
              Diagnostics Système &amp; Sécurité des Données
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Spécifications techniques de stockage, intégrité et politiques de protection.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Moteur de Base de Données</span>
              <p className="text-sm font-semibold text-slate-900">
                SQLite 3 (Pilote @libsql/client pure-JS)
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                N&apos;exige aucun compilateur C++ natif sous Windows. Exécution purement asynchrone et compatible Prisma 7.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Mode de Concurrence</span>
              <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <Check className="h-4 w-4" /> WAL (Write-Ahead Logging) activé
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Permet des lectures concurrentes rapides pendant que les écritures de caisse et de vente sont en cours.
              </p>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Protection Anti-Traversal</span>
              <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> Chemins strictement isolés
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Toutes les opérations de fichiers utilisent <code>path.basename</code> et interdisent formellement les sorties de répertoires (<code>..</code>).
              </p>
            </div>

            <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50 space-y-2">
              <span className="text-xs font-bold text-slate-500 uppercase">Protection du Dernier Bon État</span>
              <p className="text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" /> Règle de non-suppression
              </p>
              <p className="text-xs text-slate-500 leading-relaxed">
                Le système interdit la suppression automatique ou manuelle de la seule sauvegarde valide restante.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE CONFIRMATION DE RESTAURATION (CRITIQUE) ──────────────────── */}
      {restoreModalBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-5">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-full bg-rose-50 border border-rose-200">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Confirmer la Restauration</h3>
                <p className="text-xs text-slate-500">Action critique de remplacement des données</p>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-2 leading-relaxed">
              <p className="font-bold">
                Attention : Cette action va remplacer l&apos;intégralité de la base de données active par le contenu de cette sauvegarde.
              </p>
              <div className="space-y-1 font-mono text-[11px] bg-white/70 p-2.5 rounded border border-rose-200 text-slate-800">
                <div>Fichier : {restoreModalBackup.filename}</div>
                <div>Taille : {restoreModalBackup.formattedSize}</div>
                <div>
                  Date :{" "}
                  {new Date(restoreModalBackup.createdAt).toLocaleString("fr-DZ")}
                </div>
              </div>
              <p className="text-emerald-800 font-semibold flex items-center gap-1">
                <Check className="h-3.5 w-3.5" />
                Une sauvegarde de sécurité de l&apos;état actuel sera automatiquement créée avant le remplacement.
              </p>
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-slate-700">
                Pour confirmer, veuillez saisir exactement le nom du fichier ci-dessous :
              </label>
              <p className="font-mono text-xs bg-slate-100 p-2 rounded text-slate-800 font-bold select-all">
                {restoreModalBackup.filename}
              </p>
              <input
                type="text"
                value={restoreConfirmText}
                onChange={(e) => setRestoreConfirmText(e.target.value)}
                placeholder="Tapez le nom exact ici..."
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-mono"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRestoreModalBackup(null)}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleRestoreBackup}
                disabled={
                  isPending || restoreConfirmText.trim() !== restoreModalBackup.filename
                }
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? "Restauration en cours..." : "Remplacer et Restaurer la base"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE CONFIRMATION DE SUPPRESSION ─────────────────────────────── */}
      {deleteModalBackup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-slate-800">
              <div className="p-2.5 rounded-full bg-slate-100">
                <Trash2 className="h-5 w-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold">Supprimer la sauvegarde ?</h3>
                <p className="text-xs text-slate-500">Cette action est irréversible.</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Êtes-vous certain de vouloir supprimer le fichier de sauvegarde suivant :
            </p>
            <p className="font-mono text-xs bg-slate-100 p-2.5 rounded text-slate-800 font-bold break-all">
              {deleteModalBackup.filename}
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setDeleteModalBackup(null)}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleDeleteBackup}
                disabled={isPending}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors cursor-pointer"
              >
                {isPending ? "Suppression..." : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
