import { registerHooks } from "node:module";

const HYPHENATE = "@react-pdf/hyphenate";

// The worker renders the LGPD export summary (F14), the only PDF built outside Next.js. Under tsx
// the @react-pdf packages are loaded through require(), and @react-pdf/hyphenate publishes its
// entry points only under the "import" condition, so require() cannot resolve them. The hook adds
// that condition for this one package; every other resolution is left untouched.
export function registerPdfEngineResolution(): void {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === HYPHENATE || specifier.startsWith(`${HYPHENATE}/`)) {
        return nextResolve(specifier, { ...context, conditions: [...context.conditions, "import"] });
      }
      return nextResolve(specifier, context);
    },
  });
}
