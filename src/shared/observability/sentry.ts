import type { ErrorEvent } from "@sentry/nextjs";

// Personal data never leaves the process (architecture sections 7 and 9): request bodies,
// cookies, query strings, and user details are removed before an event is sent.
export function scrubEvent<T extends ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.headers) {
      delete event.request.headers.cookie;
      delete event.request.headers.authorization;
    }
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : {};
  return event;
}

export function sentryOptions(dsn: string | undefined, environment: string | undefined) {
  return {
    dsn,
    enabled: !!dsn,
    environment,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  };
}
