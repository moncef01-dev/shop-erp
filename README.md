# Shop ERP — Système de Gestion Intégré pour Magasin de Mobilier

Système ERP complet, local (*local-first*) et autonome, développé sur mesure pour la gestion opérationnelle, commerciale, logistique et financière d'un magasin de mobilier et décoration d'intérieur en Algérie.

Toutes les données sont stockées localement dans une base de données SQLite haute performance sans dépendance au cloud, sans abonnement, avec garantie de confidentialité et fonctionnement hors-ligne à 100 %.

---

## Sommaire

1. [Présentation & Philosophie du Système](#1-présentation--philosophie-du-système)
2. [Modules Implémentés](#2-modules-implémentés)
3. [Stack Technique & Dépendances](#3-stack-technique--dépendances)
4. [Architecture & Structure du Projet](#4-architecture--structure-du-projet)
5. [Installation & Configuration sous Windows](#5-installation--configuration-sous-windows)
6. [Démarrage & Exploitation en Production](#6-démarrage--exploitation-en-production)
7. [Scripts npm Disponibles](#7-scripts-npm-disponibles)
8. [Base de Données, Sauvegardes & Restauration](#8-base-de-données-sauvegardes--restauration)
9. [Tests & Assurance Qualité](#9-tests--assurance-qualité)
10. [Documentation Associée](#10-documentation-associée)

---

## 1. Présentation & Philosophie du Système

Shop ERP centralise l'intégralité du cycle de vie commercial et comptable d'un point de vente de mobilier :
- **Architecture Locale-First** : Exécution sur machine locale ou réseau local d'entreprise (LAN) avec moteur SQLite/LibSQL pur JS ne nécessitant aucun outil de compilation C/C++.
- **Fournisseur de Base de Données Modulaire (`DB_PROVIDER`)** : Le système fonctionne par défaut sur **SQLite** et peut basculer sur **PostgreSQL** via une simple variable d'environnement (`.env`). Toute la couche d'accès aux données est abstraite dans `src/server` (seam agnostique moteur + repositories) : un même code métier s'exécute sur les deux moteurs.
- **Intégrité Financière Stricte** : Gestion multi-comptes de trésorerie (Caisse physique, Coffres magasin et maison, Comptes bancaires), sessions de caisse contrôlées, gestion séparée des acomptes, des versements fournisseurs hors-dette et des imputations ultérieures.
- **Verrouillage Périodique (Period-Lock)** : Clôture mensuelle empêchant toute altération rétroactive des écritures antérieures, avec procédure de réouverture exceptionnelle auditée.
- **Traçabilité des Stocks** : Suivi multi-dépôts (Showroom, garages et dépôts secondaires), valorisation PMP/Coût d'achat, mouvements immuables avec interdiction absolue de stock négatif.
- **Conformité & Devises** : Prise en charge native du Dinar Algérien (DA / DZD), mentions légales, NIF/RC/NIS, génération de documents d'impression PDF au format A4 et tickets de caisse.

---

## 2. Modules Implémentés

| Module | Route Principale | Description Fonctionnelle |
|---|---|---|
| **Tableau de Bord** | `/` | Indicateurs clés (KPI), alertes d'exploitation (stocks critiques, impayés, session de caisse), graphique ventes vs encaissements, journal d'activité récente. |
| **Produits & Stock** | `/products` | Catalogue articles, déclinaisons (modèles, couleurs), gestion des catégories, multi-emplacements (Showroom, Garages), réceptions, sorties, ajustements et transferts. |
| **Ventes & Facturation** | `/sales` | Bons de vente, devis / commandes en brouillon, factures définitives, remises à la ligne, frais de livraison, règlements partiels/comptant, annulations avec réintégration des stocks. |
| **Achats & Réceptions** | `/purchases` | Commandes fournisseurs, réceptions physiques partielles ou totales, suivi du statut de paiement et impact sur la dette fournisseur. |
| **Clients & Créances** | `/customers` | Répertoire clients, suivi des coordonnées, historique des ventes, balance des créances et relevés de compte individuels. |
| **Épargne & Avoirs Client** | `/savings` | Dépôts libres sans achat immédiat, gestion d'un solde cagnotte disponible, imputation directe sur factures et remboursements. |
| **Fournisseurs & Dettes** | `/suppliers` | Comptes fournisseurs, dettes initiales, règlements ordinaires, versements supplémentaires (hors-dette), imputations sur dette et relevés de compte. |
| **Trésorerie Multi-Comptes** | `/cash` | Gestion des comptes de trésorerie (Caisse, Coffre Magasin, Coffre Maison, Banque), transferts inter-comptes, apports, retraits, situation globale. |
| **Caisse Journalière** | `/cash/journal`, `/cash/closing` | Ouverture de session, saisie des encaissements/décaissements, journal du jour, clôture avec calcul d'écart théorique/compté et audit des corrections. |
| **Charges d'Exploitation** | `/cash/expenses` | Saisie des décaissements et encaissements exceptionnels, ventilation par catégories (loyer, transport, salaires, entretien, fournitures...). |
| **Clôture Mensuelle** | `/closing/monthly` | Checklist de pointage fin de mois, génération d'instantanés financiers (snapshots JSON immuables), verrouillage formel de la période et audit des réouvertures. |
| **Centre de Documents** | `/documents` | Registre unifié de tous les documents émis (factures, devis, réceptions, bons de paiement, bons de caisse, transferts), réimpression et export PDF. |
| **Rapports & Statistiques** | `/reports` | Chiffre d'affaires facturé vs encaissé, analyse de marge brute avec transparence sur la couverture des coûts, valorisation des stocks par dépôt, top ventes. |
| **Paramètres & Système** | `/settings` | Coordonnées de l'entreprise, mentions légales, logo pour documents, gestion des sauvegardes SQLite (création, vérification, restauration assistée). |

---

## 3. Stack Technique & Dépendances

Les versions réelles utilisées dans le projet sont :

| Couche | Technologie | Version |
|---|---|---|
| **Framework Web** | [Next.js](https://nextjs.org/) (App Router, Server Actions) | `16.2.2` |
| **Bibliothèque UI** | [React](https://react.dev/) & React DOM | `19.2.4` |
| **Langage** | [TypeScript](https://www.typescriptlang.org/) | `^5` |
| **Style & Design System** | [Tailwind CSS v4](https://tailwindcss.com/) & PostCSS | `@tailwindcss/postcss ^4` |
| **Composants Primitifs** | Radix UI (`@radix-ui/react-dialog`, `react-tooltip`, etc.) | Dernières versions stables |
| **Base de Données (défaut)** | [SQLite](https://www.sqlite.org/) via `@libsql/client` (pur JS / WASM) | `^0.18.0` |
| **Base de Données (option)** | [PostgreSQL](https://www.postgresql.org/) via `@prisma/adapter-pg` + `pg` | mêmes versions que Prisma |
| **ORM & Schéma** | [Prisma ORM](https://www.prisma.io/) avec `@prisma/adapter-libsql` (SQLite) / `@prisma/adapter-pg` (PostgreSQL) | `^7.10.1` |
| **Config CLI & Env** | `prisma.config.ts` + [dotenv](https://github.com/motdotla/dotenv) (chargement explicite du `.env`) | `^7.10.1` / `^16` |
| **Génération PDF** | [jsPDF](https://github.com/parallax/jsPDF) & `jspdf-autotable` | `^4.2.1` / `^5.0.9` |
| **Iconographie** | [Lucide React](https://lucide.dev/) | `^1.59.0` |
| **Utilitaires CSS** | `clsx` & `tailwind-merge` | `^2.1.1` / `^3.7.0` |

---

## 4. Architecture & Structure du Projet

```
shop-erp/
├── prisma/
│   ├── schema.prisma              # Schéma canonique (provider SQLite)
│   ├── .generated/                # Variantes de schéma par fournisseur (sqlite/ postgres/) — générées
│   ├── shop.db                    # Fichier de base de données SQLite active
│   ├── backups/                   # Répertoire de stockage des sauvegardes automatiques (SQLite)
│   ├── migrations/                # Migrations Prisma SQL (SQLite)
│   └── migrations-postgres/       # Baseline PostgreSQL + migrations suivantes
├── public/                        # Fichiers statiques et logos
├── scripts/
│   ├── backup.mjs                 # Script autonome de sauvegarde SQLite (VACUUM INTO)
│   ├── db/
│   │   └── build-provider-schemas.mjs # Génère les 2 variantes de schéma depuis le schéma canonique
│   └── ...                        # Utilitaires de maintenance et de réconciliation
├── src/
│   ├── app/                       # Routes Next.js App Router & Server Actions
│   │   ├── page.tsx               # Tableau de bord principal (DashboardClient)
│   │   ├── dashboard-actions.ts   # Logique serveur du tableau de bord
│   │   ├── layout.tsx             # Shell applicatif (Sidebar, TopBar, PrintPortal)
│   │   ├── products/              # Module Produits, Catégories, Dépôts & Mouvements
│   │   ├── sales/                 # Module Ventes, Devis, Acomptes & Facturation
│   │   ├── purchases/             # Module Achats, Réceptions & Règlements Fournisseurs
│   │   ├── customers/             # Module Répertoire Clients & Balances
│   │   ├── suppliers/             # Module Fournisseurs, Dettes, Versements & Imputations
│   │   ├── cash/                  # Module Trésorerie multi-comptes, Journal & Caisse
│   │   ├── closing/monthly/       # Module Clôture mensuelle, Audit & Snapshots
│   │   ├── savings/               # Module Épargne & Avoirs clients
│   │   ├── documents/             # Registre unifié des documents & Fiches d'inventaire
│   │   ├── reports/               # Analyses financières, Marges & Valorisation
│   │   └── settings/              # Paramètres boutique, Sauvegardes & Restauration
│   ├── server/                    # Couche serveur agnostique du moteur de base de données
│   │   ├── db/                    # Seam de connexion : config (DB_PROVIDER), client.sqlite,
│   │   │                          #   client.postgres, capabilities, search, singleton prisma
│   │   ├── repositories/          # Toute la couche d'accès aux données (13 repositories)
│   │   └── services/              # Services transversaux : inventory, period-lock, backup/
│   ├── components/                # Composants d'interface modulaires
│   │   ├── layout/                # Sidebar, TopBar, Navigation
│   │   ├── common/                # Modalités de confirmation, sélecteurs, inputs sécurisés
│   │   ├── sales/                 # Sélecteur d'articles, factures imprimables
│   │   ├── purchases/             # Modals de commande, réception et impression
│   │   ├── suppliers/             # Modals de versement hors-dette, imputation et annulation
│   │   ├── closing/               # Sections de checklist et rapports mensuels
│   │   └── documents/             # Modèles d'impression unifiés
│   ├── config/
│   │   └── navigation.ts          # Définition centrale des menus et sous-menus
│   ├── generated/
│   │   └── prisma/                # Clients Prisma générés typés (sqlite/ et postgres/)
│   └── lib/                       # Utilitaires transversaux (compat : ré-exports vers src/server)
│       ├── prisma.ts              # Shim de compatibilité → src/server/db
│       ├── period-lock.ts         # Shim de compatibilité → src/server/services/period-lock
│       ├── inventory-transaction.ts # Shim de compatibilité → src/server/services/inventory
│       ├── formatters.ts          # Formatage Dinar Algérien (DA), dates et nombres
│       ├── utils.ts               # Utilitaires généraux
│       └── pdf/                   # Moteurs de rendu jsPDF (factures, inventaires)
├── tests/                         # Suites de tests automatisées (isolées, sans cloud)
├── docs/                          # Documentation complète du système
│   ├── USER_GUIDE.md              # Manuel d'utilisation détaillé en français
│   ├── MODULES_REFERENCE.md       # Référentiel technique et règles métier
│   └── DAILY_OPERATIONS.md        # Guide des opérations quotidiennes
├── prisma.config.ts               # Config CLI Prisma : schéma/migrations/URL selon DB_PROVIDER
├── package.json                   # Dépendances et scripts de commande
├── run.bat                        # Script Windows de lancement automatique en 1 clic
└── tsconfig.json                  # Configuration TypeScript stricte
```

---

## 5. Installation & Configuration sous Windows

### Prérequis
- **Système d'exploitation** : Windows 10 ou Windows 11 (64-bit).
- **Node.js** : Version `18.x` ou supérieure (recommandé : Node.js `20.x LTS` ou `22.x LTS`).
- **Gestionnaire de paquets** : `npm` (inclus avec Node.js).
- **Git** pour Windows (optionnel mais recommandé).

### Procédure d'installation

1. **Ouvrir le terminal** (PowerShell ou Invite de commandes) dans le dossier du projet :
   ```powershell
   cd C:\Users\Moncef\Desktop\shop-erp
   ```

2. **Installer les dépendances npm** :
   ```powershell
   npm install
   ```

3. **Vérifier le fichier d'environnement `.env`** :
   Par défaut, l'application fonctionne sur la base SQLite locale :
   ```env
   DB_PROVIDER=sqlite
   DATABASE_URL="file:./prisma/shop.db"
   ```
   Pour cibler un serveur **PostgreSQL** à la place, définir :
   ```env
   DB_PROVIDER=postgres
   POSTGRES_DATABASE_URL=postgresql://user:password@localhost:5432/shop
   ```
   *(Voir la section 8 pour le détail du basculement.)*

4. **Générer les clients Prisma** (double client SQLite + PostgreSQL) :
   ```powershell
   npm run db:generate
   ```

5. **Appliquer les migrations de base de données** :
   Pour une première installation ou une mise à jour en production :
   ```powershell
   npx prisma migrate deploy
   ```
   *(Le CLI Prisma cible automatiquement les migrations du fournisseur actif via `prisma.config.ts`.
   En environnement de développement, `npm run db:migrate` peut être utilisé.)*

---

## 6. Démarrage & Exploitation en Production

### Option A — Lancement automatique en un clic (Recommandé)
Double-cliquer sur le fichier `run.bat` situé à la racine du projet.
Ce script automatisé :
1. Démarre le serveur Next.js en arrière-plan (`npm run start`).
2. Surveille la disponibilité du port `3000` via une sonde TCP PowerShell.
3. Ouvre automatiquement votre navigateur Web par défaut à l'adresse `http://localhost:3000`.

### Option B — Lancement manuel en mode production
1. Compiler l'application :
   ```powershell
   npm run build
   ```
2. Démarrer le serveur de production :
   ```powershell
   npm run start
   ```
3. Accéder à l'application via votre navigateur à l'adresse : `http://localhost:3000`.

### Option C — Démarrage en mode développement
Pour modifier le code avec rechargement à chaud (*Fast Refresh*) :
```powershell
npm run dev
```

---

## 7. Scripts npm Disponibles

| Commande | Rôle |
|---|---|
| `npm run dev` | Lance le serveur de développement Next.js sur `http://localhost:3000`. |
| `npm run build` | Compile l'application Next.js avec Webpack pour la production. |
| `npm run start` | Démarre le serveur de production compilé. |
| `npm run lint` | Exécute l'analyse statique du code avec ESLint. |
| `npm run db:build:schemas` | Génère les variantes de schéma `prisma/.generated/{sqlite,postgres}/` depuis le schéma canonique. |
| `npm run db:generate` | Génère les **deux** clients Prisma typés (`src/generated/prisma/sqlite` et `src/generated/prisma/postgres`). |
| `npm run db:generate:sqlite` | Génère uniquement le client SQLite. |
| `npm run db:generate:postgres` | Génère uniquement le client PostgreSQL. |
| `npm run db:migrate` | Applique les migrations du fournisseur actif (via `DB_PROVIDER`). |
| `npm run db:migrate:sqlite` | Migrations interactives forcées sur SQLite. |
| `npm run db:migrate:postgres` | Migrations interactives forcées sur PostgreSQL. |
| `npm run db:backup` | Exécute le script `scripts/backup.mjs` créant un instantané sécurisé de `shop.db` (SQLite uniquement ; refuse proprement si `DB_PROVIDER=postgres`). |
| `npm run db:studio` | Ouvre l'interface Web Prisma Studio pour inspecter la base de données. |
| `npm run test:all` | Exécute séquentiellement l'intégralité des suites de tests automatisées. |

### Commandes de tests unitaires et d'intégration ciblées :
- `npm run test:stock` : Intégrité des stocks, mouvements et valorisation.
- `npm run test:sales` : Cycle des ventes, remises, statuts et encaissements.
- `npm run test:purchases` : Cycle des commandes d'achats, réceptions et dettes.
- `npm run test:cash` : Sessions de caisse, transferts et contrôles hors-session.
- `npm run test:treasury` : Soldes multi-comptes et grands livres fournisseurs.
- `npm run test:savings` : Épargne et avoirs clients (dépôts, imputations, remboursements).
- `npm run test:closing-audit` : Verrouillage de période et audit des clôtures.
- `npm run test:settings` : Sauvegardes, vérification d'intégrité et restauration.
- `npm run test:documents` : Registre unifié des documents et données d'impression.
- `npm run test:reports` : Agrégats statistiques, calculs de marge et filtres temporels.
- `npm run test:pg:smoke` : Contrôle sanitaire PostgreSQL (nécessite `TEST_POSTGRES_URL` — voir section 8).

---

## 8. Base de Données, Sauvegardes & Restauration

### Fournisseur de base de données : le toggle `DB_PROVIDER`
Le fournisseur actif est choisi par une **unique variable d'environnement** dans le fichier `.env` :

```env
DB_PROVIDER=sqlite     # ou "postgres"
```

| Ce qui bascule automatiquement | Mécanisme |
|---|---|
| Client de connexion de l'application (au démarrage du serveur) | `src/server/db/index.ts` instancie `PrismaLibSql` (SQLite) ou `PrismaPg` (PostgreSQL) |
| CLI Prisma (`migrate`, `generate`, `studio`) | `prisma.config.ts` sélectionne le schéma, le dossier de migrations et l'URL (dotenv chargé explicitement) |
| Sauvegardes intégrées | Actives uniquement sur SQLite — voir ci-dessous |
| Point « sauvegarde » de la checklist de clôture mensuelle | Auto-marqué **N/A** sur PostgreSQL |

Règles d'usage :
- `DATABASE_URL` = SQLite uniquement ; `POSTGRES_DATABASE_URL` = PostgreSQL uniquement (les deux variables coexistent dans le `.env`, seule celle du fournisseur actif est utilisée).
- Le changement de fournisseur nécessite un **redémarrage** du serveur (`npm run dev` / `next start`) — la sélection a lieu au démarrage du process, jamais à chaud.
- Les migrations PostgreSQL disposent d'une baseline dédiée dans `prisma/migrations-postgres/` (les migrations SQLite ne sont pas réutilisables telles quelles entre moteurs).
- Avant toute mise en production sur PostgreSQL, exécuter le contrôle sanitaire :
  ```powershell
  $env:TEST_POSTGRES_URL = "postgresql://user:pass@localhost:5432/shop_test"
  npm run test:pg:smoke    # applique le schéma, puis 1 lecture + 1 transaction + 1 déduction de stock atomique
  ```

### Emplacement de la base active (SQLite)
La base de données principale est située à l'adresse :
`prisma/shop.db`

### Mécanisme de Sauvegarde (Zéro Risque de Corruption) — SQLite uniquement
> ⚠️ **Les sauvegardes fichier intégrées s'appliquent exclusivement à SQLite.** Sur PostgreSQL
> (`DB_PROVIDER=postgres`), l'onglet Sauvegarde des Paramètres affiche un avis explicite et il faut
> recourir à un dump externe (ex. `pg_dump`). Le script `npm run db:backup` refuse également de
> s'exécuter sur PostgreSQL.

Le système utilise la directive native SQLite `VACUUM INTO` précédée d'un `PRAGMA wal_checkpoint(TRUNCATE)`. Cette méthode garantit :
- Un fichier de sauvegarde complet, compacté et cohérent sans verrouiller l'application ni risquer de lire des données partielles.
- Une vérification d'intégrité immédiate par `PRAGMA integrity_check`.
- La validation de la présence des tables clés (`products`, `sales`, `customers`, etc.).

### Sauvegarde manuelle ou planifiée
- **Via l'interface Web** : Rendez-vous dans **Paramètres** (`/settings`), onglet **Sauvegardes**, puis cliquez sur **« Créer une sauvegarde »**.
- **Via le terminal** : Exécutez `npm run db:backup`.
- **Automatisation Windows** : Le script `scripts/backup.mjs` peut être planifié quotidiennement via le Planificateur de tâches Windows (*Task Scheduler*).

### Restauration Assistée et Sécurisée (SQLite)
La restauration d'une sauvegarde s'effectue depuis **Paramètres** > **Sauvegardes** :
1. Sélectionner le fichier de sauvegarde dans l'historique.
2. Saisir obligatoirement le nom exact du fichier pour confirmer l'action.
3. Le système crée **automatiquement une sauvegarde de secours pré-restauration** (`pre_restore_YYYYMMDD_HHMMSS.db`) de la base active avant toute modification.
4. Les connexions Prisma sont temporairement suspendues, le fichier restauré est injecté et validé par un contrôle d'intégrité complet.

---

## 9. Tests & Assurance Qualité

Le projet intègre une suite rigoureuse de tests d'intégrité fonctionnelle et comptable exécutés sur des bases SQLite isolées en mémoire ou temporaires, sans aucun impact sur la base de production :

```powershell
# Vérification des types TypeScript
npx tsc --noEmit

# Vérification du style de code
npm run lint

# Exécution de tous les tests (22 suites)
npm run test:all

# Contrôle sanitaire PostgreSQL (base jetable requise)
$env:TEST_POSTGRES_URL = "postgresql://user:pass@localhost:5432/shop_test"
npm run test:pg:smoke
```

Toutes les suites de tests couvrent les règles financières critiques :
- L'impact strictement nul (0 DA) des imputations sur dette sur la trésorerie.
- L'interdiction des stocks négatifs.
- Le blocage des écritures rétroactives sur les mois verrouillés (`PeriodLockedError`).
- L'audit immuable des réouvertures et annulations.

---

## 10. Documentation Associée

Pour une consultation approfondie, trois manuels spécialisés sont disponibles dans le dossier `docs/` :

- 📖 [**Manuel d'Utilisation Complet (`docs/USER_GUIDE.md`)**](docs/USER_GUIDE.md)  
  Guide opérationnel détaillé pas-à-pas en français pour chaque écran, formulaire, action et cas d'usage de la boutique.
- ⚙️ [**Référentiel Technique & Métier (`docs/MODULES_REFERENCE.md`)**](docs/MODULES_REFERENCE.md)  
  Documentation exhaustive des modèles Prisma, Server Actions, formules de calcul, règles de validation et flux transversaux.
- 📋 [**Guide des Procédures Quotidiennes (`docs/DAILY_OPERATIONS.md`)**](docs/DAILY_OPERATIONS.md)  
  Checklist opérationnelle quotidienne, hebdomadaire et mensuelle pour les vendeurs, gestionnaires de stock et administrateurs.
