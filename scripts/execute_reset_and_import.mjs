import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

async function main() {
  const rootDir = process.cwd();
  const dbPath = path.join(rootDir, "prisma", "shop.db");
  const articlesCsvPath = path.join(rootDir, "Articles.csv");
  const stockCsvPath = path.join(rootDir, "Stock_Initial.csv");

  console.log("=== EXÉCUTION DU RESET ET DE L'IMPORT DU CATALOGUE RÉEL ===");
  console.log(`Base de données active : ${dbPath}`);

  const client = createClient({ url: `file:${dbPath}` });

  // 1. Lire et vérifier les fichiers CSV
  const articlesRaw = fs.readFileSync(articlesCsvPath, "utf-8");
  const articlesLines = articlesRaw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const articlesRows = articlesLines.slice(1);

  const stockRaw = fs.readFileSync(stockCsvPath, "utf-8");
  const stockLines = stockRaw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const stockRows = stockLines.slice(1);

  console.log(`Articles à importer : ${articlesRows.length}`);
  console.log(`Lignes de stock à traiter : ${stockRows.length}`);

  // Vérification WAL & foreign keys
  await client.execute("PRAGMA foreign_keys = ON");
  const initCheck = await client.execute("PRAGMA integrity_check");
  if (initCheck.rows[0]?.integrity_check !== "ok") {
    throw new Error("L'intégrité initiale de la base n'est pas 'ok'");
  }

  // Exécution transactionnelle
  await client.execute("BEGIN TRANSACTION");

  try {
    console.log("\n--- Étape 1 : Nettoyage des données de test / démo ---");
    // Dépendances descendantes
    await client.execute("DELETE FROM deliveries");
    await client.execute("DELETE FROM sale_items");
    await client.execute("DELETE FROM payments");
    await client.execute("DELETE FROM sales");
    await client.execute("DELETE FROM purchase_receipt_items");
    await client.execute("DELETE FROM purchase_receipts");
    await client.execute("DELETE FROM purchase_items");
    await client.execute("DELETE FROM purchases");
    await client.execute("DELETE FROM expenses");
    await client.execute("DELETE FROM cash_sessions");
    await client.execute("DELETE FROM transactions");
    await client.execute("DELETE FROM stock_movements");
    await client.execute("DELETE FROM product_stocks");
    await client.execute("DELETE FROM products");
    await client.execute("DELETE FROM customers");
    await client.execute("DELETE FROM suppliers");

    console.log("✓ Données de test purgées.");

    // Vérifier les emplacements existants
    const locRes = await client.execute("SELECT id, name, code FROM locations");
    const locationMap = new Map();
    for (const row of locRes.rows) {
      locationMap.set(row.name, row.id);
    }
    console.log("Emplacements disponibles :", Array.from(locationMap.entries()));

    const requiredLocations = ["Showroom", "Garage Chaaban", "Garage Cheikh", "3ème Garage / Dépôt"];
    for (const reqLoc of requiredLocations) {
      if (!locationMap.has(reqLoc)) {
        throw new Error(`Emplacement requis manquant : ${reqLoc}`);
      }
    }

    console.log("\n--- Étape 2 : Création des catégories du catalogue ---");
    const categoryNames = [
      "Armoire",
      "Fauteuil",
      "Table",
      "Porte-chaussures",
      "Chambre",
      "Bahut",
      "Tapis",
      "Lit",
      "Matlas",
      "Bureau",
    ];

    const categoryMap = new Map();
    // Charger les catégories déjà présentes (ex: Salons & Canapés)
    const existingCats = await client.execute("SELECT id, name FROM categories");
    for (const r of existingCats.rows) {
      categoryMap.set(r.name.toLowerCase(), r.id);
    }

    const nowIso = new Date().toISOString();
    for (const catName of categoryNames) {
      const lower = catName.toLowerCase();
      if (!categoryMap.has(lower)) {
        const insertCat = await client.execute({
          sql: "INSERT INTO categories (name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?) RETURNING id",
          args: [catName, `Mobilier de catégorie ${catName}`, nowIso, nowIso],
        });
        const catId = Number(insertCat.rows[0].id);
        categoryMap.set(lower, catId);
      }
    }
    console.log(`✓ Catégories prêtes (${categoryMap.size} au total en base).`);

    console.log("\n--- Étape 3 : Importation des 97 articles ---");
    const productMap = new Map(); // sku -> productId

    for (let i = 0; i < articlesRows.length; i++) {
      const parts = articlesRows[i].split(";");
      const ref = parts[0]?.trim();
      const cat = parts[1]?.trim();
      const name = parts[2]?.trim();

      if (!ref || !name) {
        throw new Error(`Ligne ${i + 2} invalide : ref ou nom manquant.`);
      }

      const cleanSku = ref.toUpperCase();
      const catId = categoryMap.get(cat.toLowerCase()) ?? null;

      const resProd = await client.execute({
        sql: `INSERT INTO products (sku, name, model, color, description, category, categoryId, unitPrice, sellingPrice, costPrice, stock, minStock, unit, isActive, createdAt, updatedAt)
              VALUES (?, ?, NULL, NULL, NULL, ?, ?, NULL, NULL, NULL, 0, 0, 'pièce', 1, ?, ?)
              RETURNING id, sku, name`,
        args: [cleanSku, name, cat, catId, nowIso, nowIso],
      });

      const prodId = Number(resProd.rows[0].id);
      productMap.set(cleanSku, { id: prodId, sku: cleanSku, name });
    }

    console.log(`✓ ${productMap.size} articles insérés avec succès (prix d'achat et de vente laissés NULL).`);

    console.log("\n--- Étape 4 : Importation du stock initial et création des mouvements ---");
    let movementCounter = 1;
    let movementsCreated = 0;
    const stockTotalsByLocation = {
      Showroom: 0,
      "Garage Chaaban": 0,
      "Garage Cheikh": 0,
      "3ème Garage / Dépôt": 0,
    };
    const productStocksSum = new Map(); // prodId -> sum

    for (let i = 0; i < stockRows.length; i++) {
      const parts = stockRows[i].split(";");
      const ref = parts[0]?.trim().toUpperCase();
      const locName = parts[1]?.trim();
      const qty = parseInt(parts[2]?.trim(), 10) || 0;

      const prod = productMap.get(ref);
      if (!prod) {
        throw new Error(`Ligne stock ${i + 2} : Produit non trouvé pour la référence ${ref}`);
      }

      const locId = locationMap.get(locName);
      if (!locId) {
        throw new Error(`Ligne stock ${i + 2} : Emplacement inconnu "${locName}"`);
      }

      // 1. Créer ou mettre à jour la ligne ProductStock
      await client.execute({
        sql: `INSERT INTO product_stocks (productId, locationId, quantity, createdAt, updatedAt)
              VALUES (?, ?, ?, ?, ?)
              ON CONFLICT(productId, locationId) DO UPDATE SET quantity = ?`,
        args: [prod.id, locId, qty, nowIso, nowIso, qty],
      });

      // Suivi de la somme globale par article
      const currentSum = productStocksSum.get(prod.id) ?? 0;
      productStocksSum.set(prod.id, currentSum + qty);

      // Suivi par emplacement
      stockTotalsByLocation[locName] = (stockTotalsByLocation[locName] || 0) + qty;

      // 2. Créer un mouvement de stock uniquement si qty > 0
      if (qty > 0) {
        const refMvt = `INIT-20261018-${String(movementCounter).padStart(4, "0")}`;
        movementCounter++;

        await client.execute({
          sql: `INSERT INTO stock_movements (reference, type, productId, fromLocationId, toLocationId, quantity, unitCost, stockBefore, stockAfter, reason, notes, date, createdAt)
                VALUES (?, 'INITIAL', ?, NULL, ?, ?, NULL, 0, ?, 'Stock initial d''ouverture', ?, ?, ?)`,
          args: [
            refMvt,
            prod.id,
            locId,
            qty,
            qty,
            `Stock initial d'ouverture à ${locName}. Réf : ${refMvt}`,
            nowIso,
            nowIso,
          ],
        });
        movementsCreated++;
      }
    }

    // Mise à jour de la colonne `stock` consolidée sur chaque produit
    for (const [prodId, total] of productStocksSum.entries()) {
      await client.execute({
        sql: "UPDATE products SET stock = ? WHERE id = ?",
        args: [total, prodId],
      });
    }

    console.log(`✓ Mouvements de stock créés : ${movementsCreated}`);
    console.log("✓ Totaux par emplacement :", stockTotalsByLocation);

    // Valider les totaux exacts attendus
    if (stockTotalsByLocation["Showroom"] !== 211) {
      throw new Error(`Échec total Showroom : attendu 211, obtenu ${stockTotalsByLocation["Showroom"]}`);
    }
    if (stockTotalsByLocation["Garage Chaaban"] !== 24) {
      throw new Error(`Échec total Garage Chaaban : attendu 24, obtenu ${stockTotalsByLocation["Garage Chaaban"]}`);
    }
    if (stockTotalsByLocation["Garage Cheikh"] !== 9) {
      throw new Error(`Échec total Garage Cheikh : attendu 9, obtenu ${stockTotalsByLocation["Garage Cheikh"]}`);
    }
    if (stockTotalsByLocation["3ème Garage / Dépôt"] !== 0) {
      throw new Error(`Échec total 3ème Garage / Dépôt : attendu 0, obtenu ${stockTotalsByLocation["3ème Garage / Dépôt"]}`);
    }
    const grandTotal = Object.values(stockTotalsByLocation).reduce((a, b) => a + b, 0);
    if (grandTotal !== 244) {
      throw new Error(`Échec total général : attendu 244, obtenu ${grandTotal}`);
    }

    // Valider les contraintes de clés étrangères
    const fkCheck = await client.execute("PRAGMA foreign_key_check");
    if (fkCheck.rows.length > 0) {
      throw new Error(`Violations de clés étrangères détectées : ${JSON.stringify(fkCheck.rows)}`);
    }

    // Valider l'intégrité SQLite
    const integCheck = await client.execute("PRAGMA integrity_check");
    if (integCheck.rows[0]?.integrity_check !== "ok") {
      throw new Error(`Échec PRAGMA integrity_check : ${JSON.stringify(integCheck.rows)}`);
    }

    await client.execute("COMMIT");
    console.log("\n✓ TRANSACTION VALIDÉE AVEC SUCCÈS (COMMIT).");
  } catch (err) {
    console.error("\n❌ ERREUR LORS DE L'EXÉCUTION DU RESET / IMPORT :", err);
    try {
      await client.execute("ROLLBACK");
      console.log("✓ ROLLBACK exécuté avec succès. Aucune donnée n'a été corrompue.");
    } catch (rbErr) {
      console.error("Erreur lors du rollback :", rbErr);
    }
    process.exit(1);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
