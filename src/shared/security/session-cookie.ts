// Better Auth session cookie names (cookiePrefix "gcli"; "__Secure-" in production). Kept free of
// server dependencies so the proxy can import it.
export const SESSION_COOKIE_NAMES = ["gcli.session_token", "__Secure-gcli.session_token"] as const;
