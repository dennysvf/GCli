# Technical Specification: F01. Platform Foundation, Authentication and Access Control

**Complexity:** complex

## 1. Technical Overview

**What.** F01 bootstraps the GCli codebase and delivers everything the other 14 features depend on implicitly. The codebase part is the Next.js 16 application with the authenticated layout, Prisma 7 on PostgreSQL with organization scoping, a worker process with pg-boss, an object storage adapter, an SMTP email adapter behind a transactional outbox, structured logging, Sentry, CI, and local Docker services. The product part is the `identity` module (organization settings, users, invitations, sign-in with lockout, password reset, sessions), the `audit` recording service, and the `shared/authz` permission matrix for the four fixed roles.

**Why.** Every later feature assumes a request context with an authenticated user and an organization, a tenant-scoped database client, an authorization check, and an audit writer that runs inside the same transaction as the change. Building these once, as shared infrastructure with enforced module boundaries, keeps each later feature focused on its domain rules. It also makes tenant isolation and auditing automatic instead of relying on developer discipline.

**How it connects to the architecture.** This spec implements ADR-001 to ADR-013 of [architecture.en.md](../architecture.en.md) for the parts F01 owns. It refines ADR-004 (Better Auth is used only through its server API; its HTTP handler is not mounted) and adds the English-URL convention. Both refinements are recorded as ADR-014 and ADR-015 in the architecture documents.

### Scope

**Included:**
- Project scaffolding: Next.js 16 App Router, TypeScript strict, Tailwind CSS 4 + shadcn/ui, ESLint with module boundaries, Prettier, lint-staged, Docker Compose (PostgreSQL 18, MinIO, Mailpit), environment validation.
- Shared infrastructure: tenant-scoped Prisma client, transaction helper, `Result`/`DomainError` kernel, UUIDv7 IDs, audit writer, in-process event bus and outbox, pg-boss worker, S3 storage adapter, SMTP email adapter, pino logger with redaction, request ID propagation, security headers and CSP.
- `identity` module: organization settings (including logo), users list, invitations (create, resend, revoke, accept), sign-in with account lockout and rate limiting, sign-out, password reset, session validation with idle and absolute expiry, role change, deactivation and reactivation, last-administrator protection, `setup:admin` command.
- `audit` module (recording side): the append-only `audit_event` table, monthly partitions, and the writer used by all modules. The viewer is F15.
- `shared/authz`: the complete permission matrix from PRD F01 for all modules, the `assertCan` guard, the 403 page, and permission-denied auditing.
- Authenticated layout: sidebar filtered by role, header with user menu and an empty unit-selector slot (populated by F02), placeholder home pages `/schedule` and `/dashboard` (replaced by F06 and F12).
- Operations: `/api/health`, Sentry (web and worker, disabled without DSN), GitHub Actions CI, Dependabot, Playwright and Testcontainers harnesses.

**Integrated from cross-cutting concerns:** tenant isolation (architecture 5.1), authorization (5.2), audit (5.3), domain events and outbox (5.4), background jobs (5.5), files (5.6, logo only), validation and errors (5.7), security (7), observability (9).

**Deferred:**
- The UI for linking a user to a professional profile is delivered by F04, which consumes `identity.listLinkableUsers()`. F01 only reserves the `linkedProfessionalId` field in the request context, and it is always `null` until F04.
- The unit selector contents come from F02. F01 only provides the header slot.
- Audit log viewer (F15). Archival of partitions older than 5 years is not implemented until the first partitions reach that age; the retention job is specified but scheduled for later.

**Input contracts (Consumes):** none. F01 is the root of the dependency graph.

**Output contracts (Provides):**
- `identity.getOrganizationProfile(ctx)`: legal name, trade name, CNPJ, logo URL, time zone, slot granularity. Used by F08 and F13.
- `identity.listLinkableUsers(ctx)`: active users with role PROFESSIONAL, ADMINISTRATOR, or MANAGER, with name, email, role, and active status. Used by F04.
- `audit_event` rows with actor, action, entity type, entity ID, timestamp, IP address, and before/after changes. Read by F15 through the `audit` module's query API.

### Traceability to the PRD

| PRD block (F01) | Where it is specified |
|---|---|
| Provides | Scope → output contracts; Section 5 (public API) |
| Capabilities | Sections 3, 5, 6 (rules and limits) |
| Experience | Section 2 (pages), Section 5 (actions and messages) |
| Error Handling | Section 5 (error codes and pt-BR messages) |
| Acceptance criteria (Section 9, F01) | Section 7, acceptance tests |
| Cross-Feature Integration (F01 as provider) | Section 7, provider-side contract tests |

## 2. Architecture Impact

### Affected components

| Area | Path | Role |
|---|---|---|
| Routes (public) | `src/app/(public)/login`, `forgot-password`, `reset-password`, `invite` | Sign-in and account recovery pages |
| Routes (authenticated) | `src/app/(app)/layout.tsx`, `schedule`, `dashboard`, `settings/organization`, `settings/users` | App shell and F01 screens |
| Route handlers | `src/app/api/health/route.ts`, `src/app/api/organization/logo/route.ts` | Health check and logo delivery |
| Proxy | `src/proxy.ts` | Request ID, CSP nonce, security headers, optimistic auth redirect |
| Identity module | `src/modules/identity/` | Organization, users, invitations, sessions, lockout |
| Audit module | `src/modules/audit/` | Audit writer, partition maintenance |
| Shared | `src/shared/{kernel,db,authz,audit,events,jobs,storage,email,config,logging,ui}` | Cross-cutting infrastructure |
| Worker | `src/worker/` | Outbox dispatcher, email job, maintenance crons |
| Scripts | `src/scripts/setup-admin.ts` | First organization and administrator |
| Database | `prisma/schema.prisma`, `prisma/migrations/`, `docker/postgres/init/` | Schema, roles, grants, partitions |
| Tooling | `docker-compose.yml`, `.github/workflows/ci.yml`, `.github/dependabot.yml`, `eslint.config.mjs`, `playwright.config.ts`, `vitest.config.ts` | Local services, CI, quality gates |

### Request and data flow

```mermaid
graph TD
  B[Browser] --> P["src/proxy.ts (request ID, CSP, redirect)"]
  P --> R["App Router pages and Server Actions"]
  R --> S["getRequestContext()"]
  S --> BA["Better Auth server API (getSession)"]
  R --> UC["identity use cases"]
  UC --> AZ["shared/authz assertCan"]
  UC --> TX["withTransaction (tenant-scoped Prisma)"]
  TX --> DB[(PostgreSQL)]
  TX --> AU["audit.record"]
  TX --> OB["outbox_message"]
  UC --> BA
  W["Worker (src/worker)"] --> OB
  W --> PB["pg-boss queues"]
  PB --> DB
  W --> SMTP["SMTP (Mailpit / provider)"]
  UC --> ST["S3 storage (MinIO / R2)"]
```

### Sign-in sequence

```mermaid
sequenceDiagram
  participant U as Browser
  participant A as signInAction
  participant I as SignIn use case
  participant L as Lockout and rate limit
  participant BA as Better Auth
  participant DB as PostgreSQL
  U->>A: email, password, next
  A->>I: validated input + request metadata
  I->>L: check IP bucket and account lock
  alt locked or rate limited
    I-->>A: AUTH_ACCOUNT_LOCKED / AUTH_RATE_LIMITED
  else allowed
    I->>BA: signInEmail (sets session cookie)
    alt invalid credentials
      I->>DB: increment failures, maybe lock, audit LOGIN_FAILED
      I-->>A: AUTH_INVALID_CREDENTIALS
    else valid
      I->>DB: reset failures, set absoluteExpiresAt, audit LOGIN
      I-->>A: redirectTo by role or safe next
    end
  end
```

## 3. Technical Decisions

| Decision | Chosen Approach | Alternative Considered | Trade-off |
|---|---|---|---|
| Authentication library usage | Better Auth 1.7 (Prisma adapter, email and password, database sessions, `nextCookies` plugin) called **only** through `auth.api.*` from our use cases. The catch-all `/api/auth/[...all]` handler is **not mounted**. | Mount the handler and enforce rules through Better Auth hooks | No public endpoint can bypass lockout, invite-only sign-up, or auditing. We cannot use Better Auth's client SDK, which is acceptable because the UI uses Server Actions. |
| Idle and absolute session expiry | `session.expiresIn = 3600 s`, `session.updateAge = 60 s` (sliding idle window); an additional session field `absoluteExpiresAt = createdAt + 12 h` checked in `getRequestContext()`; `cookieCache` disabled | Custom session table | Keeps Better Auth's session machinery. Every request reads the session from PostgreSQL, which is a trivial load at 30 concurrent users and makes revocation immediate. |
| Password hashing | Argon2id via `@node-rs/argon2` plugged into `emailAndPassword.password.{hash, verify}` with OWASP parameters (19 MiB memory, 2 iterations, parallelism 1); password length 10–128 | Better Auth default (scrypt) | Matches PRD F01. The 128-character cap prevents hashing-cost denial of service. |
| Account lockout | Columns `failedLoginCount` and `lockedUntil` on the user; 5 consecutive failures lock for 15 minutes. Unknown emails are tracked in `rate_limit_bucket` under a hashed email key and produce the same lock message. A dummy Argon2 verify equalizes timing. | Better Auth rate limiter only | Satisfies the PRD lock rule without revealing which emails exist. |
| IP rate limiting | PostgreSQL table `rate_limit_bucket` with fixed windows: sign-in 20 per 15 min per IP; password reset 5 per hour per email and 20 per hour per IP; invitation acceptance 20 per 15 min per IP | Redis | No new infrastructure (architecture section 7). Cleanup runs daily. |
| Invitations | Own `invitation` table storing a SHA-256 hash of a 32-byte random token, valid 72 h. Resending rotates the token hash and expiry on the same row, so the previous link stops working. Acceptance creates the Better Auth user through `auth.api.signUpEmail` and then assigns organization and role in a transaction. | Better Auth organization plugin | The plugin models multi-organization membership, which V1 does not need, and does not cover the fixed roles or 72-hour rule. |
| Incomplete acceptance recovery | New users are created with `status = PENDING_SETUP` and no organization; `getRequestContext()` rejects them. Acceptance is idempotent: a retry with the same valid token finds the existing auth user by email and completes the linkage. | Wrap Better Auth in our transaction | Better Auth writes through its own adapter, outside our transaction. Idempotent completion avoids orphan accounts. |
| Password reset | Better Auth `requestPasswordReset` with `resetPasswordTokenExpiresIn = 3600` and `revokeSessionsOnPasswordReset = true`. The `sendResetPassword` callback builds our own URL `/reset-password?token=...` and writes an outbox message. Our action always returns the same message. | Own reset tokens | Reuses Better Auth's single-use verification tokens. A successful reset also clears the lockout counters. |
| First administrator | `npm run setup:admin -- --org-name --admin-name --admin-email [--cnpj]` creates the organization and an ADMINISTRATOR invitation, sends the email, and prints the link. It refuses to run if any organization already exists. | First-run web wizard | No window in which an anonymous visitor can claim the administrator role. |
| Tenant scoping | `forTenant(organizationId)` Prisma Client extension adds `organizationId` to `where` and `data` for every model in a registry of tenant models. Better Auth tables use the unscoped client inside `identity/infrastructure/auth.ts` only. | PostgreSQL RLS | As per ADR-003. A lint rule restricts the unscoped client. |
| Database roles | Two roles: `gcli_owner` runs migrations; `gcli_app` is used at runtime with DML on all tables, but only `INSERT` and `SELECT` on `audit_event`. Default privileges are set in the first migration. | Single role | Makes the audit log append-only at the database level, as architecture 5.3 requires. |
| Audit table | Hand-edited migration creates `audit_event` partitioned by month on `occurred_at`, with a default partition. A monthly cron (and a worker start-up run) creates the next 3 months of partitions. | Unpartitioned table | Keeps the F15 target (≤ 3 s with 1M rows) and makes the 5-year retention a partition detach. |
| Unknown-email audit events | `LOGIN_FAILED` for an email that does not exist is recorded with `organizationId = NULL` and actor type `ANONYMOUS`. These events are not shown in the organization's audit viewer. | Attribute to the single V1 organization | Correct for the future multi-tenant model; the PRD requirement "every login failure produces an audit record" is still met. |
| Outbox delivery | Outbox rows are written in the business transaction. The worker polls every 5 s with `FOR UPDATE SKIP LOCKED` (batch of 50), enqueues a pg-boss job per message (`singletonKey` = outbox ID, 5 retries with exponential backoff), and marks the row dispatched. After an email is sent, its token-bearing payload is replaced with a redacted version. | Enqueue pg-boss jobs directly inside the Prisma transaction | pg-boss uses its own connection, so direct enqueueing would not be atomic with the business change. |
| Logo handling | Uploaded through a Server Action (limit raised to 3 MB), validated (PNG, JPEG, or SVG, ≤ 2 MB), rasterized with `sharp` to PNG at most 400×160 px, and stored in object storage. Served by `/api/organization/logo` with an ETag. | Direct presigned upload (architecture 5.6) | Rasterizing removes script content from SVGs and gives PDF generation (F08) a uniform format. The file is small, so passing it through the server is acceptable. |
| CNPJ validation | Accept 14 characters: 12 alphanumeric plus 2 numeric check digits, using the Receita Federal algorithm (character value = ASCII code − 48). Stored uppercase without mask. | Numeric-only validation | Alphanumeric CNPJs are issued from July 2026; numeric-only validation would reject valid new companies. |
| URLs | English paths (`/login`, `/settings/users`, `/schedule`). UI text stays pt-BR. | Portuguese paths | Chosen by the user; one naming system for routes and code. Recorded as ADR-015. |
| Unsaved form data on session expiry | Forms opt into a `useFormDraft` hook that stores values in `sessionStorage`. On an `AUTH_UNAUTHENTICATED` result, the client redirects to `/login?next=<path>&reason=expired`. After sign-in the user returns to `next` and the draft is restored. | Server-side drafts | Covers the PRD criterion without new tables. `next` accepts only same-origin relative paths to prevent open redirects. |

### Assumptions

Each item below was decided during this spec, not by the PRD, and can be overridden.
- Node.js 22 LTS or later; npm is the package manager (matches `.claude/launch.json`, which runs `npm run dev -- -p 3001`).
- PostgreSQL 18 locally and in CI. Production must be PostgreSQL 16 or later.
- Emails are globally unique across organizations; a person belongs to exactly one organization in V1.
- An administrator cannot deactivate their own account (`IDENTITY_SELF_DEACTIVATION`). This is not in the PRD; it prevents accidental lock-outs.
- The limit of 100 users counts active users plus pending invitations.
- Time zone options are the Brazilian IANA zones (America/Sao_Paulo, Manaus, Cuiaba, Campo_Grande, Porto_Velho, Boa_Vista, Rio_Branco, Eirunepe, Belem, Santarem, Araguaina, Fortaleza, Recife, Maceio, Bahia, Noronha).
- The client IP is taken from the first `X-Forwarded-For` hop only when `TRUST_PROXY=true`; otherwise it is recorded as null.
- Password strength is shown with `@zxcvbn-ts/core` (feedback only; the enforced rule is length plus a letter plus a digit).
- The redirect after sign-in goes to `/dashboard` for ADMINISTRATOR and MANAGER, and to `/schedule` for FRONT_DESK and PROFESSIONAL. Both pages are placeholders until F12 and F06.
- Email templates are plain HTML with inline styles, in pt-BR, without images.

## 4. Component Overview

### Frontend

| File Path | New/Modified | Purpose | Key Responsibilities |
|---|---|---|---|
| `src/app/layout.tsx` | New | Root layout | `lang="pt-BR"`, fonts, `Toaster`, CSP nonce propagation |
| `src/app/(public)/layout.tsx` | New | Public shell | Centered card layout for auth pages |
| `src/app/(public)/login/page.tsx` + `actions.ts` | New | Sign in | Form, `reason=expired` banner, calls `signInAction` |
| `src/app/(public)/forgot-password/page.tsx` + `actions.ts` | New | Request reset | Always shows the same confirmation message |
| `src/app/(public)/reset-password/page.tsx` + `actions.ts` | New | Set new password | Token from query string, strength meter, confirmation field |
| `src/app/(public)/invite/page.tsx` + `actions.ts` | New | Accept invitation | Read-only name and email, password and confirmation |
| `src/app/(app)/layout.tsx` | New | Authenticated shell | Resolves request context, sidebar by role, header, user menu, unit-selector slot |
| `src/app/(app)/page.tsx` | New | Home | Redirects by role |
| `src/app/(app)/schedule/page.tsx`, `src/app/(app)/dashboard/page.tsx` | New | Placeholders | "Em construção" state until F06 and F12 |
| `src/app/(app)/settings/organization/page.tsx` + `actions.ts` | New | Organization settings | Form with CNPJ mask, time zone, slot granularity, logo upload with preview |
| `src/app/(app)/settings/users/page.tsx` + `actions.ts` | New | User management | Table of users and pending invitations, search, invite dialog, row actions |
| `src/app/forbidden.tsx` | New | 403 page | "Você não tem permissão para acessar esta página" with link home |
| `src/modules/identity/ui/*.tsx` | New | Identity components | `SignInForm`, `PasswordField` (with strength meter), `InviteUserDialog`, `UsersTable`, `OrganizationForm`, `LogoUploader` |
| `src/shared/ui/app-shell/*.tsx` | New | Shell components | `AppSidebar` (items from `navigation.ts` filtered by `can`), `AppHeader`, `UserMenu`, `UnitSelectorSlot` |
| `src/shared/ui/forms/use-form-draft.ts` | New | Draft persistence | Save and restore form values in `sessionStorage` |
| `src/shared/ui/forms/handle-action-result.ts` | New | Result handling | Maps `ActionResult` to toasts, field errors, or expiry redirect |
| `src/shared/ui/components/*` | New | Design system | shadcn/ui: button, input, label, form, table, dialog, dropdown-menu, sidebar, sonner, badge, select, alert |

### Backend

| File Path | New/Modified | Purpose | Key Responsibilities |
|---|---|---|---|
| `src/proxy.ts` | New | Edge of every request | `x-request-id`, CSP nonce and security headers, redirect to `/login?next=` when no session cookie on `(app)` routes |
| `src/shared/config/env.ts` | New | Configuration | Zod schema for all environment variables; process exits on invalid config |
| `src/shared/kernel/result.ts`, `errors.ts`, `ids.ts`, `clock.ts` | New | Kernel | `Result`, `DomainError` with `code` and `httpStatus`, UUIDv7, injectable clock |
| `src/shared/db/client.ts` | New | Prisma | Unscoped client with `@prisma/adapter-pg`; export restricted by lint |
| `src/shared/db/tenant.ts` | New | Tenancy | `forTenant(organizationId)` extension and tenant model registry |
| `src/shared/db/transaction.ts` | New | Unit of work | `withTransaction(ctx, fn)` providing scoped client, `audit`, `events`, `outbox` bound to the transaction |
| `src/shared/context/request-context.ts` | New | Request context | `getRequestContext()`: session, absolute-expiry and status checks, `RequestContext` object |
| `src/shared/authz/permissions.ts` | New | Permission matrix | `Role` × `Action` map for all modules per PRD F01 |
| `src/shared/authz/guard.ts` | New | Guard | `assertCan(ctx, action)`; on denial writes `PERMISSION_DENIED` audit and returns `AUTHZ_FORBIDDEN` |
| `src/shared/audit/audit-writer.ts` | New | Audit writer | `record({ action, entityType, entityId, changes, summary })` inside the transaction; clinical-field masking hook |
| `src/shared/events/event-bus.ts`, `outbox.ts` | New | Events | In-process synchronous handlers; outbox row writer |
| `src/shared/jobs/boss.ts`, `registry.ts` | New | Jobs | pg-boss instance, queue names, job registration |
| `src/shared/storage/object-storage.ts` | New | Storage port and S3 adapter | `putObject`, `getObject`, `headBucket`, presigned URLs (used from F07) |
| `src/shared/email/email-sender.ts`, `smtp-email-sender.ts`, `templates/*` | New | Email | `EmailSender` port, nodemailer adapter, invitation and reset templates |
| `src/shared/logging/logger.ts` | New | Logging | pino with redaction of `cpf`, `email`, `phone`, `name`, `password`, `token`, `content` |
| `src/shared/security/rate-limiter.ts`, `safe-redirect.ts` | New | Security helpers | Fixed-window buckets in PostgreSQL; relative-path validation for `next` |
| `src/modules/identity/infrastructure/auth.ts` | New | Better Auth config | Prisma adapter, Argon2id, session settings, additional fields, UUIDv7 IDs, `nextCookies`, reset email callback |
| `src/modules/identity/domain/*` | New | Identity domain | `Role`, `UserStatus`, `PasswordPolicy`, `LockoutPolicy`, `Cnpj` value object, `InvitationToken` |
| `src/modules/identity/application/*.ts` | New | Use cases | `SignIn`, `SignOut`, `RequestPasswordReset`, `ResetPassword`, `GetInvitation`, `AcceptInvitation`, `InviteUser`, `ResendInvitation`, `RevokeInvitation`, `ChangeUserRole`, `DeactivateUser`, `ReactivateUser`, `ListUsers`, `GetOrganizationProfile`, `UpdateOrganization`, `UploadOrganizationLogo`, `RemoveOrganizationLogo`, `ListLinkableUsers`, `SetupFirstAdministrator` |
| `src/modules/identity/application/schemas.ts` | New | Validation | Zod schemas shared by forms and actions |
| `src/modules/identity/messages.ts` | New | pt-BR messages | All PRD F01 messages keyed by error code |
| `src/modules/identity/index.ts` | New | Public API | `getOrganizationProfile`, `listLinkableUsers`, role and status types |
| `src/modules/audit/application/partition-maintenance.ts` | New | Partitions | Ensure the next 3 monthly partitions exist |
| `src/modules/audit/index.ts` | New | Public API | Query surface for F15 (added in F15), partition job |
| `src/app/api/health/route.ts` | New | Health | Database and storage checks |
| `src/app/api/organization/logo/route.ts` | New | Logo delivery | Session required; streams PNG with ETag and `Cache-Control: private, max-age=300` |
| `src/worker/index.ts`, `outbox-dispatcher.ts`, `jobs/*.ts` | New | Worker | Outbox polling loop, `email.send`, `audit.ensure-partitions` (monthly and at start-up), `identity.cleanup` (daily) |
| `src/scripts/setup-admin.ts` | New | CLI | First organization and administrator invitation |
| `instrumentation.ts`, `sentry.*.config.ts` | New | Observability | Sentry initialization with PII scrubbing; no-op without DSN |

### Database

| Migration File | Tables Affected | Operation | Notes |
|---|---|---|---|
| `docker/postgres/init/01-roles.sql` | — | CREATE ROLE | Local only: `gcli_owner`, `gcli_app`; production roles are created by the operator |
| `prisma/migrations/0001_foundation/migration.sql` | `organization`, `app_user`, `session`, `account`, `verification`, `invitation`, `rate_limit_bucket`, `outbox_message` | CREATE | Generated by Prisma, plus hand-written check constraints, partial unique index, and grants |
| `prisma/migrations/0002_audit_event/migration.sql` | `audit_event` | CREATE (partitioned) | Hand-edited: `PARTITION BY RANGE (occurred_at)`, default partition, first 3 monthly partitions, `INSERT`/`SELECT` only for `gcli_app` |

### Tooling

| File Path | Purpose |
|---|---|
| `docker-compose.yml` | `postgres:18`, `minio` (+ bucket bootstrap), `mailpit` (web UI on port 8025) |
| `.env.example` | Every variable from `env.ts` with local defaults |
| `eslint.config.mjs` | typescript-eslint strict, `eslint-plugin-boundaries` element types (`app`, `module-domain`, `module-application`, `module-infrastructure`, `module-ui`, `module-index`, `shared`), restricted import of `@/shared/db/client` |
| `vitest.config.ts` | Projects `unit` and `integration` (integration uses a global Testcontainers PostgreSQL) |
| `playwright.config.ts` | Web server on port 3001, worker started, Mailpit API used to read emails |
| `.github/workflows/ci.yml` | Install, lint, typecheck, unit, integration, migration drift check, build, E2E |
| `.github/dependabot.yml` | Weekly npm and GitHub Actions updates |
| `package.json` scripts | `dev` (port 3001), `dev:worker`, `build`, `start`, `start:worker`, `lint`, `typecheck`, `format`, `test`, `test:integration`, `test:e2e`, `db:migrate`, `db:deploy`, `db:studio`, `db:reset`, `setup:admin` |

## 5. API Contracts

The UI talks to the server through **Server Actions**. Every action returns the same envelope:

| Field | Type | Description |
|---|---|---|
| `ok` | `boolean` | `true` on success |
| `data` | `object` | Present when `ok = true` |
| `error.code` | `string` | Stable error code (table below) |
| `error.message` | `string` | pt-BR message for display |
| `error.fields` | `Record<string, string>` | Field-level validation messages, when applicable |

The HTTP status column in the error tables is the status used when the same use case is exposed through a Route Handler, and the value logged; Server Actions themselves always complete with 200.

### Shared error codes

| Code | HTTP Status | pt-BR message (from PRD) |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Field-specific messages |
| `AUTH_UNAUTHENTICATED` | 401 | "Sua sessão expirou. Entre novamente para continuar." |
| `AUTH_INVALID_CREDENTIALS` | 401 | "E-mail ou senha inválidos." |
| `AUTH_ACCOUNT_LOCKED` | 423 | "Conta bloqueada temporariamente por excesso de tentativas. Tente novamente em 15 minutos." |
| `AUTH_RATE_LIMITED` | 429 | "Muitas tentativas. Aguarde alguns minutos e tente novamente." |
| `AUTH_LINK_INVALID` | 410 | "Este link expirou ou já foi utilizado. Solicite um novo." |
| `AUTHZ_FORBIDDEN` | 403 | "Você não tem permissão para acessar esta página." |
| `IDENTITY_LAST_ADMIN` | 409 | "É necessário manter pelo menos um administrador ativo." |
| `IDENTITY_SELF_DEACTIVATION` | 409 | "Você não pode desativar o próprio usuário." |
| `IDENTITY_EMAIL_IN_USE` | 409 | "Já existe um usuário com este e-mail." |
| `IDENTITY_INVITATION_PENDING` | 409 | "Já existe um convite pendente para este e-mail." |
| `IDENTITY_INVITATION_NOT_PENDING` | 409 | "Este convite não está mais pendente." |
| `IDENTITY_USER_LIMIT` | 422 | "Limite de 100 usuários atingido." |
| `ORG_INVALID_CNPJ` | 400 | "CNPJ inválido." |
| `ORG_LOGO_INVALID` | 400 | "Envie um logotipo PNG, JPG ou SVG de até 2 MB." |
| `CONFLICT_STALE_VERSION` | 409 | "Estes dados foram alterados por outra pessoa. Recarregue a página e tente novamente." |

### Action: Sign in
- **Action:** `signInAction` in `src/app/(public)/login/actions.ts` → use case `SignIn`
- **Authentication:** public; rate limited per IP

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `email` | `string` | Yes | email, trimmed, lowercased, ≤ 254 | Login email |
| `password` | `string` | Yes | 1–128 chars | Password (policy is not re-checked at sign-in) |
| `next` | `string` | No | same-origin relative path | Destination after sign-in |

```json
{ "email": "ana@clinicaexemplo.com.br", "password": "segredo1234", "next": "/settings/users" }
```

| Field | Type | Description |
|---|---|---|
| `data.redirectTo` | `string` | `next` if valid, otherwise the role home |

```json
{ "ok": true, "data": { "redirectTo": "/settings/users" } }
```

Errors: `VALIDATION_FAILED`, `AUTH_INVALID_CREDENTIALS`, `AUTH_ACCOUNT_LOCKED`, `AUTH_RATE_LIMITED`.

Rules: users with status `INACTIVE` or `PENDING_SETUP` receive `AUTH_INVALID_CREDENTIALS`. The lock check happens before password verification, so a correct password during the lock window still fails. A success resets `failedLoginCount`, sets `lastLoginAt`, sets the session's `absoluteExpiresAt`, and records `LOGIN`. A failure records `LOGIN_FAILED` with the reason (`bad_password`, `locked`, `inactive`, `unknown_email`) in `metadata`.

### Action: Sign out
- **Action:** `signOutAction` (user menu) → use case `SignOut`
- **Authentication:** session

Request: none. Response: redirect to `/login`. Deletes the current session and records `LOGOUT`.

### Action: Request password reset
- **Action:** `requestPasswordResetAction` → use case `RequestPasswordReset`
- **Authentication:** public; rate limited per IP and per email

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `email` | `string` | Yes | email, ≤ 254 | Account email |

```json
{ "email": "ana@clinicaexemplo.com.br" }
```

```json
{ "ok": true, "data": { "message": "Se o e-mail estiver cadastrado, você receberá um link para redefinir sua senha." } }
```

Errors: `VALIDATION_FAILED`, `AUTH_RATE_LIMITED`. The success response is identical whether the email exists or not. For existing active users, an outbox message `email.password-reset` is written and `PASSWORD_RESET_REQUESTED` is audited.

### Action: Reset password
- **Action:** `resetPasswordAction` → use case `ResetPassword`
- **Authentication:** public (token)

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `token` | `string` | Yes | non-empty | From the email link |
| `password` | `string` | Yes | 10–128 chars, ≥ 1 letter, ≥ 1 digit | New password |
| `confirmPassword` | `string` | Yes | equals `password` | Confirmation |

```json
{ "token": "b1c9...e7", "password": "novaSenha2026", "confirmPassword": "novaSenha2026" }
```

```json
{ "ok": true, "data": { "redirectTo": "/login?reset=success" } }
```

Errors: `VALIDATION_FAILED`, `AUTH_LINK_INVALID`. On success all sessions of the user are revoked, lockout counters are cleared, and `PASSWORD_RESET` is audited.

### Query: Get invitation (page loader)
- **Function:** `getInvitation(token)` called by `src/app/(public)/invite/page.tsx`
- **Authentication:** public (token)

```json
{ "ok": true, "data": { "name": "Carlos Souza", "email": "carlos@clinicaexemplo.com.br", "organizationName": "Clínica Exemplo", "role": "FRONT_DESK" } }
```

Errors: `AUTH_LINK_INVALID` (unknown hash, expired, accepted, or revoked). The page then shows the PRD message and a link to `/forgot-password`.

### Action: Accept invitation
- **Action:** `acceptInvitationAction` → use case `AcceptInvitation`
- **Authentication:** public (token); rate limited per IP

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `token` | `string` | Yes | non-empty | From the invitation link |
| `password` | `string` | Yes | password policy | New password |
| `confirmPassword` | `string` | Yes | equals `password` | Confirmation |

```json
{ "ok": true, "data": { "redirectTo": "/schedule" } }
```

Errors: `VALIDATION_FAILED`, `AUTH_LINK_INVALID`, `IDENTITY_EMAIL_IN_USE` (email already belongs to an active user). On success the user is signed in, the invitation becomes `ACCEPTED`, and `CREATE` on `user` is audited with the accepting user as actor.

### Action: Invite user
- **Action:** `inviteUserAction` → use case `InviteUser`
- **Authentication:** session; permission `user:invite` (ADMINISTRATOR)

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `name` | `string` | Yes | 2–150 chars, trimmed | Full name |
| `email` | `string` | Yes | email, lowercased, ≤ 254 | Login email |
| `role` | `string` | Yes | enum `ADMINISTRATOR`, `MANAGER`, `FRONT_DESK`, `PROFESSIONAL` | Fixed role |

```json
{ "name": "Carlos Souza", "email": "carlos@clinicaexemplo.com.br", "role": "FRONT_DESK" }
```

| Field | Type | Description |
|---|---|---|
| `data.invitationId` | `uuid` | Created invitation |
| `data.expiresAt` | `string` (ISO 8601) | Now + 72 h |

```json
{ "ok": true, "data": { "invitationId": "01926f7a-4c1e-7b2a-9d11-5b0c3e8f2a10", "expiresAt": "2026-10-02T14:05:00.000Z" } }
```

Errors: `VALIDATION_FAILED`, `AUTHZ_FORBIDDEN`, `IDENTITY_EMAIL_IN_USE`, `IDENTITY_INVITATION_PENDING`, `IDENTITY_USER_LIMIT`.

### Action: Resend invitation
- **Action:** `resendInvitationAction` → use case `ResendInvitation`
- **Authentication:** session; permission `user:invite`

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `invitationId` | `uuid` | Yes | UUID | Pending invitation |

Response: `{ "ok": true, "data": { "expiresAt": "..." } }`. Rotates the token hash and expiry; the previous link returns `AUTH_LINK_INVALID`. Errors: `AUTHZ_FORBIDDEN`, `IDENTITY_INVITATION_NOT_PENDING`.

### Action: Revoke invitation
- **Action:** `revokeInvitationAction` → use case `RevokeInvitation`
- **Authentication:** session; permission `user:invite`

Request `{ "invitationId": "<uuid>" }`, response `{ "ok": true, "data": {} }`. Errors: `AUTHZ_FORBIDDEN`, `IDENTITY_INVITATION_NOT_PENDING`.

### Action: Change user role
- **Action:** `changeUserRoleAction` → use case `ChangeUserRole`
- **Authentication:** session; permission `user:update-role` (ADMINISTRATOR)

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `userId` | `uuid` | Yes | UUID in organization | Target user |
| `role` | `string` | Yes | role enum | New role |

```json
{ "userId": "01926f7a-...", "role": "MANAGER" }
```

Response `{ "ok": true, "data": { "role": "MANAGER" } }`. Errors: `AUTHZ_FORBIDDEN`, `IDENTITY_LAST_ADMIN`. Demoting runs under a row lock on the organization's active administrators. The target user's sessions are revoked so the new role applies at the next request.

### Action: Deactivate user / Reactivate user
- **Actions:** `deactivateUserAction`, `reactivateUserAction` → use cases `DeactivateUser`, `ReactivateUser`
- **Authentication:** session; permission `user:deactivate` (ADMINISTRATOR)

Request `{ "userId": "<uuid>" }`, response `{ "ok": true, "data": { "status": "INACTIVE" } }` (or `ACTIVE`).

Errors (deactivate): `AUTHZ_FORBIDDEN`, `IDENTITY_LAST_ADMIN`, `IDENTITY_SELF_DEACTIVATION`. Errors (reactivate): `AUTHZ_FORBIDDEN`, `IDENTITY_USER_LIMIT`. Deactivation deletes all sessions of the user in the same transaction, so access ends at the next request (well inside the PRD's 1-minute limit).

### Query: List users (page loader)
- **Function:** `listUsers(ctx, { search?, status?, page })` → use case `ListUsers`
- **Authentication:** session; permission `user:read` (ADMINISTRATOR, MANAGER)

```json
{
  "ok": true,
  "data": {
    "items": [
      { "kind": "user", "id": "01926f7a-...", "name": "Ana Lima", "email": "ana@clinicaexemplo.com.br", "role": "ADMINISTRATOR", "status": "ACTIVE", "linkedProfessional": null, "lastLoginAt": "2026-09-29T11:02:00.000Z" },
      { "kind": "invitation", "id": "01926f7b-...", "name": "Carlos Souza", "email": "carlos@clinicaexemplo.com.br", "role": "FRONT_DESK", "status": "PENDING", "expiresAt": "2026-10-02T14:05:00.000Z" }
    ],
    "page": 1, "pageSize": 50, "total": 2
  }
}
```

Search matches name or email (case- and accent-insensitive, partial). Page size 50.

### Action: Update organization
- **Action:** `updateOrganizationAction` → use case `UpdateOrganization`
- **Authentication:** session; permission `organization:update` (ADMINISTRATOR)

| Field | Type | Required | Validation | Description |
|---|---|---|---|---|
| `legalName` | `string` | Yes | 2–150 chars | Razão social |
| `tradeName` | `string` | No | ≤ 150 chars | Nome fantasia |
| `cnpj` | `string` | No | 14 chars after removing mask; valid check digits (numeric or alphanumeric) | CNPJ |
| `timeZone` | `string` | Yes | one of the Brazilian IANA zones | Organization time zone |
| `slotGranularityMinutes` | `number` | Yes | 5, 10, 15, or 30 | Agenda slot size |
| `version` | `number` | Yes | integer | Optimistic lock |

```json
{ "legalName": "Clínica Exemplo Ltda", "tradeName": "Clínica Exemplo", "cnpj": "12.ABC.345/01DE-35", "timeZone": "America/Sao_Paulo", "slotGranularityMinutes": 15, "version": 3 }
```

```json
{ "ok": true, "data": { "version": 4 } }
```

Errors: `VALIDATION_FAILED`, `AUTHZ_FORBIDDEN`, `ORG_INVALID_CNPJ`, `CONFLICT_STALE_VERSION`. The audit event stores the changed fields with before and after values.

### Action: Upload / remove organization logo
- **Actions:** `uploadOrganizationLogoAction` (multipart `FormData` field `file`), `removeOrganizationLogoAction`
- **Authentication:** session; permission `organization:update`

Validation: declared and sniffed type is PNG, JPEG, or SVG; size ≤ 2 MB. Response `{ "ok": true, "data": { "logoUrl": "/api/organization/logo?v=5" } }`. Errors: `AUTHZ_FORBIDDEN`, `ORG_LOGO_INVALID`.

### Route handler: GET `/api/organization/logo`
- **Authentication:** session (any role)
- **Response:** `200 image/png` with `ETag` and `Cache-Control: private, max-age=300`; `304` on matching `If-None-Match`; `404` when no logo is set.

### Route handler: GET `/api/health`
- **Authentication:** none

```json
{ "status": "ok", "checks": { "database": "ok", "storage": "ok" } }
```

Returns `503` with `"status": "degraded"` and the failing check set to `"error"`. No versions, hostnames, or error details are exposed.

### Public module API (Provides)

| Function | Consumers | Returns |
|---|---|---|
| `identity.getOrganizationProfile(ctx)` | F08, F13 | `{ legalName, tradeName, cnpj, logoUrl, timeZone, slotGranularityMinutes }` |
| `identity.listLinkableUsers(ctx)` | F04 | `[{ id, name, email, role, isActive }]`, active users with role PROFESSIONAL, ADMINISTRATOR, or MANAGER |
| `audit` rows in `audit_event` | F15 | See Section 6 |

### Permission matrix (actions defined by F01)

`shared/authz/permissions.ts` declares every action named in the PRD F01 matrix, grouped by module, so later features only reference them. F01 itself enforces:

| Action | ADMINISTRATOR | MANAGER | FRONT_DESK | PROFESSIONAL |
|---|---|---|---|---|
| `organization:read` | ✓ | ✓ | ✓ | ✓ |
| `organization:update` | ✓ | — | — | — |
| `user:read` | ✓ | ✓ | — | — |
| `user:invite` | ✓ | — | — | — |
| `user:update-role` | ✓ | — | — | — |
| `user:deactivate` | ✓ | — | — | — |
| `audit:read` | ✓ | — | — | — |

Sidebar items carry the action required to see them. Navigating directly to a forbidden page triggers `forbidden()` and records `PERMISSION_DENIED`.

## 6. Data Model

All tables use `uuid` primary keys generated as UUIDv7 by the application. Column names are snake_case; Prisma models map them to camelCase fields. Timestamps are `timestamptz`.

### Table: `organization`

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | — | Primary key |
| `legal_name` | `varchar(150)` | No | — | Razão social |
| `trade_name` | `varchar(150)` | Yes | — | Nome fantasia |
| `cnpj` | `char(14)` | Yes | — | Uppercase, no mask |
| `logo_object_key` | `varchar(255)` | Yes | — | `org/{id}/identity/logo-{uuid}.png` |
| `logo_version` | `integer` | No | `0` | Incremented on change; used as ETag |
| `time_zone` | `varchar(64)` | No | `'America/Sao_Paulo'` | IANA zone |
| `slot_granularity_minutes` | `smallint` | No | `15` | Agenda slot size |
| `version` | `integer` | No | `1` | Optimistic lock |
| `created_at` / `updated_at` | `timestamptz` | No | `now()` | Audit timestamps |
| `updated_by_id` | `uuid` | Yes | — | Last editor |

Constraints: `ck_organization_slot` CHECK (`slot_granularity_minutes IN (5, 10, 15, 30)`); `ck_organization_cnpj` CHECK (`cnpj ~ '^[0-9A-Z]{12}[0-9]{2}$'`).

### Table: `app_user` (Better Auth `user` model)

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | — | Primary key |
| `organization_id` | `uuid` | Yes | — | Null only while `status = 'PENDING_SETUP'` |
| `name` | `varchar(150)` | No | — | Full name |
| `email` | `varchar(254)` | No | — | Lowercased |
| `email_verified` | `boolean` | No | `false` | Set to true on invitation acceptance |
| `image` | `varchar(255)` | Yes | — | Required by Better Auth; unused |
| `role` | `varchar(20)` | Yes | — | `ADMINISTRATOR`, `MANAGER`, `FRONT_DESK`, `PROFESSIONAL` |
| `status` | `varchar(20)` | No | `'PENDING_SETUP'` | `PENDING_SETUP`, `ACTIVE`, `INACTIVE` |
| `failed_login_count` | `smallint` | No | `0` | Consecutive failures |
| `locked_until` | `timestamptz` | Yes | — | Lock end |
| `last_login_at` | `timestamptz` | Yes | — | Shown in the users table |
| `deactivated_at` | `timestamptz` | Yes | — | Set on deactivation |
| `version` | `integer` | No | `1` | Optimistic lock |
| `created_at` / `updated_at` | `timestamptz` | No | `now()` | Timestamps |

Constraints: `uq_app_user_email` UNIQUE (`email`); `fk_app_user_org` FOREIGN KEY (`organization_id`) REFERENCES `organization(id)`; `ck_app_user_role` CHECK (role in the enum or null); `ck_app_user_status` CHECK (status in the enum); `ck_app_user_active_has_org` CHECK (`status = 'PENDING_SETUP' OR (organization_id IS NOT NULL AND role IS NOT NULL)`).

Indexes: `ix_app_user_org_status_role` (`organization_id`, `status`, `role`). User search runs over at most 100 users per organization, so it uses an unindexed case- and accent-insensitive match; no trigram index is needed.

### Table: `session` (Better Auth)

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | — | Primary key |
| `user_id` | `uuid` | No | — | FK `app_user(id)` ON DELETE CASCADE |
| `token` | `varchar(255)` | No | — | Session token (unique) |
| `expires_at` | `timestamptz` | No | — | Sliding idle expiry |
| `absolute_expires_at` | `timestamptz` | No | — | `created_at + 12 h` |
| `ip_address` | `varchar(45)` | Yes | — | Client IP |
| `user_agent` | `varchar(512)` | Yes | — | Truncated user agent |
| `created_at` / `updated_at` | `timestamptz` | No | `now()` | Timestamps |

Indexes: `uq_session_token` UNIQUE (`token`); `ix_session_user` (`user_id`); `ix_session_expires` (`expires_at`) for cleanup.

### Table: `account` and `verification` (Better Auth)

`account` holds the credential (`provider_id = 'credential'`, `password` = Argon2id hash) with Better Auth's standard columns (`account_id`, `provider_id`, `user_id`, `password`, OAuth token columns kept nullable, timestamps); unique (`provider_id`, `account_id`), FK `user_id` ON DELETE CASCADE. `verification` holds password reset tokens (`identifier`, `value`, `expires_at`, timestamps) with an index on `identifier`. Both are generated with the Better Auth CLI and mapped to snake_case.

### Table: `invitation`

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | — | Primary key |
| `organization_id` | `uuid` | No | — | Tenant |
| `email` | `varchar(254)` | No | — | Lowercased |
| `name` | `varchar(150)` | No | — | Full name |
| `role` | `varchar(20)` | No | — | Role granted on acceptance |
| `token_hash` | `char(64)` | No | — | Hex SHA-256 of the token |
| `status` | `varchar(20)` | No | `'PENDING'` | `PENDING`, `ACCEPTED`, `REVOKED` (expiry is derived from `expires_at`) |
| `expires_at` | `timestamptz` | No | — | Created or resent + 72 h |
| `invited_by_id` | `uuid` | Yes | — | Null when created by `setup:admin` |
| `accepted_user_id` | `uuid` | Yes | — | User created on acceptance |
| `accepted_at` / `revoked_at` | `timestamptz` | Yes | — | Lifecycle timestamps |
| `resend_count` | `smallint` | No | `0` | Number of resends |
| `created_at` / `updated_at` | `timestamptz` | No | `now()` | Timestamps |

Indexes and constraints: `uq_invitation_token_hash` UNIQUE (`token_hash`); `uq_invitation_pending_email` UNIQUE (`organization_id`, `email`) WHERE `status = 'PENDING'`; `ix_invitation_org_status` (`organization_id`, `status`); `fk_invitation_org`; `ck_invitation_role`; `ck_invitation_status`.

### Table: `rate_limit_bucket`

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `key` | `varchar(200)` | No | — | Primary key, e.g. `signin:ip:203.0.113.4`, `signin:email:<sha256>`, `reset:email:<sha256>` |
| `count` | `integer` | No | `0` | Attempts in the window |
| `window_started_at` | `timestamptz` | No | `now()` | Window start |
| `blocked_until` | `timestamptz` | Yes | — | Used for unknown-email lockout |

Updated with a single `INSERT ... ON CONFLICT DO UPDATE` statement per attempt. Rows whose window ended more than 24 h ago are deleted by the daily cleanup job.

### Table: `outbox_message`

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | — | Primary key |
| `organization_id` | `uuid` | Yes | — | Tenant, when known |
| `type` | `varchar(80)` | No | — | e.g. `email.invitation`, `email.password-reset` |
| `payload` | `jsonb` | No | — | Redacted after delivery |
| `created_at` | `timestamptz` | No | `now()` | Creation |
| `dispatched_at` | `timestamptz` | Yes | — | Handed to pg-boss |
| `attempts` | `smallint` | No | `0` | Dispatch attempts |
| `last_error` | `varchar(500)` | Yes | — | Last failure, without personal data |

Index: `ix_outbox_pending` (`created_at`) WHERE `dispatched_at IS NULL`.

### Table: `audit_event` (partitioned)

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` | No | — | UUIDv7 |
| `occurred_at` | `timestamptz` | No | `now()` | Partition key |
| `organization_id` | `uuid` | Yes | — | Null only for anonymous unknown-email events |
| `actor_type` | `varchar(12)` | No | — | `USER`, `SYSTEM`, `ANONYMOUS` |
| `actor_user_id` | `uuid` | Yes | — | Acting user |
| `action` | `varchar(40)` | No | — | `CREATE`, `UPDATE`, `DELETE`, `READ_SENSITIVE`, `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `PASSWORD_RESET_REQUESTED`, `PASSWORD_RESET`, `PERMISSION_DENIED`, `EXPORT` |
| `entity_type` | `varchar(40)` | Yes | — | e.g. `organization`, `user`, `invitation` |
| `entity_id` | `uuid` | Yes | — | Affected record |
| `summary` | `varchar(255)` | Yes | — | Short human-readable description without personal data |
| `changes` | `jsonb` | Yes | — | `{ field: { before, after } }`; clinical text replaced by `{ changed: true, beforeLength, afterLength }` |
| `metadata` | `jsonb` | Yes | — | e.g. failure reason, route, permission action |
| `ip_address` | `inet` | Yes | — | Client IP |
| `request_id` | `varchar(64)` | Yes | — | Correlates with logs |

Primary key: (`id`, `occurred_at`). Indexes (created on the parent, inherited by partitions): `ix_audit_org_time` (`organization_id`, `occurred_at` DESC); `ix_audit_entity` (`entity_type`, `entity_id`, `occurred_at` DESC); `ix_audit_actor` (`actor_user_id`, `occurred_at` DESC). Check `ck_audit_org_required`: `organization_id IS NOT NULL OR actor_type = 'ANONYMOUS'`.

### Migration excerpts (hand-written parts)

```sql
-- 0001_foundation: privileges for the runtime role
ALTER DEFAULT PRIVILEGES FOR ROLE gcli_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gcli_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gcli_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gcli_app;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE UNIQUE INDEX uq_invitation_pending_email
  ON invitation (organization_id, email) WHERE status = 'PENDING';

-- 0002_audit_event: partitioned, append-only for the runtime role
CREATE TABLE audit_event (
  id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid,
  actor_type varchar(12) NOT NULL,
  actor_user_id uuid,
  action varchar(40) NOT NULL,
  entity_type varchar(40),
  entity_id uuid,
  summary varchar(255),
  changes jsonb,
  metadata jsonb,
  ip_address inet,
  request_id varchar(64),
  PRIMARY KEY (id, occurred_at),
  CONSTRAINT ck_audit_org_required CHECK (organization_id IS NOT NULL OR actor_type = 'ANONYMOUS')
) PARTITION BY RANGE (occurred_at);

CREATE TABLE audit_event_default PARTITION OF audit_event DEFAULT;
CREATE TABLE audit_event_2026_10 PARTITION OF audit_event
  FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
-- ... following months created by the partition job

CREATE INDEX ix_audit_org_time ON audit_event (organization_id, occurred_at DESC);
CREATE INDEX ix_audit_entity ON audit_event (entity_type, entity_id, occurred_at DESC);
CREATE INDEX ix_audit_actor ON audit_event (actor_user_id, occurred_at DESC);

REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM gcli_app;
GRANT SELECT, INSERT ON audit_event TO gcli_app;
```

The partition job runs as `gcli_owner` through a dedicated connection string (`DATABASE_MIGRATION_URL`), because the runtime role cannot create tables.

### Environment variables

| Variable | Required | Example (local) | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://gcli_app:gcli_app@localhost:5432/gcli` | Runtime role |
| `DATABASE_MIGRATION_URL` | Yes | `postgresql://gcli_owner:gcli_owner@localhost:5432/gcli` | Migrations and partition job |
| `APP_URL` | Yes | `http://localhost:3001` | Links in emails |
| `BETTER_AUTH_SECRET` | Yes | 32+ random characters | Cookie signing |
| `TRUST_PROXY` | No | `false` | Read `X-Forwarded-For` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Yes (user and password optional) | `localhost`, `1025`, `false`, —, —, `GCli <no-reply@gcli.local>` | Mailpit locally |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | Yes | `http://localhost:9000`, `auto`, `gcli-local`, `minio`, `minio12345`, `true` | MinIO locally |
| `SENTRY_DSN` | No | — | Sentry disabled when absent |
| `LOG_LEVEL` | No | `info` | pino level |

## 7. Testing Strategy

Test names start with the PRD feature ID. Integration tests run against PostgreSQL 18 in Testcontainers with both database roles, and against Mailpit and MinIO containers where email or storage is involved.

### Test files

| Test File | Test Type | Target | Coverage Goal |
|---|---|---|---|
| `src/modules/identity/domain/password-policy.test.ts` | Unit | `PasswordPolicy` | 100% |
| `src/modules/identity/domain/lockout-policy.test.ts` | Unit | `LockoutPolicy` | 100% |
| `src/modules/identity/domain/cnpj.test.ts` | Unit | `Cnpj` value object | 100% |
| `src/shared/authz/permissions.test.ts` | Unit | Permission matrix | 100% |
| `src/shared/security/safe-redirect.test.ts` | Unit | `next` validation | 100% |
| `src/shared/context/session-expiry.test.ts` | Unit | Idle and absolute expiry decision | 100% |
| `tests/integration/identity/sign-in.test.ts` | Integration | `SignIn` | All F01 sign-in criteria |
| `tests/integration/identity/password-reset.test.ts` | Integration | `RequestPasswordReset`, `ResetPassword` | Reset criteria |
| `tests/integration/identity/invitations.test.ts` | Integration | Invitation use cases | Invitation criteria |
| `tests/integration/identity/user-management.test.ts` | Integration | Role, deactivate, reactivate, list | Management criteria |
| `tests/integration/identity/organization.test.ts` | Integration | Organization settings and logo | Settings criteria |
| `tests/integration/identity/setup-admin.test.ts` | Integration | `SetupFirstAdministrator` | CLI rules |
| `tests/integration/shared/tenancy.test.ts` | Integration | `forTenant` | Isolation criterion |
| `tests/integration/shared/audit.test.ts` | Integration | Audit writer and privileges | Audit criteria |
| `tests/integration/shared/authorization.test.ts` | Integration | `assertCan`, 403, denial audit | Authorization criteria |
| `tests/integration/worker/outbox.test.ts` | Integration | Outbox dispatcher and `email.send` | Delivery and redaction |
| `tests/e2e/auth.spec.ts` | E2E | Sign-in journeys | Critical journeys |
| `tests/e2e/users-and-roles.spec.ts` | E2E | Invitation and role journeys | Critical journeys |

### Unit tests

| Test Function | Description | Assertions |
|---|---|---|
| `F01: password shorter than 10 characters is rejected` | Policy boundary | 9 chars fails, 10 chars with letter and digit passes |
| `F01: password without a letter or without a digit is rejected` | Composition rule | Both cases fail with field message |
| `F01: password longer than 128 characters is rejected` | DoS cap | Fails |
| `F01: fifth consecutive failure locks for 15 minutes` | Lockout policy | `lockedUntil = now + 15 min` after the 5th failure, not the 4th |
| `F01: lock expires after 15 minutes` | Clock advance | Allowed at `lockedUntil + 1 ms` |
| `F01: numeric CNPJ with valid check digits is accepted` | Legacy format | Valid; wrong digit fails |
| `F01: alphanumeric CNPJ with valid check digits is accepted` | New format | `12ABC34501DE35` valid; altered letter fails |
| `F01: each role maps to the PRD matrix` | Matrix snapshot | Every role and action pair equals the PRD table |
| `F01: next parameter only accepts same-origin relative paths` | Open redirect | `/settings/users` ok; `//evil.com`, `https://evil.com`, `/\evil` rejected |
| `F01: session is invalid after 60 idle minutes or 12 absolute hours` | Expiry decision | Both limits enforced independently |

### Acceptance tests (PRD Section 9, F01)

| Test Function | PRD criterion | Assertions |
|---|---|---|
| `F01: administrator saves settings with valid CNPJ and logo up to 2 MB` | Settings | Row updated, `version` incremented, PNG stored, `UPDATE` audit with before/after |
| `F01: invalid CNPJ is rejected with inline error` | Settings | `ORG_INVALID_CNPJ`, row unchanged |
| `F01: logo above 2 MB or unsupported type is rejected` | Settings | `ORG_LOGO_INVALID`, no object stored |
| `F01: invitation link sets password and signs in` | Invitation | User `ACTIVE` with org and role, session cookie issued, invitation `ACCEPTED` |
| `F01: invitation link fails after 72 hours` | Invitation | Clock + 72 h 1 s → `AUTH_LINK_INVALID` |
| `F01: invitation link fails after first use` | Invitation | Second acceptance → `AUTH_LINK_INVALID` |
| `F01: resending an invitation invalidates the previous link` | Invitation | Old token → `AUTH_LINK_INVALID`, new token works |
| `F01: weak password is rejected on invitation and reset` | Password policy | `VALIDATION_FAILED` with field message |
| `F01: wrong credentials show the generic message for existing and unknown emails` | Sign-in | Same code and message for both |
| `F01: five consecutive failures lock the account even with the correct password` | Lockout | 6th attempt with correct password → `AUTH_ACCOUNT_LOCKED` |
| `F01: unknown email shows the lock message after five failures` | Lockout, no enumeration | Same code as existing account |
| `F01: password reset link expires after 60 minutes` | Reset | Clock + 60 min 1 s → `AUTH_LINK_INVALID` |
| `F01: password reset link cannot be reused` | Reset | Second use → `AUTH_LINK_INVALID` |
| `F01: password reset response is identical for unknown emails` | Reset | Same payload; no outbox row for unknown email |
| `F01: password reset revokes existing sessions` | Reset | Old session token no longer resolves |
| `F01: session ends after 60 minutes of inactivity` | Session | `getRequestContext()` returns unauthenticated after 60 min idle |
| `F01: session ends 12 hours after sign-in even when active` | Session | Activity every 30 min; unauthenticated at 12 h |
| `F01: deactivated user is logged out and cannot sign in again` | Deactivation | Sessions deleted; sign-in → `AUTH_INVALID_CREDENTIALS` |
| `F01: last active administrator cannot be deactivated or demoted` | Last admin | `IDENTITY_LAST_ADMIN` for both actions |
| `F01: concurrent demotion of the last two administrators leaves one` | Last admin under concurrency | Two parallel demotions → exactly one succeeds |
| `F01: every role gets 403 on forbidden actions even when called directly` | Authorization | For each role × F01 action not allowed: `AUTHZ_FORBIDDEN`, no mutation |
| `F01: create, update, delete, login, failure and denial produce audit records` | Audit | Each event has actor, action, entity, timestamp, IP |
| `F01: runtime role cannot update or delete audit records` | Audit immutability | `UPDATE`/`DELETE` as `gcli_app` fails with permission error |
| `F01: queries never return records from another organization` | Tenancy | Two orgs seeded; every F01 query returns only own rows; `create` injects own `organizationId` |
| `F01: user limit blocks the 101st active user or invitation` | Capabilities | `IDENTITY_USER_LIMIT` |
| `F01: setup:admin refuses to run when an organization exists` | CLI | Exit code 1, no rows created |

### Cross-Feature Integration (F01 as provider)

The consumer side of these criteria is tested in F04, F08, F13, and F15. F01 tests the provider contract.

| Test Function | PRD criterion | Assertions |
|---|---|---|
| `F01→F04: listLinkableUsers returns only active users with eligible roles` | Active users available for linking | Inactive, pending-setup, and FRONT_DESK users excluded |
| `F01→F08/F13: getOrganizationProfile returns name, CNPJ, logo URL and time zone` | Organization profile in documents and reports | All fields present; logo URL resolves with a session |
| `F01→F15: audit rows carry before and after values for updates` | Audit events searchable with before/after | `changes` contains changed fields only; indexes exist on org/time and entity |

### Worker tests

| Test Function | Description | Assertions |
|---|---|---|
| `F01: invitation email is delivered through the outbox` | End to end with Mailpit | Email received with the invite URL; outbox row dispatched; payload redacted |
| `F01: outbox row from a rolled-back transaction is never sent` | Atomicity | No row, no email |
| `F01: failed SMTP delivery is retried` | Retry | Job retried; succeeds when SMTP returns |
| `F01: partition job creates the next three months` | Maintenance | Partitions exist; running twice is a no-op |

### E2E journeys (Playwright)

| Test Function | Journey |
|---|---|
| `F01: administrator invites a front desk user who signs in` | Admin signs in → invites → reads email in Mailpit → accepts → lands on `/schedule` |
| `F01: locked account shows lock message` | Five wrong passwords → lock message on the sixth |
| `F01: forgotten password flow` | Request reset → email → new password → sign in |
| `F01: front desk cannot open user settings` | Direct URL `/settings/users` → 403 page; sidebar has no settings item |
| `F01: expired session restores the form draft` | Edit organization form → session expired → sign in → returns with draft restored |
