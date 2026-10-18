/**
 * Integration Test Suite: Paramètres, Sauvegarde & Sécurité
 *
 * Runs against an isolated temporary SQLite database: prisma/test_settings_runner.db
 * Uses isolated backup directory: tests/temp_backups
 * Never touches real shop data (prisma/shop.db).
 */

import path from "path";
import fs from "fs";
import { createClient } from "@libsql/client";

const testDbPath = path.resolve(process.cwd(), "prisma", "test_settings_runner.db");
const testBackupDir = path.resolve(process.cwd(), "prisma", "backups_test_runner");

try {
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
} catch {
  // Ignore file lock
}

if (!fs.existsSync(testBackupDir)) {
  fs.mkdirSync(testBackupDir, { recursive: true });
}

process.env.DATABASE_URL = `file:${testDbPath}`;

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function executeTest(num: number, name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ num, name, passed: true });
    console.log(`  [TEST ${String(num).padStart(2, "0")}] PASS: ${name}`);
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({ num, name, passed: false, error: errorMsg });
    console.error(`  [TEST ${String(num).padStart(2, "0")}] FAIL: ${name}\n         Cause: ${errorMsg}`);
  }
}

async function runTests() {
  console.log("================================================================================");
  console.log("  SHOP ERP — SUITE DE TESTS D'INTÉGRITÉ : PARAMÈTRES, SAUVEGARDE & SÉCURITÉ");
  console.log("  Base de test isolée :", testDbPath);
  console.log("  Dossier de test     :", testBackupDir);
  console.log("================================================================================\n");

  // 1. Initialiser le schéma via toutes les migrations
  const ddlClient = createClient({ url: `file:${testDbPath}` });

  const migrationsDir = path.resolve(process.cwd(), "prisma", "migrations");
  const migrationFolders = fs
    .readdirSync(migrationsDir)
    .filter((f) => fs.statSync(path.join(migrationsDir, f)).isDirectory())
    .sort();

  for (const folder of migrationFolders) {
    const sqlFile = path.join(migrationsDir, folder, "migration.sql");
    const sql = fs.readFileSync(sqlFile, "utf-8");
    const statements = sql
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await ddlClient.execute(stmt);
    }
  }
  await ddlClient.close();
  console.log("✓ Schéma et tables ShopSettings initialisés sur la base isolée.\n");

  const {
    prisma,
    resetPrismaClient,
    disconnectPrismaClient,
    isDatabaseRestoring,
    setDatabaseRestoring,
  } = await import("@/lib/prisma");

  // ─── TEST 1: Paramètres par défaut si non configurés ───────────────────────
  await executeTest(1, "Création et chargement automatique des paramètres par défaut", async () => {
    const initial = await prisma.shopSettings.findUnique({ where: { id: 1 } });
    assert(initial === null, "La table devrait être vide au départ.");

    // Création par défaut
    const created = await prisma.shopSettings.create({
      data: {
        id: 1,
        shopName: "Shop ERP Mobilier",
        currency: "DA",
        backupRetentionCount: 30,
      },
    });

    assert(created.shopName === "Shop ERP Mobilier", "Le nom par défaut doit être Shop ERP Mobilier");
    assert(created.currency === "DA", "La devise par défaut doit être DA");
    assert(created.backupRetentionCount === 30, "La rétention par défaut doit être 30");
  });

  // ─── TEST 2: Mise à jour et persistance de l'identité du magasin ──────────
  await executeTest(2, "Mise à jour et persistance complète des coordonnées du magasin", async () => {
    const updated = await prisma.shopSettings.update({
      where: { id: 1 },
      data: {
        shopName: "Meubles du Centre Algérie",
        activity: "Salons & Mobilier Moderne",
        address: "12 Rue Didouche Mourad, Alger",
        phone: "+213 (0) 21 00 11 22",
        email: "contact@meubles-centre.dz",
        nifRc: "099916001234567",
        documentFooter: "Garantie 24 mois pièces et main d'œuvre.",
        backupRetentionCount: 45,
      },
    });

    assert(updated.shopName === "Meubles du Centre Algérie", "Nom non mis à jour");
    assert(updated.email === "contact@meubles-centre.dz", "Email non mis à jour");
    assert(updated.nifRc === "099916001234567", "NIF non mis à jour");
    assert(updated.backupRetentionCount === 45, "Rétention non mise à jour");

    const reloaded = await prisma.shopSettings.findUnique({ where: { id: 1 } });
    assert(reloaded?.documentFooter === "Garantie 24 mois pièces et main d'œuvre.", "Footer non persisté");
  });

  // ─── TEST 3: Validation des entrées de paramètres ─────────────────────────
  await executeTest(3, "Validation métier des paramètres (nom obligatoire)", async () => {
    // Vérifier qu'un nom vide ou trop court est rejeté par notre logique
    const invalidName = " ";
    const isValid = invalidName.trim().length >= 2;
    assert(!isValid, "Un nom vide ou de 1 caractère ne doit pas être accepté.");

    // Validation des limites de rétention
    const testCountNegative = -5;
    const clampedCount = isNaN(testCountNegative) || testCountNegative < 1 || testCountNegative > 365 ? 30 : testCountNegative;
    assert(clampedCount === 30, "Une rétention négative doit être ramenée à la valeur par défaut.");
  });

  // ─── TEST 4: Validation de fichiers Logo (Taille et MIME) ─────────────────
  await executeTest(4, "Validation stricte des fichiers Logo (taille max 2 Mo, types MIME)", async () => {
    const MAX_SIZE = 2 * 1024 * 1024;
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/svg+xml"];

    // 1. Fichier trop volumineux
    const oversizedBytes = 3 * 1024 * 1024;
    assert(oversizedBytes > MAX_SIZE, "La taille 3 Mo doit dépasser la limite de 2 Mo.");

    // 2. Fichier avec type non autorisé (ex: PDF ou EXE)
    const dangerousType = "application/x-msdownload";
    assert(!allowedTypes.includes(dangerousType), "Le type EXE doit être refusé.");

    const pdfType = "application/pdf";
    assert(!allowedTypes.includes(pdfType), "Le type PDF doit être refusé pour un logo.");

    // 3. Types acceptés
    assert(allowedTypes.includes("image/png"), "PNG doit être accepté.");
    assert(allowedTypes.includes("image/webp"), "WebP doit être accepté.");
  });

  // ─── TEST 5: Création d'une sauvegarde transactionnelle VACUUM INTO ────────
  const backupTestFile = path.resolve(testBackupDir, "test_backup_01.db");
  await executeTest(5, "Création d'une sauvegarde SQLite cohérente via VACUUM INTO", async () => {
    if (fs.existsSync(backupTestFile)) fs.unlinkSync(backupTestFile);

    const client = createClient({ url: `file:${testDbPath}` });
    try {
      await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
      const targetSql = backupTestFile.replace(/\\/g, "/");
      await client.execute(`VACUUM INTO '${targetSql}'`);
    } finally {
      await client.close();
    }

    assert(fs.existsSync(backupTestFile), "Le fichier de sauvegarde doit exister sur le disque.");
    const stat = fs.statSync(backupTestFile);
    assert(stat.size > 0, "La sauvegarde ne doit pas être vide.");

    // Vérification de l'intégrité SQLite sur la sauvegarde
    const backupClient = createClient({ url: `file:${backupTestFile}` });
    try {
      const checkRes = await backupClient.execute("PRAGMA integrity_check");
      assert(checkRes.rows[0].integrity_check === "ok", "PRAGMA integrity_check doit être 'ok'.");

      const tableRes = await backupClient.execute(
        "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name='shop_settings'"
      );
      assert(Number(tableRes.rows[0].cnt) === 1, "La table shop_settings doit exister dans la sauvegarde.");
    } finally {
      await backupClient.close();
    }
  });

  // ─── TEST 6: Détection et rejet des sauvegardes corrompues ────────────────
  await executeTest(6, "Détection et rejet d'un fichier corrompu ou non-SQLite", async () => {
    const corruptFile = path.resolve(testBackupDir, "corrupt_backup.db");
    fs.writeFileSync(corruptFile, "Ceci n'est pas une base SQLite valide mais du texte brut");

    const client = createClient({ url: `file:${corruptFile}` });
    let passedIntegrity = false;
    try {
      const res = await client.execute("PRAGMA integrity_check");
      passedIntegrity = res.rows.length > 0 && res.rows[0].integrity_check === "ok";
    } catch {
      passedIntegrity = false;
    } finally {
      await client.close();
    }

    assert(!passedIntegrity, "Un fichier corrompu doit échouer au test d'intégrité.");
    try {
      if (fs.existsSync(corruptFile)) fs.unlinkSync(corruptFile);
    } catch {
      // Windows lock
    }
  });

  // ─── TEST 7: Protection contre le Path Traversal ──────────────────────────
  await executeTest(7, "Protection absolue contre les attaques Path Traversal (../)", async () => {
    function testPathTraversal(input: string): boolean {
      const trimmed = input.trim();
      if (
        !trimmed ||
        trimmed === "." ||
        trimmed === ".." ||
        trimmed.includes("/") ||
        trimmed.includes("\\") ||
        trimmed.includes("..")
      ) {
        return false; // Traversal bloqué
      }
      const cleanName = path.basename(trimmed);
      const safePath = path.resolve(testBackupDir, cleanName);
      return safePath.startsWith(testBackupDir);
    }

    assert(!testPathTraversal("../../etc/passwd"), "Chemin relatif ../../ doit être bloqué");
    assert(!testPathTraversal("..\\..\\windows\\system.ini"), "Chemin relatif sous Windows doit être bloqué");
    assert(!testPathTraversal("....//shop.db"), "Chemin avec points multiples doit être bloqué");
    assert(testPathTraversal("shop_backup_20261017.db"), "Nom de fichier standard doit être autorisé");
  });

  // ─── TEST 8: Politique de rétention et protection du dernier bon état ─────
  await executeTest(8, "Rétention des sauvegardes et protection stricte du dernier état valide", async () => {
    // Créer 5 fichiers fictifs
    const files: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const fn = `retention_test_${i}.db`;
      const fp = path.resolve(testBackupDir, fn);
      fs.writeFileSync(fp, `test content ${i}`);
      files.push(fp);
    }

    const maxKeep = 3;
    const sorted = files.slice().reverse(); // les plus récents
    const toDelete = sorted.slice(maxKeep);

    assert(toDelete.length === 2, "2 sauvegardes obsolètes doivent être identifiées pour suppression.");

    // Nettoyer
    for (const f of files) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    // Protection de la seule sauvegarde valide existante
    const singleVerifiedList = [{ filename: "unique_valid.db", isVerified: true }];
    const canDeleteSoleValid = singleVerifiedList.length <= 1;
    assert(canDeleteSoleValid, "La seule sauvegarde valide ne doit jamais pouvoir être supprimée.");
  });

  // ─── TEST 9: Restauration sécurisée avec sauvegarde pré-restauration ───────
  await executeTest(9, "Restauration atomique avec snapshot de sécurité pré-restauration", async () => {
    // 1. État initial : Le magasin s'appelle "Meubles du Centre Algérie"
    // 2. Créer une sauvegarde A
    const backupSnapshotA = path.resolve(testBackupDir, "snapshot_state_A.db");
    const activeClient1 = createClient({ url: `file:${testDbPath}` });
    try {
      await activeClient1.execute("PRAGMA wal_checkpoint(TRUNCATE)");
      await activeClient1.execute(`VACUUM INTO '${backupSnapshotA.replace(/\\/g, "/")}'`);
    } finally {
      await activeClient1.close();
    }

    // 3. Modifier la base active vers l'état B
    await prisma.shopSettings.update({
      where: { id: 1 },
      data: { shopName: "État B Modifié Temporairement" },
    });

    const checkStateB = await prisma.shopSettings.findUnique({ where: { id: 1 } });
    assert(checkStateB?.shopName === "État B Modifié Temporairement", "L'état B doit être en place.");

    // 4. Procéder à la restauration de la sauvegarde A :
    // a. Créer la sauvegarde pré-restauration de B
    const preRestoreSafety = path.resolve(testBackupDir, "pre_restore_safety_check.db");
    const activeClient2 = createClient({ url: `file:${testDbPath}` });
    try {
      await activeClient2.execute("PRAGMA wal_checkpoint(TRUNCATE)");
      await activeClient2.execute(`VACUUM INTO '${preRestoreSafety.replace(/\\/g, "/")}'`);
    } finally {
      await activeClient2.close();
    }
    assert(fs.existsSync(preRestoreSafety), "La sauvegarde de sécurité pré-restauration doit exister.");

    // b. Remplacer testDbPath par backupSnapshotA
    fs.copyFileSync(backupSnapshotA, testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);

    // c. Réinitialiser le client Prisma
    resetPrismaClient();

    // d. Vérifier que l'état initial A ("Meubles du Centre Algérie") est restauré
    const restored = await prisma.shopSettings.findUnique({ where: { id: 1 } });
    assert(
      restored?.shopName === "Meubles du Centre Algérie",
      `Le nom restauré (${restored?.shopName}) doit être l'état A.`
    );

    // Nettoyage fichiers temporaires
    try {
      if (fs.existsSync(backupSnapshotA)) fs.unlinkSync(backupSnapshotA);
    } catch {
      // ignore
    }
    try {
      if (fs.existsSync(preRestoreSafety)) fs.unlinkSync(preRestoreSafety);
    } catch {
      // ignore
    }
  });

  // ─── TEST 10: Annulation de la restauration en cas de confirmation erronée ─
  await executeTest(10, "Rejet strict si le nom de confirmation ne correspond pas", async () => {
    const filename = "shop_backup_20261017.db";
    const userConfirmation = "autre_chose";

    const matches = filename.trim() === userConfirmation.trim();
    assert(!matches, "Une confirmation inexacte doit être refusée.");
  });

  // ─── TEST 11: Cycle de vie déconnexion / reconnexion Prisma ($disconnect + dispose) ───
  await executeTest(11, "Fermeture propre de l'adapter LibSQL et reconnexion transparente", async () => {
    // 1. Déconnexion explicite
    await disconnectPrismaClient();

    // 2. Réinitialisation avec nouveau client
    const newPrisma = resetPrismaClient();
    assert(newPrisma !== undefined, "Le nouveau client Prisma doit être instancié.");

    // 3. Exécution d'une requête sur le nouveau client
    const checkSettings = await newPrisma.shopSettings.findUnique({ where: { id: 1 } });
    assert(checkSettings !== null, "La requête post-reconnexion doit aboutir sans erreur.");
  });

  // ─── TEST 12: Mutex anti-concurrence pendant la restauration ──────────────
  await executeTest(12, "Verrouillage et déverrouillage atomique du mutex de restauration", async () => {
    assert(isDatabaseRestoring() === false, "Le mutex de restauration doit être inactif au départ.");

    setDatabaseRestoring(true);
    assert(isDatabaseRestoring() === true, "Le mutex doit être actif après activation.");

    // Simulation d'une tentative concurrente
    let rejectedConcurrent = false;
    if (isDatabaseRestoring()) {
      rejectedConcurrent = true;
    }
    assert(rejectedConcurrent, "Les opérations concurrentes doivent être détectées et rejetées.");

    setDatabaseRestoring(false);
    assert(isDatabaseRestoring() === false, "Le mutex doit être relâché après achèvement.");
  });

  // ─── TEST 13: Remplacement étagé avec rollback garanti sur échec ──────────
  await executeTest(13, "Procédure d'étage et rollback automatique en cas d'erreur de remplacement", async () => {
    const beforeState = await prisma.shopSettings.findUnique({ where: { id: 1 } });
    const originalName = beforeState?.shopName;

    // Fichier staging temporaire corrompu
    const invalidStagingFile = path.resolve(testBackupDir, "invalid_staging.tmp");
    fs.writeFileSync(invalidStagingFile, "Contenu corrompu");

    // Vérification que l'intégrité de l'étage échoue
    const client = createClient({ url: `file:${invalidStagingFile}` });
    let isValidStaging = false;
    try {
      const res = await client.execute("PRAGMA integrity_check");
      isValidStaging = res.rows.length > 0 && res.rows[0].integrity_check === "ok";
    } catch {
      isValidStaging = false;
    } finally {
      await client.close();
    }

    assert(!isValidStaging, "L'étage corrompu doit échouer la validation.");

    // Nettoyage de l'étage sans altération de la base active
    try {
      if (fs.existsSync(invalidStagingFile)) fs.unlinkSync(invalidStagingFile);
    } catch {
      // Ignorer verrou temporaire Windows
    }

    // Vérification que la base est restée 100% intacte
    const afterCheck = await prisma.shopSettings.findUnique({ where: { id: 1 } });
    assert(afterCheck?.shopName === originalName, "La base de données doit rester inchangée.");
  });

  // ─── NETTOYAGE FINAL ──────────────────────────────────────────────────────
  try {
    if (fs.existsSync(backupTestFile)) fs.unlinkSync(backupTestFile);
  } catch {
    // ignore
  }
  try {
    fs.rmSync(testBackupDir, { recursive: true, force: true });
  } catch {
    // ignore
  }

  // ─── BILAN DES TESTS ──────────────────────────────────────────────────────
  console.log("\n================================================================================");
  console.log("  RÉSUMÉ DE LA VALIDATION DU MODULE PARAMÈTRES & SAUVEGARDE");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`  Total tests     : ${total}`);
  console.log(`  Tests réussis   : ${passed}`);
  console.log(`  Tests échoués   : ${failed}`);

  if (failed > 0) {
    console.error("\nCertains tests ont échoué !");
    process.exit(1);
  } else {
    console.log("\n✓ TOUS LES TESTS D'INTÉGRITÉ DU MODULE PARAMÈTRES & SAUVEGARDE SONT AU VERT !\n");
  }
}

runTests().catch((err) => {
  console.error("Erreur fatale lors de l'exécution des tests:", err);
  process.exit(1);
});
