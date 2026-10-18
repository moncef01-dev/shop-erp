/**
 * Standalone automated backup script for Shop ERP
 * Can be executed manually via: npm run db:backup
 * Or scheduled via Windows Task Scheduler.
 */

import path from "path";
import fs from "fs";
import { createClient } from "@libsql/client";

async function performBackup() {
  const rootDir = process.cwd();
  const dbPath = path.resolve(rootDir, "prisma", "shop.db");
  const backupDir = path.resolve(rootDir, "prisma", "backups");

  if (!fs.existsSync(dbPath)) {
    console.error("Erreur fatale: La base de données active n'existe pas à l'emplacement:", dbPath);
    process.exit(1);
  }

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const now = new Date();
  const timestamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace("T", "_")
    .slice(0, 15);
  const backupFilename = `shop_backup_${timestamp}.db`;
  const backupPath = path.resolve(backupDir, backupFilename);
  const targetSql = backupPath.replace(/\\/g, "/");

  console.log(`[${now.toISOString()}] Démarrage de la sauvegarde automatique Shop ERP...`);

  const activeClient = createClient({ url: `file:${dbPath}` });

  try {
    // 1. Pointage du journal WAL
    try {
      await activeClient.execute("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // Ignore si non WAL
    }

    // 2. Snapshot transaction-consistent via VACUUM INTO
    await activeClient.execute(`VACUUM INTO '${targetSql}'`);
    console.log(`✓ Fichier de sauvegarde créé avec succès : ${backupFilename}`);
  } catch (err) {
    console.error("Erreur lors de l'exécution de VACUUM INTO:", err);
    process.exit(1);
  } finally {
    await activeClient.close();
  }

  // 3. Vérification d'intégrité et de schéma de la sauvegarde
  const backupClient = createClient({ url: `file:${backupPath}` });
  try {
    const res = await backupClient.execute("PRAGMA integrity_check");
    const ok = res.rows.length > 0 && res.rows[0].integrity_check === "ok";
    if (!ok) {
      console.error("ÉCHEC: La sauvegarde créée n'a pas passé le test d'intégrité SQLite !");
      try { fs.unlinkSync(backupPath); } catch {}
      process.exit(1);
    }

    // Vérification de la présence des tables fondamentales
    const tablesRes = await backupClient.execute(
      "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name IN ('products', 'sales', 'customers', 'shop_settings', 'cash_sessions')"
    );
    const tableCount = Number(tablesRes.rows[0]?.cnt ?? 0);
    if (tableCount < 2) {
      console.error("ÉCHEC: La structure de la sauvegarde est incomplète (tables clés absentes) !");
      try { fs.unlinkSync(backupPath); } catch {}
      process.exit(1);
    }

    console.log(`✓ Intégrité SQLite vérifiée (PRAGMA integrity_check: ok, ${tableCount} tables clés validées).`);
  } catch (err) {
    console.error("Erreur lors du test d'intégrité de la sauvegarde:", err);
    try { fs.unlinkSync(backupPath); } catch {}
    process.exit(1);
  } finally {
    await backupClient.close();
  }

  // 4. Politique de rétention (garder les 30 plus récents, sans jamais supprimer la dernière ni le fichier courant)
  try {
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith("shop_backup_") || f.startsWith("shop.db.bak_"))
      .map((f) => {
        const full = path.join(backupDir, f);
        return { name: f, time: fs.statSync(full).mtime.getTime(), full };
      })
      .sort((a, b) => b.time - a.time);

    const maxKeep = 30;
    if (files.length > maxKeep) {
      const toDelete = files.slice(maxKeep);
      for (const item of toDelete) {
        if (item.name !== backupFilename) {
          try {
            fs.unlinkSync(item.full);
            console.log(`  (Rétention) Sauvegarde obsolète supprimée : ${item.name}`);
          } catch (delErr) {
            console.warn(`  Impossible de supprimer ${item.name}:`, delErr);
          }
        }
      }
    }
  } catch (err) {
    console.warn("Avertissement lors de l'application de la rétention:", err);
  }

  console.log(`[${new Date().toISOString()}] Sauvegarde automatique terminée avec succès.\n`);
}

performBackup().catch((err) => {
  console.error("Erreur fatale du script de sauvegarde:", err);
  process.exit(1);
});
