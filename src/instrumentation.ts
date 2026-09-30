import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/shared/observability/sentry";

// Server-side error monitoring (spec F01 section 4). Disabled when SENTRY_DSN is not set.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init(sentryOptions(process.env.SENTRY_DSN || undefined, process.env.NODE_ENV));
  }
}

export const onRequestError = Sentry.captureRequestError;
