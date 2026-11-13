// Types canoniques partagés par la couche serveur.
// Le client généré SQLite est le type canonique du singleton (AppPrismaClient,
// voir index.ts) ; le client PostgreSQL, généré depuis le même schéma, est
// casté au runtime. Toute la couche app doit passer par ce module plutôt que
// d'importer @/generated/prisma directement.
export type { Prisma, PrismaClient } from "@/generated/prisma/sqlite/client";
