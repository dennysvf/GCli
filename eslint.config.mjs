import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

// Module boundaries (architecture section 4, ADR-002), enforced with no-restricted-imports:
// - other modules are imported only through their public entry point `@/modules/<name>`;
//   files inside a module import each other with relative paths;
// - domain/ is pure TypeScript; application/ never imports infrastructure/ or ui/;
// - routes never touch the database;
// - the unscoped Prisma client is restricted to infrastructure code.
// Flat config: when several blocks match a file, the last one wins for the same rule.
const deepModuleImport = {
  group: ["@/modules/*/**", "!@/modules/*/next", "!@/modules/*/client"],
  message:
    "Import other modules only through their public entry points '@/modules/<name>' (or '@/modules/<name>/next' for Next.js helpers, '@/modules/<name>/client' for client UI).",
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

// JSX attributes that carry identifiers or tokens, not interface text.
const TECHNICAL_ATTRIBUTES = [
  "className",
  "style",
  "type",
  "key",
  "id",
  "width",
  "height",
  "name",
  "htmlFor",
  "autoComplete",
  "value",
  "defaultValue",
  "role",
  "variant",
  "size",
  "side",
  "align",
  "href",
  "src",
  "inputMode",
  "pattern",
  "accept",
  "target",
  "rel",
  "method",
  "action",
  "orientation",
  "tabIndex",
  "color",
  "sideOffset",
  "min",
  "max",
  "step",
  "lang",
  "dir",
  "colSpan",
  "scope",
  "loading",
  "decoding",
  "mode",
  "kind",
  "tone",
  "status",
  "icon",
  "field",
  "placement",
  "viewBox",
  "fill",
  "stroke",
  "d",
  "xmlns",
  "data-testid",
  "data-slot",
  "data-state",
  "tag",
  "idPrefix",
  "namespace",
  "locale",
  "country",
  "currency",
  "aria-live",
  "aria-sort",
  "aria-haspopup",
  "aria-current",
  "aria-orientation",
  "aria-controls",
  "aria-describedby",
  "aria-labelledby",
  "aria-autocomplete",
  "aria-checked",
  "aria-selected",
  "aria-expanded",
  "aria-pressed",
  "aria-invalid",
  "aria-disabled",
  "aria-hidden",
  "aria-busy",
  "aria-modal",
  "autoCapitalize",
  "spellCheck",
  "enterKeyHint",
  "crossOrigin",
  "referrerPolicy",
  "sizes",
  "media",
  "as",
  "prefetch",
  "scroll",
];

// Strings that are identifiers (field names, tokens, permissions, locales), never interface text.
const TECHNICAL_WORDS = [
  "[0-9!-/:-@[-`{-~]+",
  "[A-Z_-]+",
  /^[A-Z]\d+$/,
  /^GCli$/,
  /^[\s·•–—|/,.:;()+×&-]+$/,
  "^[a-z]+[A-Z][A-Za-z0-9]*$",
  "^[a-z0-9]+([-.:][A-Za-z0-9]+)+$",
  "^(email|password|name|version|description|off|rg|up|down|start|end|edit|cancel|details|change|reschedule|short|blue|tag|true|input|trigger|sidebar|separator|reason|note|status|kind|tone|primary|secondary|occupation|observations|specialty)$",
  /^\p{Emoji}+$/u,
];

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
      "src/shared/observability/**",
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
  // ADR-028: interface text lives in the catalogs, never as a literal in JSX.
  {
    files: ["src/modules/*/ui/**/*.tsx", "src/app/**/*.tsx", "src/shared/ui/**/*.tsx"],
    ignores: ["**/*.test.tsx", "src/shared/ui/components/**"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": { exclude: TECHNICAL_ATTRIBUTES },
          words: { exclude: TECHNICAL_WORDS },
        },
      ],
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
