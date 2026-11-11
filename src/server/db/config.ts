export type DbProvider = "sqlite" | "postgres";

function resolveDbProvider(): DbProvider {
  const raw = (process.env.DB_PROVIDER ?? "sqlite").trim().toLowerCase();
  if (raw === "sqlite" || raw === "postgres") {
    return raw;
  }
  throw new Error(
    `DB_PROVIDER invalide : "${raw}". Valeurs supportées : "sqlite", "postgres".`
  );
}

export const dbProvider: DbProvider = resolveDbProvider();
