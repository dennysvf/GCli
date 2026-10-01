// Public API of the identity module (spec F01 section 5). Use cases are wired here with their
// infrastructure adapters; callers never import files inside the module.
import { getEnv } from "@/shared/config/env";
import type { RequestContext } from "@/shared/context/types";
import {
  acceptInvitation,
  getInvitation,
  inviteUser,
  resendInvitation,
  revokeInvitation,
} from "./application/invitations";
import {
  getOrganizationLogo,
  getOrganizationProfile,
  removeOrganizationLogo,
  setupFirstAdministrator,
  updateOrganization,
  uploadOrganizationLogo,
} from "./application/organization";
import { requestPasswordReset, resetPassword } from "./application/password-reset";
import type { IdentityDeps, ProfessionalLinks, RequestMeta } from "./application/ports";
import { resolveRequestContext, signOut } from "./application/session";
import { signIn } from "./application/sign-in";
import {
  changeUserRole,
  deactivateUser,
  getUserNames,
  listLinkableUsers,
  listUsers,
  reactivateUser,
} from "./application/users";
import { postgresRateLimiter, s3LogoStore, sharpLogoProcessor } from "./infrastructure/adapters";
import { betterAuthGateway } from "./infrastructure/auth";
import { countOrganizations, prismaDirectory } from "./infrastructure/directory";
import { noProfessionalLinks } from "./infrastructure/no-professional-links";

let cachedDeps: IdentityDeps | undefined;
let professionalLinks: ProfessionalLinks = noProfessionalLinks;

function deps(): IdentityDeps {
  cachedDeps ??= {
    auth: betterAuthGateway,
    directory: prismaDirectory,
    rateLimiter: postgresRateLimiter,
    logos: s3LogoStore,
    logoProcessor: sharpLogoProcessor,
    appUrl: getEnv().APP_URL,
    professionalLinks: () => professionalLinks,
    clock: () => new Date(),
  };
  return cachedDeps;
}

export const identity = {
  // Authentication and sessions
  signIn: (input: unknown, meta: RequestMeta) => signIn(deps(), input, meta),
  signOut: (ctx: RequestContext, meta: RequestMeta) => signOut(deps(), ctx, meta),
  resolveRequestContext: (meta: RequestMeta) => resolveRequestContext(deps(), meta),
  requestPasswordReset: (input: unknown, meta: RequestMeta) => requestPasswordReset(deps(), input, meta),
  resetPassword: (input: unknown, meta: RequestMeta) => resetPassword(deps(), input, meta),
  // Invitations
  getInvitation: (token: string) => getInvitation(deps(), token),
  acceptInvitation: (input: unknown, meta: RequestMeta) => acceptInvitation(deps(), input, meta),
  inviteUser: (ctx: RequestContext, input: unknown) => inviteUser(deps(), ctx, input),
  resendInvitation: (ctx: RequestContext, input: unknown) => resendInvitation(deps(), ctx, input),
  revokeInvitation: (ctx: RequestContext, input: unknown) => revokeInvitation(deps(), ctx, input),
  // Users
  listUsers: (ctx: RequestContext, input: unknown) => listUsers(deps(), ctx, input),
  changeUserRole: (ctx: RequestContext, input: unknown) => changeUserRole(deps(), ctx, input),
  deactivateUser: (ctx: RequestContext, input: unknown) => deactivateUser(deps(), ctx, input),
  reactivateUser: (ctx: RequestContext, input: unknown) => reactivateUser(deps(), ctx, input),
  // Organization
  organizationName: (ctx: RequestContext) => deps().directory.findOrganizationName(ctx.organizationId),
  updateOrganization: (ctx: RequestContext, input: unknown) => updateOrganization(deps(), ctx, input),
  uploadOrganizationLogo: (ctx: RequestContext, file: { bytes: Uint8Array; type: string }) =>
    uploadOrganizationLogo(deps(), ctx, file),
  removeOrganizationLogo: (ctx: RequestContext) => removeOrganizationLogo(deps(), ctx),
  getOrganizationLogo: (ctx: RequestContext) => getOrganizationLogo(deps(), ctx),
  setupFirstAdministrator: (input: unknown) => setupFirstAdministrator(deps(), input, countOrganizations),
  // Extension point for professionals (F04); null restores the default (nobody linked).
  registerProfessionalLinks: (implementation: ProfessionalLinks | null) => {
    professionalLinks = implementation ?? noProfessionalLinks;
  },
};

// Provided to other features (PRD F01 Provides): F08 and F13 read the organization profile,
// F04 lists users that can be linked to a professional profile.
export { getOrganizationProfile, getUserNames, listLinkableUsers };
export { IDENTITY_EVENTS } from "./events";
export type { OrganizationProfile } from "./application/organization";
export type { LinkableUser, UserList, UserListItem } from "./application/users";
export type { InvitationPreview } from "./application/invitations";

export { homeFor } from "./application/sign-in";
export { BRAZIL_TIME_ZONES, SLOT_GRANULARITIES } from "./domain/policies";
export { formatCnpj } from "@/shared/kernel/cnpj";
export { identityMessages, PASSWORD_RESET_REQUESTED_MESSAGE } from "./messages";
export type { ProfessionalLinks, RequestMeta } from "./application/ports";
export { isLinkableRole, LINKABLE_ROLES } from "./domain/policies";
export { SESSION_COOKIE_NAMES } from "@/shared/security/session-cookie";
export { ForgotPasswordForm, NewPasswordForm, SignInForm } from "./ui/auth-forms";
export { InviteUserDialog, UsersTable } from "./ui/users";
export { LogoUploader, OrganizationForm } from "./ui/organization";
