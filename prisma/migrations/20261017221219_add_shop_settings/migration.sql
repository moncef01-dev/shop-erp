-- CreateTable
CREATE TABLE "shop_settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "shopName" TEXT NOT NULL DEFAULT 'Shop ERP Mobilier',
    "activity" TEXT DEFAULT 'Magasin d''Ameublement & Décoration d''Intérieur',
    "address" TEXT DEFAULT 'Zone Commerciale & Exposition — Alger, Algérie',
    "phone" TEXT DEFAULT '+213 (0) 550 12 34 56 / +213 (0) 23 45 67 89',
    "email" TEXT DEFAULT 'contact@shoperp-mobilier.dz',
    "nifRc" TEXT DEFAULT '002416000000000',
    "documentFooter" TEXT DEFAULT 'Merci pour votre confiance. Les marchandises vendues sont garanties 12 mois. Service après-vente disponible 6j/7.',
    "currency" TEXT NOT NULL DEFAULT 'DA',
    "defaultLocationId" INTEGER,
    "logoUrl" TEXT,
    "backupRetentionCount" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
