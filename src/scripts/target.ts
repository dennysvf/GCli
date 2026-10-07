import type { Env } from "@/shared/config/env";

// Operational scripts run against development (.env) or production (.env.prod). They print where
// they are about to write, without credentials, so a wrong file is noticed before anything changes.
function hostOf(url: string | undefined): string {
  if (!url) return "AWS S3";
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return "?";
  }
}

export function describeTarget(env: Env, parts: ReadonlyArray<"database" | "storage" | "app">): string {
  const lines: string[] = [];
  if (parts.includes("database")) lines.push(`  banco:   ${hostOf(env.DATABASE_URL)}`);
  if (parts.includes("storage"))
    lines.push(`  storage: ${hostOf(env.S3_ENDPOINT)} (bucket ${env.S3_BUCKET})`);
  if (parts.includes("app")) lines.push(`  app:     ${env.APP_URL}`);
  return [`Destino (NODE_ENV=${env.NODE_ENV}):`, ...lines].join("\n");
}
