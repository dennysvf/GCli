@AGENTS.md

# CLAUDE.md

GCli is a clinic management platform: a modular monolith built with Next.js (App Router), TypeScript, Prisma, and PostgreSQL.

## Sources of truth

- **What to build:** `docs/prd.en.md` (features F01–F15, acceptance criteria in Section 9). The pt-BR version must stay in sync.
- **How to build it:** `docs/architecture.en.md` (modules, layering, ADRs, engineering guidelines). The pt-BR version must stay in sync.
- If a task conflicts with either document, stop and ask instead of improvising. Record new architectural decisions as a new ADR in both language versions.

## Non-negotiable rules

- **Modules:** code lives in `src/modules/<module>/`. Import other modules only through their `index.ts`. `domain/` is pure TypeScript (no Prisma, Next.js, or I/O). Routes in `src/app/` call use cases only.
- **Module tiers:** rich modules (`identity`, `scheduling`, `clinical-records`, `billing`, `packages`, `cash`, `privacy`) use domain entities and repository ports. Simple modules use Prisma directly in `application/`. Do not add repositories or entities to simple modules without a reason.
- **Tenancy:** always use `forTenant(organizationId)`. Never import the unscoped Prisma client outside `src/shared/db`.
- **Authorization:** every use case starts with an `authz` check. Hiding UI is not protection.
- **Audit:** every mutation calls `audit.record()` inside the same transaction. Clinical note reads are audited.
- **Errors:** expected failures return `Result<T, DomainError>` with a stable `code`. User-facing messages are pt-BR, taken from the PRD, and stored in the module's `messages.ts`.
- **Money:** use integer cents through `Money`, never floats. Store timestamps as UTC `timestamptz`; calendar logic uses the organization time zone.
- **Data:** no hard deletes of referenced records. Invariants that matter under concurrency (double booking, idempotent payments, one cash register per day) are also enforced by database constraints in raw SQL migrations.
- **Secrets and personal data:** never commit secrets. Never log personal data (CPF, name, email, phone, clinical content); log IDs.

## Conventions

- Code, identifiers, commits, technical docs, and URL paths (`/settings/users`) are in English. UI text is in pt-BR.
- Feature specs and plans live in `docs/<feature-id>-<kebab-name>/` (`spec.md`, `plan.md`) and are the input for implementation.
- TypeScript strict; no `any`; no non-null `!` outside tests.
- Use cases are verbs (`CheckInAppointment`); events are past tense (`AppointmentCheckedIn`).
- Business limits go in named constants with a PRD reference, e.g. `// PRD F09: discounts above 20% need approval`.
- Comments explain why, not what.
- Commits follow Conventional Commits with the feature ID: `feat(scheduling): block room conflicts [F06]`.
- Branches: `feat/F06-recurrence`, `fix/...`, `docs/...`.

## Testing

- Every PRD acceptance criterion maps to at least one test named with its feature ID (`F06: room conflict is always blocked`).
- Domain logic: Vitest unit tests. Data rules, tenancy, authorization, and transactions: integration tests against real PostgreSQL (Testcontainers). Do not mock the database for data rules.
- Critical journeys: Playwright E2E.
- A bug fix starts with a failing test.

## Definition of done

A feature is done when its acceptance criteria are covered by tests, mutations emit audit events, every action checks authorization, UI messages match the PRD, lint, typecheck, and all tests pass, and the architecture docs are updated if a decision changed.
