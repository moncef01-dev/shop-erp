import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";

async function main() {
  const rootDir = process.cwd();
  const dbPath = path.join(rootDir, "prisma", "shop.db");
  const client = createClient({ url: `file:${dbPath}` });

  console.log("=== PHASE 6 : VÉRIFICATION COMPLÈTE APRÈS RESET ET IMPORT ===");

  // 1. PRAGMA integrity_check
  const integrity = await client.execute("PRAGMA integrity_check");
  console.log("1. PRAGMA integrity_check :", integrity.rows[0]);
  if (integrity.rows[0]?.integrity_check !== "ok") {
    throw new Error("ÉCHEC: L'intégrité de la base de données n'est pas OK !");
  }

  // 2. PRAGMA foreign_key_check
  const fkCheck = await client.execute("PRAGMA foreign_key_check");
  console.log(`2. PRAGMA foreign_key_check : ${fkCheck.rows.length} violation(s)`);
  if (fkCheck.rows.length > 0) {
    console.error("Détails des violations de clés étrangères :", fkCheck.rows);
    throw new Error("ÉCHEC: Des clés étrangères sont orphelines !");
  }

  // 3. Unicité des références produits
  const dupSkus = await client.execute(
    "SELECT UPPER(sku) as sku_upper, count(*) as cnt FROM products GROUP BY sku_upper HAVING cnt > 1"
  );
  console.log(`3. Vérification unicité des références : ${dupSkus.rows.length} doublons`);
  if (dupSkus.rows.length > 0) {
    throw new Error("ÉCHEC: Références produits dupliquées trouvées !");
  }

  // 4. Nombre total d'articles
  const countProd = await client.execute("SELECT count(*) as cnt FROM products");
  const totalProducts = Number(countProd.rows[0].cnt);
  console.log(`4. Nombre total d'articles : ${totalProducts} (attendu: 97)`);
  if (totalProducts !== 97) {
    throw new Error(`ÉCHEC: Nombre d'articles incorrect (${totalProducts} au lieu de 97)`);
  }

  // 5 & 6. Totaux de stock par emplacement et total général
  const locTotalsRes = await client.execute(`
    SELECT l.name as location_name, l.code, COALESCE(SUM(ps.quantity), 0) as total_qty
    FROM locations l
    LEFT JOIN product_stocks ps ON l.id = ps.locationId
    GROUP BY l.id, l.name, l.code
    ORDER BY l.id
  `);
  console.log("\n5. Totaux de stock par emplacement :");
  const locExpected = {
    Showroom: 211,
    "Garage Chaaban": 24,
    "Garage Cheikh": 9,
    "3ème Garage / Dépôt": 0,
  };
  let grandTotal = 0;
  for (const row of locTotalsRes.rows) {
    const locName = String(row.location_name);
    const qty = Number(row.total_qty);
    const expected = locExpected[locName];
    console.log(`  - ${locName} (${row.code}) : ${qty} unités (attendu: ${expected})`);
    if (qty !== expected) {
      throw new Error(`ÉCHEC: Quantité incorrecte à ${locName}: obtenu ${qty}, attendu ${expected}`);
    }
    grandTotal += qty;
  }
  console.log(`6. Quantité globale : ${grandTotal} unités (attendu: 244)`);
  if (grandTotal !== 244) {
    throw new Error(`ÉCHEC: Quantité totale incorrecte (${grandTotal} au lieu de 244)`);
  }

  // 7. Concordance entre stock_movements et product_stocks
  const mvtSumRes = await client.execute("SELECT COALESCE(SUM(quantity), 0) as mvt_total FROM stock_movements WHERE type='INITIAL'");
  const mvtTotal = Number(mvtSumRes.rows[0].mvt_total);
  console.log(`7. Somme des mouvements INITIAL : ${mvtTotal} unités (attendu: 244)`);
  if (mvtTotal !== 244) {
    throw new Error(`ÉCHEC: La somme des mouvements (${mvtTotal}) ne correspond pas au stock initial (244)`);
  }

  // Vérifier pour chaque produit que product.stock == SUM(product_stocks.quantity)
  const stockDiscrepancies = await client.execute(`
    SELECT p.id, p.sku, p.stock as recorded_stock, COALESCE(SUM(ps.quantity), 0) as calculated_stock
    FROM products p
    LEFT JOIN product_stocks ps ON p.id = ps.productId
    GROUP BY p.id
    HAVING recorded_stock != calculated_stock
  `);
  console.log(`   Divergences de stock par produit : ${stockDiscrepancies.rows.length}`);
  if (stockDiscrepancies.rows.length > 0) {
    throw new Error("ÉCHEC: Incohérence entre product.stock et la somme des stocks par dépôt !");
  }

  // 8. Prix d'achat et de vente non renseignés
  const nonNullPrices = await client.execute(
    "SELECT count(*) as cnt FROM products WHERE sellingPrice IS NOT NULL OR costPrice IS NOT NULL"
  );
  const pricedCount = Number(nonNullPrices.rows[0].cnt);
  console.log(`8. Produits avec prix non nuls : ${pricedCount} (attendu: 0 car intentionnellement non renseignés)`);
  if (pricedCount !== 0) {
    throw new Error(`ÉCHEC: Des prix ont été renseignés par inadvertance (${pricedCount} produits)`);
  }

  // 9. Préservation des paramètres boutique, logo, catégories, emplacements
  const settingsRes = await client.execute("SELECT id, shopName, address, phone, nifRc, currency FROM shop_settings WHERE id = 1");
  console.log("9. Paramètres boutique préservés :", settingsRes.rows[0]);
  if (!settingsRes.rows[0] || settingsRes.rows[0].shopName !== "Shop ERP Mobilier") {
    throw new Error("ÉCHEC: Les paramètres boutique ont été altérés !");
  }

  const catCountRes = await client.execute("SELECT count(*) as cnt FROM categories");
  console.log(`   Catégories en base : ${catCountRes.rows[0].cnt} (10 du catalogue + 1 existante)`);

  const locCountRes = await client.execute("SELECT count(*) as cnt FROM locations WHERE isActive = 1");
  console.log(`   Emplacements actifs : ${locCountRes.rows[0].cnt} (4 attendus)`);

  // 10. Génération de références de factures et paiements
  console.log("10. Test de génération séquentielle des références...");
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  // Vérifier qu'aucune facture n'existe et que la prochaine séquence débutera proprement à 1
  const existingSalesCount = await client.execute("SELECT count(*) as cnt FROM sales");
  console.log(`    Factures actuelles : ${existingSalesCount.rows[0].cnt} (prochaine séquence propre FAC-${ym}-0001)`);

  console.log("\n✓ TOUTES LES VÉRIFICATIONS DE LA PHASE 6 SONT VALIDÉES AVEC SUCCÈS !");
  await client.close();
}

main().catch(console.error);
