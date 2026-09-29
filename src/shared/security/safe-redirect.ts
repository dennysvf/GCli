// Accepts only same-origin relative paths for the `next` parameter (prevents open redirects).
const PROBE_ORIGIN = "http://gcli.invalid";

export function safeRedirectPath(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (/[\u0000-\u001f]/.test(next)) return null;
  try {
    const url = new URL(next, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
