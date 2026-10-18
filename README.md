# Shop ERP — Furniture Manager

A **local-first ERP system** built for small furniture shops. It covers the full business cycle — from managing products and stock, to recording sales and purchases, tracking deliveries, handling cash flow, and generating documents. All data lives on your machine in a local SQLite database. No internet connection, no cloud, no subscription fees.

---

## Features

### 🛋️ Products & Inventory
- Manage your product catalogue with SKU, name, category, unit price, and cost price
- Track current stock levels with configurable minimum stock thresholds
- Automatically adjust stock when sales and purchases are recorded

### 👤 Customers
- Maintain a customer directory with contact details (phone, email, address)
- Link customers to their sales history

### 🏭 Suppliers
- Keep a supplier registry with full contact information
- Associate suppliers with purchase orders

### 🛒 Sales Orders
- Create and manage sales orders with a unique reference number
- Track payment status (draft → confirmed → paid)
- Record partial payments and outstanding balances
- Add line items with per-item discounts
- Link deliveries to sales orders

### 📦 Purchases
- Record purchase orders from suppliers
- Track goods received and amounts paid
- Update stock automatically upon purchase completion

### 🚚 Deliveries
- Create delivery records linked to sales orders
- Track delivery status (pending → in transit → delivered)
- Store delivery address and scheduled date

### 💰 Cash & Expenses
- Log all cash transactions (income and expenses)
- Categorise entries for reporting
- Full transaction history with date and reference

### 📄 Documents
- Generate and view invoices and receipts tied to sales

### 📊 Reports
- Business overview and performance reporting

### ⚙️ Settings
- Application configuration and preferences

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| UI Components | Radix UI / shadcn/ui patterns |
| Database | SQLite (via `@libsql/client`) |
| ORM | Prisma 7 (with `@prisma/adapter-libsql`) |

---

## Data Models

| Model | Description |
|---|---|
| `Product` | Catalogue item with SKU, pricing, and stock levels |
| `Customer` | Customer contact record |
| `Supplier` | Supplier contact record |
| `Sales` | Sale order header (reference, status, totals) |
| `SaleItem` | Line item on a sale (product, qty, price, discount) |
| `Purchase` | Purchase order header (reference, status, totals) |
| `PurchaseItem` | Line item on a purchase (product, qty, cost) |
| `Delivery` | Delivery linked to a sale (status, date, address) |
| `Transaction` | Cash/expense entry (type, category, amount, date) |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

---

## Setup Instructions

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

Create the `.env` file if it doesn't exist:

```bash
# .env
DATABASE_URL="file:./prisma/shop.db"
```

Then run the migration to create and initialise the SQLite database:

```bash
# Windows
set DATABASE_URL=file:./prisma/shop.db && npx prisma migrate dev

# macOS / Linux
DATABASE_URL=file:./prisma/shop.db npx prisma migrate dev
```

This creates the database file at `prisma/shop.db`.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Start the production server |
| `npm run db:migrate` | Run new database migrations |
| `npm run db:generate` | Regenerate the Prisma client after schema changes |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |

---

## Where is the database stored?

The SQLite database file is located at:

```
<project-root>/prisma/shop.db
```

This file contains **all your shop data**. **Back it up regularly** by simply copying this file to a safe location.

> The database file is listed in `.gitignore` so it is never accidentally committed to version control.

---

## Project Structure

```
shop-erp/
├── prisma/
│   ├── schema.prisma       # Database schema (all models)
│   ├── migrations/         # Migration history
│   └── shop.db             # SQLite database (local, not in git)
├── prisma.config.ts        # Prisma 7 configuration
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── layout.tsx      # Root layout (sidebar + top bar)
│   │   ├── page.tsx        # Dashboard
│   │   ├── products/       # Products & Stock management
│   │   ├── sales/          # Sales orders
│   │   ├── purchases/      # Purchase orders
│   │   ├── deliveries/     # Delivery tracking
│   │   ├── customers/      # Customer records
│   │   ├── suppliers/      # Supplier records
│   │   ├── cash/           # Cash & Expenses ledger
│   │   ├── documents/      # Invoices & receipts
│   │   ├── reports/        # Business reports
│   │   └── settings/       # Application settings
│   ├── components/
│   │   └── layout/
│   │       ├── Sidebar.tsx # Navigation sidebar
│   │       └── TopBar.tsx  # Top header bar
│   ├── config/
│   │   └── navigation.ts   # Navigation items config
│   ├── generated/
│   │   └── prisma/         # Auto-generated Prisma client (do not edit)
│   └── lib/
│       ├── prisma.ts       # Prisma client singleton
│       └── utils.ts        # Shared utilities (cn)
└── .env                    # Environment variables (DATABASE_URL)
```

---

## Notes

- This is a **single-user, single-computer** application. No authentication or multi-user support is included.
- No internet connection is required to run or access data after installation.
- To browse the database visually, run `npm run db:studio`.
- After editing `prisma/schema.prisma`, always run `npm run db:migrate` then `npm run db:generate` to keep the Prisma client in sync.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| UI Components | Radix UI / shadcn/ui patterns |
| Database | SQLite (via better-sqlite3) |
| ORM | Prisma 7 |

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm (comes with Node.js)

---

## Setup Instructions

### 1. Install dependencies

```bash
npm install
```

### 2. Set up the database

Create the `.env` file if it doesn't exist:

```bash
# .env
DATABASE_URL="file:./prisma/shop.db"
```

Then run the migration to create and set up the SQLite database:

```bash
set DATABASE_URL=file:./prisma/shop.db && npx prisma migrate dev
```

> On macOS / Linux: `DATABASE_URL=file:./prisma/shop.db npx prisma migrate dev`

This creates the database file at `prisma/shop.db`.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Where is the database stored?

The SQLite database file is located at:

```
<project-root>/prisma/shop.db
```

This file contains all your shop data (products, sales, customers, etc.). **Back it up regularly** by copying this file.

> The database file is listed in `.gitignore` so it is never accidentally committed to version control.

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Start the production server |
| `npm run db:migrate` | Run new database migrations |
| `npm run db:generate` | Regenerate the Prisma client after schema changes |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |

---

## Project Structure

```
shop-erp/
├── prisma/
│   ├── schema.prisma       # Database schema
│   ├── migrations/         # Migration history
│   └── shop.db             # SQLite database (local, not in git)
├── prisma.config.ts        # Prisma 7 configuration
├── src/
│   ├── app/                # Next.js App Router pages
│   │   ├── layout.tsx      # Root layout (sidebar + top bar)
│   │   ├── page.tsx        # Dashboard
│   │   ├── products/       # Products & Stock
│   │   ├── sales/          # Sales orders
│   │   ├── purchases/      # Purchase orders
│   │   ├── deliveries/     # Delivery tracking
│   │   ├── customers/      # Customer records
│   │   ├── suppliers/      # Supplier records
│   │   ├── cash/           # Cash & Expenses
│   │   ├── documents/      # Invoices & receipts
│   │   ├── reports/        # Reports
│   │   └── settings/       # Settings
│   ├── components/
│   │   └── layout/
│   │       ├── Sidebar.tsx # Navigation sidebar
│   │       └── TopBar.tsx  # Top header bar
│   ├── config/
│   │   └── navigation.ts   # Navigation items config
│   ├── generated/
│   │   └── prisma/         # Auto-generated Prisma client (do not edit)
│   └── lib/
│       ├── prisma.ts       # Prisma client singleton
│       └── utils.ts        # Shared utilities (cn)
└── .env                    # Environment variables (DATABASE_URL)
```

---

## Notes

- This is a **single-user, single-computer** application. No authentication or multi-user support.
- No internet connection required to run or access data after installation.
- To browse the database visually, run `npm run db:studio`.
