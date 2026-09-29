import { inject } from "vitest";

// Each test worker receives the container endpoints started by global-setup.ts.
Object.assign(process.env, inject("env"));
