import { domainError } from "@/shared/kernel/errors";

// Identity error codes (spec F01 section 5, "Shared error codes").
export const IdentityErrors = {
  invalidCredentials: () => domainError("AUTH_INVALID_CREDENTIALS", 401),
  accountLocked: () => domainError("AUTH_ACCOUNT_LOCKED", 423),
  rateLimited: () => domainError("AUTH_RATE_LIMITED", 429),
  linkInvalid: () => domainError("AUTH_LINK_INVALID", 410),
  lastAdmin: () => domainError("IDENTITY_LAST_ADMIN", 409),
  selfDeactivation: () => domainError("IDENTITY_SELF_DEACTIVATION", 409),
  emailInUse: () => domainError("IDENTITY_EMAIL_IN_USE", 409),
  invitationPending: () => domainError("IDENTITY_INVITATION_PENDING", 409),
  invitationNotPending: () => domainError("IDENTITY_INVITATION_NOT_PENDING", 409),
  userLimit: () => domainError("IDENTITY_USER_LIMIT", 422),
  userNotFound: () => domainError("IDENTITY_USER_NOT_FOUND", 404),
  // The type is the tax ID abbreviation of the country ("CNPJ", "NIF", "RUT"...), the same in every language.
  invalidTaxId: (type: string) =>
    domainError("TAX_ID_INVALID", 400, { taxId: "errors.TAX_ID_INVALID" }, { type }),
  // PRD F09: personal PIN for inline discount approval.
  pinInvalid: () => domainError("APPROVAL_PIN_INVALID", 403),
  pinLocked: () => domainError("APPROVAL_PIN_LOCKED", 429),
  pinWeak: () => domainError("APPROVAL_PIN_WEAK", 400, { pin: "identity.validation.pinWeak" }),
  logoInvalid: () => domainError("ORG_LOGO_INVALID", 400),
} as const;
