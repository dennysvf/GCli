# Implementation Plan: F01. Platform Foundation, Authentication and Access Control

**Prerequisites:**
- Node.js 22 LTS or later, npm 10 or later, Docker 29 or later (for local services and Testcontainers)
- Libraries (latest stable at scaffold time): Next.js 16.3, React 19.3, TypeScript 5, Prisma 7.10 with `@prisma/adapter-pg`, Better Auth 1.7, pg-boss 12, Zod 4, `@node-rs/argon2` 2, nodemailer, `@aws-sdk/client-s3` with `@aws-sdk/s3-request-presigner`, `sharp`, pino, `uuidv7`, `@zxcvbn-ts/core`, Tailwind CSS 4, shadcn/ui, react-hook-form, `@sentry/nextjs` and `@sentry/node`, Vitest 5, `@testcontainers/postgresql`, `@playwright/test`, ESLint with typescript-eslint and `eslint-plugin-boundaries`, Prettier, lint-staged
- Environment variables: see spec Section 6, "Environment variables" (`.env.example` is created in Stage 1)
- Local services: PostgreSQL 18, MinIO, Mailpit via `docker-compose.yml`
- Reference documents: `docs/prd.en.md` (F01), `docs/architecture.en.md`, `CLAUDE.md`

### Stage 1: Project Scaffolding and Tooling

**1. Next.js application** - Create the Next.js App Router project with TypeScript in strict mode, the `src/` layout, path aliases, and the `dev` script on port 3001 expected by `.claude/launch.json`. Remove the starter content and set the root layout to pt-BR.

**2. Code quality tooling** - Configure ESLint with typescript-eslint strict rules and the module boundary rules from the architecture document, plus the restriction on importing the unscoped database client. Add Prettier, lint-staged with a pre-commit hook, and the `lint`, `typecheck`, and `format` scripts.

**3. Design system base** - Install Tailwind CSS and initialize shadcn/ui with the components listed in the spec, placing them under the shared UI folder.

**4. Local services and configuration** - Add the Docker Compose file with PostgreSQL, MinIO with its bucket bootstrap, and Mailpit, including the local database role initialization script. Create the environment schema that validates every variable at startup, and an `.env.example` with local defaults.

**5. Test runners** - Configure the unit and integration projects of the test runner with a shared PostgreSQL container, and the end-to-end runner that starts the web server and worker. Add the corresponding npm scripts.

### Stage 2: Shared Kernel, Database, and Infrastructure

**6. Shared kernel** - Implement the Result type, the domain error base with stable codes, UUIDv7 identifiers, the injectable clock, and the Server Action result envelope described in spec Section 5.

**7. Database foundation** - Set up Prisma with the PostgreSQL driver adapter and its configuration file, define the F01 models from spec Section 6, and create the first migration including the hand-written extensions, check constraints, partial unique index, and privileges for the runtime role. Add the `db:*` scripts.

**8. Tenant scoping and transactions** - Build the tenant-scoped client extension with its tenant model registry and the transaction helper that exposes the scoped client, the audit writer, the event bus, and the outbox to use cases.

**9. Audit recording** - Create the partitioned audit table through a hand-edited migration, implement the audit writer used inside transactions (including the clinical-field masking hook), and the partition maintenance use case in the audit module.

**10. Logging, request context plumbing, and security helpers** - Implement the redacting logger, request ID propagation, the database-backed rate limiter, and the safe redirect validator.

**11. Storage and email adapters** - Implement the object storage port with the S3 adapter and the email sender port with the SMTP adapter, plus the pt-BR invitation and password reset email templates.

**12. Worker process** - Create the worker entry point with pg-boss, the outbox dispatcher loop, the email delivery job with retries and payload redaction, the monthly audit partition job, and the daily identity cleanup job. Add `dev:worker` and `start:worker` scripts.

### Stage 3: Authentication

**13. Better Auth configuration** - Configure Better Auth in the identity module's infrastructure with the Prisma adapter, Argon2id hashing, sliding session settings, disabled cookie cache, additional user and session fields, UUIDv7 IDs, the Next.js cookies plugin, and the password reset email callback, without mounting its HTTP handler.

**14. Identity domain** - Implement the role and status types, the password policy, the lockout policy, the CNPJ value object supporting numeric and alphanumeric formats, and invitation token generation and hashing.

**15. Request context** - Implement the request context resolver that reads the session, enforces the absolute expiry and user status rules, revokes invalid sessions, and returns the context used by every use case.

**16. Sign-in and sign-out** - Implement the sign-in use case with IP rate limiting, account and unknown-email lockout, timing equalization, auditing, and role-based redirect, and the sign-out use case. Build the login page and its action, including the expired-session banner.

**17. Password reset** - Implement the request and completion use cases with identical responses, session revocation, and lockout reset, and build the forgot-password and reset-password pages with the password strength meter.

**18. Proxy** - Implement the Next.js proxy that sets the request ID, the CSP nonce and security headers, and redirects requests without a session cookie from authenticated routes to the login page with a safe `next` parameter.

### Stage 4: Authorization and Application Shell

**19. Permission matrix and guard** - Encode the complete PRD F01 permission matrix for all modules, implement the authorization guard that records permission-denied audit events, and add the 403 page.

**20. Authenticated layout** - Build the application shell with the role-filtered sidebar, header, user menu with sign-out, the empty unit selector slot for F02, and the role-based home redirect with placeholder schedule and dashboard pages.

**21. Session-expiry form recovery** - Implement the form draft hook and the shared action result handler that shows toasts and field errors and redirects to login with the return path when the session has expired.

### Stage 5: User and Organization Management

**22. Invitations** - Implement the invite, resend, revoke, preview, and accept use cases with the user limit, pending-invitation uniqueness, idempotent acceptance, outbox emails, and auditing. Build the invitation acceptance page and the invite dialog.

**23. User administration** - Implement listing with search and pagination (users and pending invitations together), role change, deactivation with immediate session removal, reactivation, and the last-administrator and self-deactivation protections. Build the users settings screen.

**24. Organization settings** - Implement reading and updating the organization profile with optimistic locking, logo upload with type sniffing and rasterization to PNG, logo removal, and the logo delivery route. Build the organization settings screen.

**25. Public module API** - Expose the organization profile and linkable users functions through the identity module's public entry point for F04, F08, and F13.

**26. First administrator command** - Implement the `setup:admin` command that creates the organization and the administrator invitation, sends the email, prints the link, and refuses to run when an organization already exists.

### Stage 6: Operations and Delivery

**27. Health check and error monitoring** - Add the health route checking the database and storage, and initialize Sentry in the web and worker processes with personal-data scrubbing, disabled when no DSN is configured.

**28. Continuous integration** - Create the GitHub Actions workflow that installs dependencies, runs lint, typecheck, unit and integration suites, checks migration drift, builds the app, and runs the end-to-end suite with the local services. Add the Dependabot configuration for npm and GitHub Actions.

**29. Documentation** - Update the README with local setup, scripts, and the first administrator command, and keep the architecture documents in both languages in sync with ADR-014 and ADR-015.
