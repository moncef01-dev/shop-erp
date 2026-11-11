// Génère les variantes de schéma par fournisseur à partir du schéma canonique SQLite.
// - prisma/.generated/sqlite/schema.prisma    (provider = "sqlite")
// - prisma/.generated/postgres/schema.prisma  (provider = "postgresql")
// Les clients correspondants sont générés via `npm run db:generate:sqlite|postgres`.

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const canonicalPath = path.join(root, "prisma", "schema.prisma");
const outDir = path.join(root, "prisma", ".generated");

const canonical = fs.readFileSync(canonicalPath, "utf8");

const variants = [
  { provider: "sqlite", dir: "sqlite", output: "../../../src/generated/prisma/sqlite" },
  { provider: "postgresql", dir: "postgres", output: "../../../src/generated/prisma/postgres" },
];

for (const variant of variants) {
  let schema = canonical
    .replace(/output\s*=\s*"([^"]+)"/, `output   = "${variant.output}"`)
    .replace(/provider\s*=\s*"sqlite"/, `provider = "${variant.provider}"`);

  const dir = path.join(outDir, variant.dir);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "schema.prisma"), schema);
  console.log(`✓ Schéma généré : prisma/.generated/${variant.dir}/schema.prisma (provider=${variant.provider})`);
}
