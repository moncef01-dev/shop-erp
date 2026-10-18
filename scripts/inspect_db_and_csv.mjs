import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

async function main() {
  const rootDir = process.cwd();
  const dbPath = path.join(rootDir, "prisma", "shop.db");
  const backupPath = path.join(rootDir, "prisma", "backups", "shop_backup_20261017_235243.db");

  console.log("=== 1. VERIFICATION BACKUP ===");
  if (!fs.existsSync(backupPath)) {
    console.error("Backup non trouvé:", backupPath);
    process.exit(1);
  }
  const backupStat = fs.statSync(backupPath);
  console.log(`Chemin backup: ${backupPath}`);
  console.log(`Taille backup: ${backupStat.size} octets`);

  const backupClient = createClient({ url: `file:${backupPath}` });
  const backupCheck = await backupClient.execute("PRAGMA integrity_check");
  console.log("Backup PRAGMA integrity_check:", backupCheck.rows[0]);
  await backupClient.close();

  console.log("\n=== 2. TABLE COUNTS ACTIVE DB (prisma/shop.db) ===");
  const activeClient = createClient({ url: `file:${dbPath}` });
  const activeCheck = await activeClient.execute("PRAGMA integrity_check");
  console.log("Active DB PRAGMA integrity_check:", activeCheck.rows[0]);

  const existingProducts = await activeClient.execute("SELECT id, sku, name, stock, sellingPrice, costPrice FROM products");
  console.log("Existing Products:", existingProducts.rows);
  const existingCustomers = await activeClient.execute("SELECT id, code, name, phone FROM customers");
  console.log("Existing Customers:", existingCustomers.rows);
  const existingSuppliers = await activeClient.execute("SELECT id, code, name, phone FROM suppliers");
  console.log("Existing Suppliers:", existingSuppliers.rows);
  const existingSales = await activeClient.execute("SELECT id, reference, totalAmount, paidAmount FROM sales");
  console.log("Existing Sales:", existingSales.rows);
  const existingPurchases = await activeClient.execute("SELECT id, reference, totalAmount, paidAmount FROM purchases");
  console.log("Existing Purchases:", existingPurchases.rows);
  const existingSettings = await activeClient.execute("SELECT id, shopName, address, phone, nifRc, nis, legalForm FROM shop_settings");
  console.log("Existing Settings:", existingSettings.rows);

  const tablesRes = await activeClient.execute(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%' ORDER BY name"
  );
  const tables = tablesRes.rows.map((r) => r.name);
  const counts = {};
  for (const t of tables) {
    const res = await activeClient.execute(`SELECT count(*) as cnt FROM "${t}"`);
    counts[t] = Number(res.rows[0].cnt);
    console.log(`Table ${t}: ${counts[t]} enregistrements`);
  }

  console.log("\n=== 3. CATEGORIES & LOCATIONS EXISTANTES DANS LA DB ===");
  const categoriesRes = await activeClient.execute("SELECT id, name FROM categories");
  console.log("Catégories existantes:", categoriesRes.rows);

  const locationsRes = await activeClient.execute("SELECT id, code, name, isActive, isDefault FROM locations");
  console.log("Emplacements existants:", locationsRes.rows);

  console.log("\n=== 4. ANALYSE ET VALIDATION ARTICLES.CSV ===");
  const articlesCsvPath = path.join(rootDir, "Articles.csv");
  const articlesRaw = fs.readFileSync(articlesCsvPath, "utf-8");
  const articlesLines = articlesRaw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const articlesHeader = articlesLines[0].replace(/^\uFEFF/, "");
  console.log("Articles.csv Header:", articlesHeader);
  const articlesDataRows = articlesLines.slice(1);
  console.log(`Articles.csv Nombre de lignes de données: ${articlesDataRows.length}`);

  const articleRefs = new Set();
  const duplicateArticleRefs = [];
  const unknownCategories = new Set();
  const existingCatNames = new Set(categoriesRes.rows.map((c) => String(c.name).toLowerCase().trim()));

  for (let i = 0; i < articlesDataRows.length; i++) {
    const line = articlesDataRows[i];
    const parts = line.split(";");
    const ref = parts[0]?.trim();
    const cat = parts[1]?.trim();
    const name = parts[2]?.trim();
    const buyPrice = parts[6]?.trim();
    const sellPrice = parts[7]?.trim();

    if (!ref) {
      console.error(`Ligne ${i + 2}: Référence manquante !`);
      continue;
    }
    const refUpper = ref.toUpperCase();
    if (articleRefs.has(refUpper)) {
      duplicateArticleRefs.push({ row: i + 2, ref });
    }
    articleRefs.add(refUpper);

    if (cat && !existingCatNames.has(cat.toLowerCase())) {
      unknownCategories.add(cat);
    }
  }

  console.log(`Articles uniques dans Articles.csv: ${articleRefs.size}`);
  console.log(`Doublons de référence dans Articles.csv:`, duplicateArticleRefs);
  console.log(`Catégories dans Articles.csv non encore dans DB:`, Array.from(unknownCategories));

  console.log("\n=== 5. ANALYSE ET VALIDATION STOCK_INITIAL.CSV ===");
  const stockCsvPath = path.join(rootDir, "Stock_Initial.csv");
  const stockRaw = fs.readFileSync(stockCsvPath, "utf-8");
  const stockLines = stockRaw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const stockHeader = stockLines[0].replace(/^\uFEFF/, "");
  console.log("Stock_Initial.csv Header:", stockHeader);
  const stockDataRows = stockLines.slice(1);
  console.log(`Stock_Initial.csv Nombre de lignes de données: ${stockDataRows.length}`);

  const stockByLocation = {
    Showroom: 0,
    "Garage Chaaban": 0,
    "Garage Cheikh": 0,
    "3ème Garage / Dépôt": 0,
  };
  const otherLocations = new Set();
  const stockComboCheck = new Set();
  const duplicateCombos = [];
  let totalStockUnits = 0;
  const stockArticles = new Set();

  for (let i = 0; i < stockDataRows.length; i++) {
    const line = stockDataRows[i];
    const parts = line.split(";");
    const ref = parts[0]?.trim();
    const loc = parts[1]?.trim();
    const qtyStr = parts[2]?.trim();
    const qty = parseInt(qtyStr, 10);

    const refUpper = ref.toUpperCase();
    stockArticles.add(refUpper);

    const combo = `${refUpper}__${loc}`;
    if (stockComboCheck.has(combo)) {
      duplicateCombos.push({ row: i + 2, ref, loc });
    }
    stockComboCheck.add(combo);

    if (isNaN(qty) || qty < 0) {
      console.error(`Ligne ${i + 2}: Quantité invalide (${qtyStr}) pour ${ref} à ${loc}`);
    }

    if (stockByLocation[loc] !== undefined) {
      stockByLocation[loc] += qty;
    } else {
      otherLocations.add(loc);
    }
    totalStockUnits += qty;
  }

  console.log("Totaux Stock_Initial par emplacement:", stockByLocation);
  console.log(`Total général des unités: ${totalStockUnits}`);
  console.log(`Emplacements inconnus dans Stock_Initial.csv:`, Array.from(otherLocations));
  console.log(`Doublons Référence/Emplacement:`, duplicateCombos);
  console.log(`Nombre d'articles dans Stock_Initial.csv: ${stockArticles.size}`);

  // Concordance Articles vs Stock_Initial
  const inArticlesNotStock = Array.from(articleRefs).filter((r) => !stockArticles.has(r));
  const inStockNotArticles = Array.from(stockArticles).filter((r) => !articleRefs.has(r));
  console.log("Articles dans Articles.csv mais PAS dans Stock_Initial.csv:", inArticlesNotStock);
  console.log("Articles dans Stock_Initial.csv mais PAS dans Articles.csv:", inStockNotArticles);

  // Vérifier concordance exacte des quantités par produit entre les deux fichiers
  const stockByArticleLoc = {};
  for (const line of stockDataRows) {
    const parts = line.split(";");
    const ref = parts[0]?.trim().toUpperCase();
    const loc = parts[1]?.trim();
    const qty = parseInt(parts[2]?.trim(), 10) || 0;
    if (!stockByArticleLoc[ref]) stockByArticleLoc[ref] = {};
    stockByArticleLoc[ref][loc] = qty;
  }

  let qtyMismatches = 0;
  for (const line of articlesDataRows) {
    const parts = line.split(";");
    const ref = parts[0]?.trim().toUpperCase();
    const ch = parseInt(parts[3]?.trim(), 10) || 0;
    const ck = parseInt(parts[4]?.trim(), 10) || 0;
    const sh = parseInt(parts[5]?.trim(), 10) || 0;

    const sCh = stockByArticleLoc[ref]?.["Garage Chaaban"] ?? 0;
    const sCk = stockByArticleLoc[ref]?.["Garage Cheikh"] ?? 0;
    const sSh = stockByArticleLoc[ref]?.["Showroom"] ?? 0;

    if (ch !== sCh || ck !== sCk || sh !== sSh) {
      console.log(`Divergence de stock pour ${ref}: Articles.csv=[${ch}, ${ck}, ${sh}] vs Stock_Initial.csv=[${sCh}, ${sCk}, ${sSh}]`);
      qtyMismatches++;
    }
  }
  console.log(`Nombre de divergences de quantités entre Articles.csv et Stock_Initial.csv: ${qtyMismatches}`);

  await activeClient.close();
}

main().catch(console.error);
