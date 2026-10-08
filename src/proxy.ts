import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/shared/security/session-cookie";

// Runs before every page and API request (spec F01 section 4):
// - request ID for log correlation;
// - Content-Security-Policy with a per-request nonce (static headers are in next.config.ts);
// - optimistic redirect to /login when an app page is requested without a session cookie.
//   The real session check happens in the request context; this only avoids rendering work.
const PUBLIC_PAGES = ["/login", "/forgot-password", "/reset-password", "/invite"];

function isPublic(pathname: string): boolean {
  return (
    pathname.startsWith("/api/") ||
    PUBLIC_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))
  );
}

// Origin of the storage that browsers upload clinical files to and load thumbnails from (ADR-031).
function storageOrigin(): string {
  const endpoint = process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT;
  if (!endpoint) return "";
  try {
    return ` ${new URL(endpoint).origin}`;
  } catch {
    return "";
  }
}

function contentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const storage = storageOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Radix UI positions popovers with inline style attributes, which nonces cannot cover.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${storage}`,
    "font-src 'self'",
    `connect-src 'self'${storage}${process.env.NEXT_PUBLIC_SENTRY_DSN ? " https://*.sentry.io https://*.ingest.sentry.io" : ""}`,
    // The preview modal of F08 frames a PDF through a redirect to a signed storage URL (ADR-033).
    `frame-src 'self'${storage}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));

  if (!isPublic(pathname) && !hasSessionCookie) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set("x-pathname", `${pathname}${search}`);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
