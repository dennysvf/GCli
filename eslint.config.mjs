import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Module boundaries (architecture section 4, ADR-002), enforced with no-restricted-imports:
// - other modules are imported only through their public entry point `@/modules/<name>`;
//   files inside a module import each other with relative paths;
// - domain/ is pure TypeScript; application/ never imports infrastructure/ or ui/;
// - routes never touch the database;
// - the unscoped Prisma client is restricted to infrastructure code.
// Flat config: when several blocks match a file, the last one wins for the same rule.
const deepModuleImport = {
  group: ["@/modules/*/**"],
  message: "Import other modules only through their public entry point '@/modules/<name>'.",
};
const unscopedClient = {
  group: ["@/shared/db/client"],
  message:
    "Use the tenant-scoped client from '@/shared/db/tenant'. The unscoped client is infrastructure-only.",
};
const generatedPrisma = {
  group: ["@/generated/**"],
  message: "Only database infrastructure may import the generated Prisma client.",
};

const restrict = (...patterns) => ["error", { patterns }];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-imports": restrict(deepModuleImport, unscopedClient),
    },
  },
  {
    files: [
      "src/shared/db/**",
      "src/shared/security/**",
      "src/modules/*/infrastructure/**",
      "src/worker/**",
      "src/scripts/**",
      "tests/**",
    ],
    rules: { "no-restricted-imports": restrict(deepModuleImport) },
  },
  {
    files: ["src/modules/*/application/**"],
    rules: {
      "no-restricted-imports": restrict(deepModuleImport, unscopedClient, {
        group: ["../infrastructure/**", "../ui/**"],
        message: "application/ must not import infrastructure/ or ui/.",
      }),
    },
  },
  {
    files: ["src/modules/*/domain/**"],
    rules: {
      "no-restricted-imports": restrict(
        deepModuleImport,
        unscopedClient,
        generatedPrisma,
        {
          group: [
            "next",
            "next/**",
            "react",
            "@prisma/*",
            "../application/**",
            "../infrastructure/**",
            "../ui/**",
          ],
          message: "domain/ must stay pure: no framework, database, or outer-layer imports.",
        },
        {
          regex: "^@/shared/(?!kernel/)",
          message: "domain/ may only import '@/shared/kernel'.",
        },
      ),
    },
  },
  {
    files: ["src/app/**"],
    rules: {
      "no-restricted-imports": restrict(deepModuleImport, unscopedClient, generatedPrisma, {
        group: ["@/shared/db/**"],
        message: "Routes call use cases; they never query the database.",
      }),
    },
  },
  {
    files: ["**/*.test.ts", "**/*.spec.ts", "tests/**"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "src/generated/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);
