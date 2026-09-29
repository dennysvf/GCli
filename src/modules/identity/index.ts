// Public API of the identity module (spec F01 section 5). Use cases are wired here with their
// infrastructure adapters; callers never import files inside the module.
import { getEnv } from "@/shared/config/env";
import type { RequestContext } from "@/shared/context/types";
import type { IdentityDeps, RequestMeta } from "./application/ports";
import { requestPasswordReset, resetPassword } from "./application/password-reset";
import { resolveRequestContext, signOut } from "./application/session";
import { signIn } from "./application/sign-in";
import { postgresRateLimiter, s3LogoStore, sharpLogoProcessor } from "./infrastructure/adapters";
import { betterAuthGateway } from "./infrastructure/auth";
import { prismaDirectory } from "./infrastructure/directory";

let cachedDeps: IdentityDeps | undefined;

function deps(): IdentityDeps {
  cachedDeps ??= {
    auth: betterAuthGateway,
    directory: prismaDirectory,
    rateLimiter: postgresRateLimiter,
    logos: s3LogoStore,
    logoProcessor: sharpLogoProcessor,
    appUrl: getEnv().APP_URL,
    clock: () => new Date(),
  };
  return cachedDeps;
}

export const identity = {
  signIn: (input: unknown, meta: RequestMeta) => signIn(deps(), input, meta),
  signOut: (ctx: RequestContext, meta: RequestMeta) => signOut(deps(), ctx, meta),
  resolveRequestContext: (meta: RequestMeta) => resolveRequestContext(deps(), meta),
  requestPasswordReset: (input: unknown, meta: RequestMeta) => requestPasswordReset(deps(), input, meta),
  resetPassword: (input: unknown, meta: RequestMeta) => resetPassword(deps(), input, meta),
};

export { homeFor } from "./application/sign-in";
export { identityMessages, PASSWORD_RESET_REQUESTED_MESSAGE } from "./messages";
export type { RequestMeta } from "./application/ports";
export { SESSION_COOKIE_NAMES } from "@/shared/security/session-cookie";
export { ForgotPasswordForm, NewPasswordForm, SignInForm } from "./ui/auth-forms";
