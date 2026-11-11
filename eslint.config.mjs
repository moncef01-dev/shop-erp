import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["src/app/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/prisma", "@/lib/prisma.*"],
              message:
                "Les actions ne doivent pas importer le client Prisma directement : utiliser @/server/db, @/server/repositories/* ou @/server/services/*.",
            },
            {
              group: ["@/generated/prisma", "@/generated/prisma/**"],
              message:
                "Le client généré ne doit être importé que par @/server/db : utiliser @/server/db, @/server/repositories/* ou @/server/services/*.",
            },
            {
              group: ["@/lib/inventory-transaction", "@/lib/period-lock"],
              message:
                "Utiliser les services déplacés : @/server/services/inventory ou @/server/services/period-lock.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;

