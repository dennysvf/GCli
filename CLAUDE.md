@AGENTS.md

# CLAUDE.md

GCli is a clinic management platform: a modular monolith built with Next.js (App Router), TypeScript, Prisma, and PostgreSQL.

## Sources of truth

- **What to build:** `docs/prd.en.md` (features F01–F15, acceptance criteria in Section 9). The pt-BR version must stay in sync.
- **How to build it:** `docs/architecture.en.md` (modules, layering, ADRs, engineering guidelines). The pt-BR version must stay in sync.
- **How it looks:** `docs/design-system.en.md` ("Ink and Paper": colors, typography, layout, components, copy, accessibility, tokens; ADR-020). The pt-BR version must stay in sync.
- If a task conflicts with any of these documents, stop and ask instead of improvising. Record new architectural decisions as a new ADR in both language versions.

## Non-negotiable rules

- **Modules:** code lives in `src/modules/<module>/`. Import other modules only through their `index.ts`. `domain/` is pure TypeScript (no Prisma, Next.js, or I/O). Routes in `src/app/` call use cases only.
- **Module tiers:** rich modules (`identity`, `scheduling`, `clinical-records`, `billing`, `packages`, `cash`, `privacy`) use domain entities and repository ports. Simple modules use Prisma directly in `application/`. Do not add repositories or entities to simple modules without a reason.
- **Tenancy:** always use `forTenant(organizationId)`. Never import the unscoped Prisma client outside `src/shared/db`.
- **Authorization:** every use case starts with an `authz` check. Hiding UI is not protection.
- **Audit:** every mutation calls `audit.record()` inside the same transaction. Clinical note reads are audited.
- **Errors:** expected failures return `Result<T, DomainError>` with a stable `code`. Errors carry message keys and parameters, never text; the boundary translates them (ADR-028). The pt-BR catalog follows the PRD messages and lives in `src/modules/<module>/messages/`.
- **Money:** use integer minor units plus a currency through `Money`, never floats, and never add across currencies (ADR-029). Store timestamps as UTC `timestamptz`; calendar logic uses the unit time zone (ADR-019) and converts local times with `zonedTimeToUtc` (ADR-030).
- **Languages and countries:** every interface text is a catalog message in `pt-BR`, `en` and `es`, never a literal in JSX. Dates, numbers and money go through the formatters. Documents, phones, addresses and councils follow the country profile (ADR-028, ADR-029).
- **Data:** no hard deletes of referenced records. Invariants that matter under concurrency (double booking, idempotent payments, one cash register per day) are also enforced by database constraints in raw SQL migrations.
- **Interface:** follow the design system for every screen. Use tokens and semantic classes (`bg-primary`, `text-muted-foreground`, `bg-paper-1`), never hard-coded colors (the F03 service palette is the only exception). One primary button per screen, states written as text, tables instead of card grids, WCAG 2.2 AA. Extend the design system document before introducing a new visual pattern.
- **Secrets and personal data:** never commit secrets. Never log personal data (CPF, name, email, phone, clinical content); log IDs.

## Conventions

- Code, identifiers, commits, technical docs, and URL paths (`/settings/users`) are in English. UI text lives in the pt-BR, en and es catalogs (pt-BR is the source).
- Feature specs and plans live in `docs/<feature-id>-<kebab-name>/` (`spec.md`, `plan.md`) and are the input for implementation.
- TypeScript strict; no `any`; no non-null `!` outside tests.
- Use cases are verbs (`CheckInAppointment`); events are past tense (`AppointmentCheckedIn`).
- Business limits go in named constants with a PRD reference, e.g. `// PRD F09: discounts above 20% need approval`.
- Comments explain why, not what.
- Commits follow Conventional Commits with the feature ID: `feat(scheduling): block room conflicts [F06]`.
- Branches: `feat/F06-recurrence`, `fix/...`, `docs/...`. `main` is protected: every change goes through a pull request, and the four CI jobs (quality, integration, E2E, Docker image) must pass before merging. Never push directly to `main`.

## Testing

- Every PRD acceptance criterion maps to at least one test named with its feature ID (`F06: room conflict is always blocked`).
- Domain logic: Vitest unit tests. Data rules, tenancy, authorization, and transactions: integration tests against real PostgreSQL (Testcontainers). Do not mock the database for data rules.
- Critical journeys: Playwright E2E.
- A bug fix starts with a failing test.

## Definition of done

A feature is done when its acceptance criteria are covered by tests, mutations emit audit events, every action checks authorization, UI messages match the PRD, its screens pass the design system checklist (`docs/design-system.en.md`, section 11), lint, typecheck, and all tests pass, and the architecture docs are updated if a decision changed.
