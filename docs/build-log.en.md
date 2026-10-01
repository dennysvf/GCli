# Build log — how GCli was built

This log records, in order, everything done on the project from reading the briefing to implementing the first features (F01, F02 and F03). The goal is for anyone to **understand the decisions** and **repeat the process** on another project.

The work was done as a pair: a product owner and an AI coding assistant. The product owner answered questions, made the business decisions and approved each stage; the assistant ran the interviews, wrote documents and code, ran the tests and recorded what it found along the way.

> **The path in one line:** briefing → interview → PRD → bilingual docs → public repository → architecture and ADRs → F01 technical spec and plan → implementation in 6 stages, with tests and a commit per stage → F02 with branch, PR and CI → F03.

Versão em português: [build-log.pt-BR.md](build-log.pt-BR.md).

---

## Contents

1. [Starting point: the briefing](#1-starting-point-the-briefing)
2. [The PRD: interview before writing](#2-the-prd-interview-before-writing)
3. [Documentation in two languages](#3-documentation-in-two-languages)
4. [Public GitHub repository](#4-public-github-repository)
5. [Architecture before code](#5-architecture-before-code)
6. [F01 technical spec and plan](#6-f01-technical-spec-and-plan)
7. [Implementing F01, stage by stage](#7-implementing-f01-stage-by-stage)
8. [Second feature: F02 — Units and Rooms](#8-second-feature-f02--units-and-rooms)
9. [Third feature: F03 — Service Catalog](#9-third-feature-f03--service-catalog)
10. [Problems found and how they were solved](#10-problems-found-and-how-they-were-solved)
11. [Reproducing the environment from scratch](#11-reproducing-the-environment-from-scratch)
12. [Lessons learned](#12-lessons-learned)

---

## 1. Starting point: the briefing

The project started with a single file: a briefing in Portuguese (now [briefing.pt-BR.md](briefing.pt-BR.md), translated in [briefing.en.md](briefing.en.md)) describing a clinic management platform: patients, scheduling, professionals, services, finance and a management dashboard.

The briefing said **what** the clinic wanted but left key questions open: one clinic or many? How many units? Who may read clinical notes? Does finance include expenses?

**First lesson:** a briefing is not a requirement. Before writing any technical document, intentions have to become decisions.

---

## 2. The PRD: interview before writing

### 2.1 Reading and context

Before the interview, two things were established:

- **The understanding of the product**, summarized in one sentence and confirmed with the product owner.
- **The repository context.** There was only the briefing and an editor configuration file pointing to Next.js on port 3001 and Prisma, which already suggested the stack.

### 2.2 The interview (one question at a time)

Instead of writing the PRD straight from the briefing, a structured interview was held. Each question came with options and a justified recommendation, and only one question was asked at a time, because each answer changes the next ones. The decisions:

| Question | Decision |
|---|---|
| One clinic or many (SaaS)? | One clinic in V1, with a data model **ready for SaaS** (every table has `organizationId`) |
| How many units? | **Multiple units in V1** |
| Which access roles? | **4 fixed roles**: Administrator, Manager, Front Desk, Professional |
| Clinical record depth? | **Free-text note + attachments**, locked 24 hours after creation (addenda only after that) |
| Who books appointments? | **Internal staff only** (no patient portal) |
| Finance scope? | **Payments + expenses**, with a daily cash register per unit |
| Packages and recurrence? | **Both** |
| LGPD and auditing? | **Audit log + basic LGPD** (consent, export and anonymization) |
| Documents? | **Uploads + printable templates** (medical certificate, attendance statement, prescription) |
| Reports? | **Dashboard + CSV and PDF reports** |
| Clinic size? | **Small/medium**: up to 5 units, 50 professionals, 500 appointments/day, 100k patients |

At the end, the interview was summarized in a single paragraph and confirmed before writing.

### 2.3 PRD structure

The PRD ([prd.en.md](prd.en.md) / [prd.pt-BR.md](prd.pt-BR.md)) has exactly 9 sections:

1. Executive summary
2. Problem and opportunity
3. Target audience (personas)
4. Objectives and success metrics, **always with numbers**
5. User stories, grouped by feature
6. Features (F01 to F15), each with capabilities, experience, error handling, and what it **consumes** from and **provides** to other features
7. Out of scope
8. Dependency graph, with priorities, **execution waves** (what can be built in parallel) and a Mermaid diagram
9. Verifiable acceptance criteria, including **cross-feature integration** criteria

Three practices made a difference:

- **Feature IDs (F01…F15)** used end to end: in stories, criteria, commits and test names.
- **"Consumes / Provides"**: each feature declares which data it receives from others and which it delivers. This mechanically produces the dependency graph and the integration tests.
- **A validation checklist before saving**: every feature has stories and criteria and appears in the graph; the graph has no cycles; every declared dependency appears in the diagram.

Some rules were inferred and flagged for review. For example: the charge is created at check-in, and discounts above 20% require manager approval.

---

## 3. Documentation in two languages

Since the project will be open source, the PRD and the briefing were translated into English. The final layout:

```
README.md                  ← the project's front page (not the briefing)
docs/
  briefing.pt-BR.md / .en.md
  prd.pt-BR.md / .en.md
```

**Why separate README and briefing?** The README is the repository's technical front page: what the project is, stack, status, how to run it. The briefing is business context. Mixing them makes both worse.

**A Windows detail:** the file system is case-insensitive, so `README.md` and `Readme.md` cannot coexist. That is why language versions use the `.pt-BR` and `.en` suffixes.

---

## 4. Public GitHub repository

Steps taken:

1. **`.gitignore`** created before the first commit, excluding the local editor configuration folder (`.claude/`), `node_modules`, `.env`, etc.
2. **GitHub CLI installed** (`winget install --id GitHub.cli -e --source winget`).
3. **Browser authentication**: `gh auth login --hostname github.com --git-protocol https --web`. The command shows a one-time code that the person types at `github.com/login/device`.
4. **First commit** on `main`, reviewing with `git status` what would be included (no secrets, no local folders).
5. **Public repository created and pushed**: `gh repo create GCli --public --source=. --remote=origin --push`.

**Problem:** the push failed with `SSL certificate problem: unable to get local issuer certificate`. **Cause:** Git for Windows uses OpenSSL's certificate store, which did not recognize the certificate presented by the network. **Fix:** `git config --global http.sslbackend schannel`, which makes Git use the Windows certificate store. The root cause showed up later (see [section 10](#10-problems-found-and-how-they-were-solved)).

**Protecting `main`.** Once CI was running reliably, `main` was protected with a GitHub ruleset:
- force pushes and branch deletion are blocked;
- every change goes through a pull request (no approval from someone else is required, since the project has a single maintainer);
- the four CI jobs (quality, integration, E2E and Docker image) must pass before merging.

From then on, the flow is: `feat/F02-...` branch → commits → PR → green CI → merge.

---

## 5. Architecture before code

With the PRD done, the question came up: *"should we already think about good practices, patterns, security, performance, SOLID?"*

The answer was to split responsibilities:

| Topic | Where it lives |
|---|---|
| Security, performance and scale **as requirements** (numbers) | PRD |
| Architectural patterns, infrastructure, tenant isolation | Architecture document + ADRs |
| SOLID, clean code, design patterns, testing | Engineering guidelines + `CLAUDE.md` |

The PRD says **what** and **how much**; the architecture says **how**. The document [architecture.en.md](architecture.en.md) / [architecture.pt-BR.md](architecture.pt-BR.md) records:

- **Modular monolith:** one module per business area, with lint-enforced boundaries. Microservices would be overkill at this size.
- **Two module tiers:** "rich" modules (scheduling, billing, clinical records) with a pure domain and repositories, and "simple" modules (registries) that use Prisma directly. No ceremony where there are no rules.
- **Automatic tenant isolation** through a "scoped" Prisma client.
- **Centralized authorization** (role matrix as code) and **auditing in the same transaction** as the change.
- **Domain events + transactional outbox** to decouple modules without losing messages.
- **Queue inside PostgreSQL** (pg-boss), no Redis.
- **Database constraints** against double booking (exclusion constraint).
- **Testing strategy**: unit tests on the domain, integration tests against real PostgreSQL, E2E for critical journeys.
- **Design patterns only where the PRD shows the problem**: State for statuses, Strategy for conflict rules, Outbox, Specification. Also an explicit list of what **not** to use (generic repository over the ORM, DI container, event sourcing).

Each decision became an **ADR** (Architecture Decision Record): decision, why, and trade-off. The rule is never to edit an old ADR; when something changes, a new ADR refines it. There are 19 today.

A `CLAUDE.md` was also added at the root: a summary of the rules in English that the AI assistant reads before generating code, so all new code follows the same conventions.

---

## 6. F01 technical spec and plan

### 6.1 Why start with F01

The PRD's dependency graph shows that F01 (platform foundation, authentication and access control) is the only "foundation feature": every other feature depends on it. In a project with no code, it must come first.

### 6.2 The technical interview

As with the PRD, open questions were resolved one at a time, always with a recommendation. Only what the PRD and the architecture did not answer was asked:

| Decision | Outcome |
|---|---|
| Auth library or own module? | **Better Auth, customized**. Its generic HTTP route is not exposed; everything goes through our use cases |
| How is the first administrator created? | **Terminal command** `npm run setup:admin` (an open web wizard would let the first visitor become administrator) |
| How to send email? | **Generic SMTP + Mailpit** locally |
| What else goes into the foundation? | **CI, E2E tests, Sentry and Dependabot** |
| URL language? | **English** (`/settings/users`); the UI stays in pt-BR |

Before writing, the **current library versions** were checked on npm (`npm view <package> version`). The spec cites real versions, not remembered ones.

### 6.3 The two documents

- [spec.md](F01-platform-foundation-authentication-and-access-control/spec.md): 7 sections (overview, architecture impact, technical decisions, components per file, action contracts with JSON examples, data model with SQL, testing strategy). **Each PRD acceptance criterion became a named test.**
- [plan.md](F01-platform-foundation-authentication-and-access-control/plan.md): 29 steps in 6 stages. The plan says **what** to do; the spec says **how**.

---

## 7. Implementing F01, stage by stage

Implementation followed the plan. Each stage ended with **lint + type checking + tests**, a **real check** (running server, automated browser or database query) and **a commit**. Commits follow Conventional Commits with the feature ID, for example `feat(identity): ... [F01]`.

### Stage 0 — Preparing the environment

- Docker Desktop was started, but its engine did not answer any command even though its logs said it was running. Restarting Docker Desktop fixed it.
- **Read the documentation of the installed version.** Next.js 16 ships a warning ("This is NOT the Next.js you know") and its documentation inside the package (`node_modules/next/dist/docs/`). The guides for `proxy.ts` (formerly `middleware`), CSP with nonces, `forbidden()` and Server Actions were read before writing code. The same was done with the type definitions of Better Auth, pg-boss and Prisma 7.

### Stage 1 — Project structure (commit `88f5e04`)

1. The Next.js skeleton was generated in a **temporary folder** (`npx create-next-app@16 ... --yes`) and only the needed files were copied, because the generator refuses a folder that already has files.
2. **Strict TypeScript** (`strict`, `noUncheckedIndexedAccess`).
3. **ESLint module boundaries**: a module can only be imported through its `index.ts`, `domain/` imports no framework or database, routes do not access the database.
4. **Tailwind CSS 4 + shadcn/ui**, with components in `src/shared/ui`.
5. **Docker Compose** with PostgreSQL 18, S3 storage and Mailpit, plus an SQL script creating **two database users**: `gcli_owner` (migrations) and `gcli_app` (application).
6. **Environment variables validated with Zod** at startup: the app refuses to boot with invalid configuration.
7. **Husky + lint-staged**: every commit goes through ESLint and Prettier.

### Stage 2 — Shared core, database and worker (commit `af1df78`)

1. **Prisma 7 schema** with the F01 tables, snake_case columns, and CHECK constraints instead of native enums.
2. **Migrations generated without a database**: `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`. The SQL was split into two files and received hand-written parts: privileges, a partial unique index, and the **audit table partitioned by month**, where the application only has `INSERT` and `SELECT` (nobody can delete the audit log through the application).
3. **Tenant-scoped client** (`forTenant`): a Prisma extension that injects `organizationId` into every query and create.
4. **Transaction as unit of work**: each use case receives the transaction client, the audit writer and the outbox, all in the same transaction. A failed result rolls everything back.
5. A separate **worker** with pg-boss: outbox delivery, email sending and maintenance jobs.

### Stage 3 — Authentication (commits `03080d8` and `e5deb32`)

1. Pure, tested domain policies: password, lockout, session expiry and **alphanumeric CNPJ** (the new Brazilian company ID format, issued since July 2026).
2. Sign-in with a **15-minute lock after 5 failures**. Unknown emails follow the same rule, so the lock message does not reveal which emails exist, and password verification takes the same time in both cases.
3. **Per-IP rate limiting**, stored in PostgreSQL.
4. **Password reset** through the outbox, with an identical response for registered and unregistered emails.
5. **Proxy** (`src/proxy.ts`) with a request ID, a per-request CSP nonce and redirection to the login page.
6. **Integration tests with Testcontainers**: each run starts PostgreSQL, Mailpit and S3 storage in disposable containers. Time-based tests (15-minute lock, 12-hour session) use a simulated clock.
7. **Browser check** with Playwright: a wrong password shows the PRD message; the right one redirects and sets an `httpOnly` cookie.

### Stage 4 — Authorization and layout (commit `cfcfe33`)

1. The **PRD permission matrix** became code, with a test comparing each role and action with the PRD table.
2. The **authorization guard** records every denial in the audit log (`PERMISSION_DENIED`).
3. **Authenticated layout**: role-filtered sidebar, user menu, 403 page and role-based home redirect.
4. Browser check with two roles: Front Desk only sees "Agenda" and gets 403 on the dashboard; the Administrator sees all four menu items.

### Stage 5 — Users and organization (commit `77d62c9`)

1. **Invitations**: a 32-byte token, and only its SHA-256 hash is stored. The link is valid for 72 hours, and resending invalidates the previous one. Acceptance uses a conditional update (`status = 'PENDING'`) to guarantee single use even with two simultaneous clicks.
2. **Last-administrator protection** with a row lock (`SELECT ... FOR UPDATE`). A test fires two simultaneous demotions and checks that only one succeeds.
3. **Organization settings** with optimistic locking (`version`).
4. **Logo**: the file's real content is checked (not just its extension) and the image is converted to PNG. This also removes any script an SVG might carry.
5. **`npm run setup:admin`**: creates the organization and sends the first administrator's invitation. It refuses to run if an organization already exists.
6. Full check: setup → email in Mailpit → set password → settings → logo → invite another user.

### Stage 6 — Operations and delivery

1. **`/api/health`** checks the database and storage. It was tested by stopping the storage: the route answered `503 degraded` and returned to `ok` once the service came back.
2. **Sentry** in the web app and the worker, disabled when no DSN is set, with personal data removed before sending.
3. **A single Docker image** for web, worker and migrations, with an `app` Compose profile that runs everything in containers (`docker compose --profile app up -d`).
4. **GitHub Actions CI**: lint, types, unit tests, integration, migrations and schema drift check, E2E and image build.
5. **Dependabot** for npm, GitHub Actions and Docker.
6. **E2E tests** with Playwright against a separate database (`gcli_e2e`) and a production build on port 3101, without touching development data.

---

## 8. Second feature: F02 — Units and Rooms

With the foundation in place, F02 was the first business feature. It registers the clinic's units (address, time zone, business hours and closures) and the rooms of each unit, and adds a unit selector to the top of the application. Scheduling (F06), professionals' working hours (F04), documents (F08) and the cash register (F11) depend on this data.

### 8.1 Workflow: branch, PR and CI

This was the first feature built with `main` protected (see [section 4](#4-public-github-repository)):

1. Branch `feat/F02-units-and-rooms` created from an up-to-date `main`.
2. Spec and plan committed first, on a branch pushed to GitHub.
3. One commit per implementation stage, each with lint, types and tests passing.
4. Pull Request #12, with all four CI jobs green, merged into `main` as a single commit (`ffecf7b`).

### 8.2 The technical interview

The script was the same as for F01: only what the PRD and the existing code did not answer was asked, one question at a time, always with a recommendation. The patterns created in F01 (modules, authorization, auditing, transactions, error messages, forms) were reused without discussion.

| Decision | Outcome |
|---|---|
| Time zone | **Per unit**, starting from the organization's zone. A clinic with units in São Paulo and Manaus has different local clocks. Recorded as **ADR-019**, which refines ADR-010 |
| CEP (postal code) lookup | **A route on our own server** (`/api/address/cep/:cep`) that queries BrasilAPI and falls back to ViaCEP, within 3 seconds. It requires sign-in and allows 30 lookups per minute per user. If both fail, the address is typed by hand |
| Unit chosen in the header | **Its own table** (`unit_selection`), so it follows the user across devices |
| Rules that depend on appointments (which only exist in F06) | A **port with a zero default**: F02 asks "how many future appointments does this room have?" and, for now, the answer is always 0. F06 will replace the implementation. The rules, messages and tests already exist |
| Business hours | **One row per interval**, with database CHECKs (minutes from 0 to 1440, multiples of 5) and pure rules that F04 and F06 can reuse |
| A closure over days with appointments | **Two-step confirmation**: the first submission returns the number of appointments; the second, confirmed, saves |
| Duplicate names | **Case-insensitive unique index** in the database (`lower(name)`), plus a check in the code for the friendly message |

The spec and plan are in [F02-units-and-rooms/](F02-units-and-rooms/).

### 8.3 Implementation in 4 stages

| Stage | Commit | What went in |
|---|---|---|
| 1 — Shared foundations | `667d0f6` | CNPJ rules moved to the shared kernel (now used by two modules); error messages with parameters, such as "Esta sala possui **12** agendamentos futuros"; CEP lookup |
| 2 — Database and domain | `80fa920` | Migration `0003_units` with five tables, CHECK constraints and unique indexes; pure business-hours rules; limits as named constants; appointments port with a zero default |
| 3 — Use cases | `66a6703` | Units (up to 20 active), rooms (up to 30 active per unit), business hours, closures and unit selection, all with authorization, auditing and optimistic locking; public API for F04, F06, F08, F11 and F12 |
| 4 — Screens | `ddddf27`, `47153c2` | Units list, unit page with the Dados, Horário de funcionamento, Salas and Fechamentos tabs (read-only for users who cannot change them), header selector, "Unidades" menu item and the E2E journey |

In the end: 22 integration tests against real PostgreSQL, 10 unit tests (business hours and CEP) and a full E2E journey in the browser (create unit → hours → room → closure → selector showing the unit).

### 8.4 Problems found in F02

| Problem | Cause | Fix |
|---|---|---|
| Type error when giving a schema object a default value | In Zod 4, `.default()` on an object with a transform expects the **already transformed** value | `.prefault({})`, which applies the default **before** validation |
| The browser bundle pulled in the whole identity module | The form (browser code) imported the time zone list from the identity module's `index.ts`, which loads server code | The time zone list moved to the shared kernel (`shared/kernel/time-zones.ts`) |
| The shadcn/ui component installer stopped waiting for an answer | While adding tabs, switch and dialogs, it asked whether to overwrite `button.tsx`, which had already been adjusted | Answer "no" automatically (`printf 'n\n' \| npx shadcn add ...`) |
| The E2E test clicked the wrong element | The text "Unidades" appeared in more than one element on the page | The locator was scoped to the sidebar (`[data-sidebar=menu-button]`) |

### 8.5 What F02 left in place

- **Messages with numbers** (`{count}`), already reused by F03.
- **Ports with a zero default** as a way to build a feature before another one it depends on, without faking anything in production.
- **Time zone per unit** as the rule for everything calendar-related.

---

## 9. Third feature: F03 — Service Catalog

F03 registers the clinic's services: name, category, duration, price, agenda color, whether it requires a room, which rooms are allowed, and whether it is active. Professionals (F04), scheduling (F06), charges (F09) and packages (F10) will use this catalog. The workflow was the same as for F02: branch `feat/F03-service-catalog`, spec and plan first (commit `c7ec239`), one commit per stage and a PR at the end.

### 9.1 The technical interview

Five questions, one at a time, each with a recommendation that was accepted:

| Decision | Outcome |
|---|---|
| Categories: their own table or free text? | **Their own table**, with up to 50 categories, a configurable order and deletion only when the category has no services. With free text, "Consulta" and "Consultas" would become two groups |
| Allowed rooms with several units | **Restricted per unit**: in a unit with no rooms selected, any active room works. A global rule would make a restriction in one unit block the service in the others |
| When does a new price apply? | **Immediately**, with no scheduled price changes. Each change stores the previous price, the new price, the date and the author |
| The 16 palette colors | **Stable keys** in the database (`blue`, `emerald`...), with a CHECK; the interface turns the key into colors. Changing the tones needs no migration |
| Delete services? | **No**: only deactivate and reactivate. Names stay unique even among inactive services |

Other decisions came from the project rules, with no need to ask:
- **`Money`**: the project rules require money as integer cents through a `Money` object, which did not exist yet. F03 created it, plus a BRL-masked amount input (`R$ 1.234,56`) that later features will reuse.
- **Default categories through an event**: when a clinic is created, the identity module publishes an "organization created" event, and the services module creates "Consultas", "Procedimentos" and "Terapias" in the same transaction. This way the foundation module does not depend on a business module. For clinics that already existed, the migration itself created the three categories.
- **Composition root** (`src/composition.ts`): a single place wires the events between modules. The web server, the worker, the `setup:admin` command and the tests all call it.

The spec and plan are in [F03-service-catalog/](F03-service-catalog/).

### 9.2 Implementation in 5 stages

| Stage | Commit | What went in |
|---|---|---|
| 1 — Foundations | `2f1167b` | `Money` and the BRL amount input; the "organization created" event; the composition root; room lookup in the units module; user names in the identity module |
| 2 — Database and domain | `e9a5a33` | Migration `0004_services` with four tables, CHECKs for duration, price and color, case-insensitive unique names and a **price history the application can only insert into and read**; pure duration, price and room rules; the palette; zero-default ports for appointments (F06) and enabled professionals (F04) |
| 3 — Use cases | `de4e12a` | Categories (create, rename, reorder, delete when empty) and services (list with filters, create, edit, deactivate), with authorization, auditing and optimistic locking; public API for F04, F06, F09 and F10; 22 integration tests |
| 4 — Screens | `7214d94` | The `/settings/services` page with filters in the URL and a list grouped by category; the side panel with the form, the color picker, rooms by unit, the price confirmation dialog and the "Histórico de preços" tab; the categories dialog; the "Serviços" menu item |
| 5 — Tests | `4fca520` | E2E journey: create a service, change its price with confirmation, see two history entries and deactivate it |

Final check: lint and types clean, 43 unit tests, 100 integration tests and 7 E2E journeys passing.

### 9.3 Problems found in F03

| Problem | Cause | Fix |
|---|---|---|
| The spec relied on a function that did not exist | The spec assumed the identity module already returned a user's name by ID, to show the author of each price change | `getUserNames` was added to the identity module. **Lesson:** what a spec assumes should be checked in the code before implementing |
| The event could be lost in the web server | Next.js may load the same file more than once (startup and routes), and each copy would have its own list of subscriptions | The event bus became one per process (kept in `globalThis`, as was already done for the database client) |
| React Compiler warning in the form | react-hook-form's `form.watch()` cannot be optimized by the compiler | `useWatch()`, the compatible API |
| The E2E test could not find the table rows | The side panel is modal and hides the rest of the page from the accessibility tree, which is what `getByRole` queries | Rows are located with CSS (`locator("tr", { hasText })`) |
| The E2E test found two elements for "Preço" | `getByLabel("Preço")` also matched the "Histórico de **preços**" tab | An exact role query for the field: `getByRole("textbox", { name: "Preço" })` |

### 9.4 What F03 left in place

- **`Money`** and the **BRL amount input**, for charges (F09), packages (F10) and the cash register (F11).
- **Events between modules** with a **composition root**, where F04 and F06 will plug in their port implementations.
- **A history not even the application can change**, enforced by database privileges, as already done for the audit log.

---

## 10. Problems found and how they were solved

This may be the most useful section for anyone reproducing the project. All of these problems showed up because **each stage was actually executed**, not just written.

| Problem | Cause | Fix |
|---|---|---|
| `git push` failed with a certificate error | Antivirus intercepting HTTPS (see last row) | `git config --global http.sslbackend schannel` |
| Docker engine did not respond | Docker Desktop hung after starting | Restart Docker Desktop |
| `eslint-plugin-boundaries` 7 had a new API | The version changed its policy configuration | Core ESLint rule `no-restricted-imports` (ADR-018) |
| **Session would expire while the user was active** | Better Auth only refreshes the cookie inside Server Actions, not during navigation | Fixed 12-hour session + `lastActiveAt` for the 60-minute idle timeout (ADR-016) |
| MinIO images unavailable | MinIO stopped publishing container images | SeaweedFS S3 API locally; R2 in production (ADR-017) |
| Worker would not start with the app database user | pg-boss runs `CREATE SCHEMA`, which the app user may not do | The schema is created by the migration and pg-boss runs with `createSchema: false` |
| **Saving the organization after uploading a logo said "changed by someone else"** | The upload incremented the `version` used for optimistic locking | The logo only uses its own counter (`logoVersion`); regression test added |
| Form fields empty before JavaScript loads | `react-hook-form` fills fields only in the browser | `defaultValue` on inputs so the server-rendered HTML is already filled |
| **Form draft not restored after an expired session** (found by the E2E test) | `form.reset()` does not override inputs whose initial value came from the server-rendered HTML; and the draft stored `null` (a value already transformed by the schema), which validation rejected | Restore field by field with `setValue`, keep nulls out of the draft, and accept `null` in the schema optional fields |
| **Typed text disappeared on slow devices** (found by E2E in CI, which runs on a slower machine) | `react-hook-form` initializes its fields when the page finishes loading and erases anything typed before that | Fields stay disabled until the page loads (`HydratedFieldset`); verified with the browser CPU slowed down 4× |
| The automatic E2E retry failed for a different reason | The journeys share state (an accepted invitation cannot be accepted again) | No E2E retries: a failure shows up as the real failure |
| Image build: `UNABLE_TO_VERIFY_LEAF_SIGNATURE` | **Norton Antivirus** intercepts HTTPS; the container does not trust its certificate | Optional `extra_ca` build secret with the root certificate (never stored in the image) |
| Image build: failed to download the Google font | The Next.js compiler downloads fonts with its own TLS stack | Geist font served locally from the `geist` package (and no requests to Google, good for privacy) |
| `prisma generate` required `DATABASE_MIGRATION_URL` during the build | `prisma.config.ts` always required the variable | URL optional for `generate`, required only for migrations |

---

## 11. Reproducing the environment from scratch

### Prerequisites

- Node.js 22 or later and npm 10 or later
- Docker (Docker Desktop on Windows or macOS)
- Git

### Step by step

```bash
# 1. Code and dependencies
git clone https://github.com/dennysvf/GCli.git
cd GCli
npm install                      # also generates the Prisma client
npx playwright install chromium  # only for E2E tests

# 2. Local configuration
cp .env.example .env
# generate a secret and put it in BETTER_AUTH_SECRET:
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"

# 3. Local services: PostgreSQL 18, SeaweedFS (S3) and Mailpit
docker compose up -d

# 4. Database
npm run db:deploy

# 5. First organization and administrator
npm run setup:admin -- --org-name "My Clinic" --admin-name "Your Name" --admin-email you@example.com

# 6. App and worker (two terminals)
npm run dev          # http://localhost:3001
npm run dev:worker   # sends outbox emails
```

Open **Mailpit** at http://localhost:8025, click the invitation link, set your password, and you are in.

### Tests

```bash
npm run lint && npm run typecheck
npm test                  # unit
npm run test:integration  # real PostgreSQL, Mailpit and S3 in containers (Docker running)
npm run test:e2e          # production build on port 3101 + gcli_e2e database (run docker compose up -d first)
```

### Everything in containers

```bash
docker compose --profile app up -d --build   # web at http://localhost:3000
```

If your network or antivirus intercepts HTTPS (errors such as `UNABLE_TO_VERIFY_LEAF_SIGNATURE`), pass the root certificate to the build:

```bash
EXTRA_CA_CERTS=/path/to/root-certificate.pem docker compose --profile app build
```

---

## 12. Lessons learned

1. **Interview before document.** One question at a time, always with a recommendation, settles more than a long document written in the dark.
2. **End-to-end IDs** (F01 → story → criterion → test → commit) make the project traceable at no extra cost.
3. **"What" and "how" in separate documents.** The PRD does not choose libraries; the architecture does not invent requirements.
4. **Read the documentation of the installed version**, not the one you remember. Next.js 16, Prisma 7 and Better Auth 1.7 changed important APIs.
5. **"I wrote the code" is not "it is done".** Four real bugs (session expiring while active, version conflict after a logo upload, pg-boss permissions, draft not restored) only appeared by actually running the server, the browser and the database.
6. **Test against real infrastructure.** The database is never mocked in data-rule tests: constraints, privileges and concurrency can only be tested there.
7. **Record changes of direction as new ADRs.** The history of decisions tells the project's story better than any summary.
8. **Ports with a zero default unlock the build order.** F02 already has the rules that depend on appointments, with tests, before the agenda exists; when F06 arrives, only the port's implementation changes.
9. **Check in the code what the spec assumes.** The F03 spec relied on a function that did not exist; the gap showed up during implementation, was fixed and was recorded.
