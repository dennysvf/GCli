import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { getEnv } from "@/shared/config/env";
import { newId } from "@/shared/kernel/ids";
import type { RequestMeta } from "../application/ports";

// Next.js request helpers: request metadata for use cases and applying Better Auth cookies from
// Server Actions.
export const getRequestMeta = cache(async (): Promise<RequestMeta> => {
  const incoming = await headers();
  const forwarded = getEnv().TRUST_PROXY ? incoming.get("x-forwarded-for") : null;
  return {
    requestId: incoming.get("x-request-id") ?? newId(),
    ipAddress: forwarded?.split(",")[0]?.trim() || null,
    userAgent: incoming.get("user-agent")?.slice(0, 512) ?? null,
    headers: new Headers(incoming),
  };
});

type ParsedCookie = {
  name: string;
  value: string;
  options: {
    path?: string;
    maxAge?: number;
    expires?: Date;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "lax" | "strict" | "none";
  };
};

export function parseSetCookie(header: string): ParsedCookie | null {
  const [pair, ...attributes] = header.split(";").map((part) => part.trim());
  if (!pair) return null;
  const separator = pair.indexOf("=");
  if (separator <= 0) return null;
  const cookie: ParsedCookie = {
    name: pair.slice(0, separator),
    value: decodeURIComponent(pair.slice(separator + 1)),
    options: {},
  };
  for (const attribute of attributes) {
    const [rawKey, ...rest] = attribute.split("=");
    const key = rawKey?.toLowerCase();
    const value = rest.join("=");
    if (key === "path") cookie.options.path = value;
    else if (key === "max-age") cookie.options.maxAge = Number(value);
    else if (key === "expires") cookie.options.expires = new Date(value);
    else if (key === "httponly") cookie.options.httpOnly = true;
    else if (key === "secure") cookie.options.secure = true;
    else if (key === "samesite") cookie.options.sameSite = value.toLowerCase() as "lax" | "strict" | "none";
  }
  return cookie;
}

export async function applySetCookies(setCookies: string[]): Promise<void> {
  const jar = await cookies();
  for (const header of setCookies) {
    const cookie = parseSetCookie(header);
    if (cookie) jar.set(cookie.name, cookie.value, cookie.options);
  }
}
