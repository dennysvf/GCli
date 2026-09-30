import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/shared/observability/sentry";

// Browser error monitoring. Disabled when NEXT_PUBLIC_SENTRY_DSN is not set at build time.
Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN || undefined, process.env.NODE_ENV));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
