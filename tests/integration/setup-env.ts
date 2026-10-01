import { inject } from "vitest";

// Each test worker receives the container endpoints started by global-setup.ts.
Object.assign(process.env, inject("env"));

// Same cross-module wiring as the web server and the worker (src/composition.ts).
const { registerModules } = await import("@/composition");
registerModules();
