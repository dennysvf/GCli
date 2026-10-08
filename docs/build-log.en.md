# Build log — how GCli was built

This log records, in order, everything done on the project from reading the briefing to implementing the first features (F01 to F09 and F16). The goal is for anyone to **understand the decisions** and **repeat the process** on another project.

The work was done as a pair: a product owner and an AI coding assistant. The product owner answered questions, made the business decisions and approved each stage; the assistant ran the interviews, wrote documents and code, ran the tests and recorded what it found along the way.

> **The path in one line:** briefing → interview → PRD → bilingual docs → public repository → architecture and ADRs → F01 technical spec and plan → implementation in 6 stages, with tests and a commit per stage → F02 with branch, PR and CI → F03 → design system → F04 → F05 → F06 → F16 (languages and countries) → F07 → separate environments for operations → F08 → F09.

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
10. [Design system before the heaviest screens](#10-design-system-before-the-heaviest-screens)
11. [Fourth feature: F04 — Professionals and Working Hours](#11-fourth-feature-f04--professionals-and-working-hours)
12. [Fifth feature: F05 — Patient Registry](#12-fifth-feature-f05--patient-registry)
13. [Sixth feature: F06 — Scheduling and Agenda](#13-sixth-feature-f06--scheduling-and-agenda)
14. [F16 — Internationalization and Country Profiles](#14-f16--internationalization-and-country-profiles)
15. [Seventh feature: F07 — Clinical Encounter Records](#15-seventh-feature-f07--clinical-encounter-records)
16. [Environments: development and production](#16-environments-development-and-production)
17. [Eighth feature: F08 — Patient Documents](#17-eighth-feature-f08--patient-documents)
18. [Ninth feature: F09 — Billing and Payments](#18-ninth-feature-f09--billing-and-payments)
19. [Problems found and how they were solved](#19-problems-found-and-how-they-were-solved)
20. [Reproducing the environment from scratch](#20-reproducing-the-environment-from-scratch)
21. [Lessons learned](#21-lessons-learned)

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

**Problem:** the push failed with `SSL certificate problem: unable to get local issuer certificate`. **Cause:** Git for Windows uses OpenSSL's certificate store, which did not recognize the certificate presented by the network. **Fix:** `git config --global http.sslbackend schannel`, which makes Git use the Windows certificate store. The root cause showed up later (see [section 13](#13-problems-found-and-how-they-were-solved)).

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

## 10. Design system before the heaviest screens

After F03, and before the agenda (F06), the visual identity was defined. The existing screens were still few and used the default shadcn/ui look; the next ones (agenda, clinical records, cash register, dashboard) are the densest in the system. Changing the visual structure after them would cost far more.

### 10.1 How it was done

1. **A request with a clear role and criteria:** "act as a senior product designer", with the list of what the document must contain (color, typography, layout, components, content, accessibility, tokens, examples) and what to avoid: purposeless gradients, too many cards, glass effects, heavy shadows and rounded corners, decorative icons.
2. **Context taken from the PRD**, not invented: users under time pressure, moderate digital literacy, the front desk on desktops and professionals on tablets or phones, Brazilian conventions.
3. **Contrast computed, not estimated:** every color pair in the document had its contrast ratio computed with the WCAG 2.2 formula before it went in. All of them pass level AA.
4. **Review against the project rules:** the first version had token names in Portuguese (`--papel-0`, `--azul-tinta`). Since the project rule is code in English, the tokens became `--paper-0`, `--ink-blue` and so on; the Portuguese names stayed in the prose only.
5. **Bilingual document** ([design-system.en.md](design-system.en.md) and [design-system.pt-BR.md](design-system.pt-BR.md)), recorded as **ADR-020** and referenced in the README, the architecture (code structure and definition of done) and `CLAUDE.md`.

### 10.2 The identity: "Ink and Paper"

The idea comes from the objects clinics used before software: the patient record card, the appointment book and the cash ledger.

| Element | Rule |
|---|---|
| Paper and ink | Slightly warm paper backgrounds (`#FBFAF7`), dark ink text, ink blue (`#22406E`) as the primary color |
| Red pencil | Terracotta only for "now" on the agenda and for "late" |
| Stamps | States always written (CONFIRMADO, FALTOU, PAGO), never just a color |
| Ledger | Tables with fine rules instead of card grids; a double rule only in page headers and above totals |
| Typography | Source Serif 4 for headings, Source Sans 3 for the interface, self-hosted |
| Restraint | Radii of at most 8 px, a single shadow (only on what floats), no gradients |

The tokens keep the shadcn/ui variable names, so applying the design system means swapping values in `globals.css` and adjusting component variants, without rewriting screens. Every new screen goes through a 6-question checklist (section 11 of the document), which was also added to the definition of done.

### 10.3 Applying it to the code

- **Tokens in `globals.css`** with the shadcn/ui names, plus the Tailwind theme adjusted so the components themselves follow the rules: radii capped at 8 px, small shadows removed, weight 500 rendered as 600 and a 15 px base text.
- **Self-hosted fonts** through the `@fontsource-variable` packages.
- **Components reviewed:** button (36 px, 44 px for touch), fields, table with uppercase headers, underlined tabs, a 560 px side panel, dialogs, a sidebar with an ink-blue bar on the active item and toasts with a colored stripe. The old pill `Badge` became the **stamp** (`Stamp`).
- **Screens:** the page header with the double rule on every page, lists with fine rules and empty states as text.
- **Verification:** screenshots on desktop and at 375 px, which revealed two fixes (the stamp inheriting the serif font and the table widening the page on phones), and the full suite (lint, types, 43 unit, 100 integration, 7 E2E).
- **A lesson about the environment:** with the machine's CPU at 77% (browser, editor and antivirus), E2E tests with a 5-second limit failed intermittently. Running the same suite again with the development processes stopped separated an environment problem from a code problem.

---

## 11. Fourth feature: F04 — Professionals and Working Hours

F04 registers the clinic's professionals: identification, council registration ("CRM 123456/SP"), agenda color, an optional link to a user account, the services each one performs, weekly working hours per unit and time-offs. Scheduling (F06) will use this data to decide who can be booked, where and when; documents (F08) will print the name and registration. The workflow was the same: branch `feat/F04-professionals-and-working-hours`, spec and plan first (commit `17ed233`), one commit per stage and a PR at the end.

One thing changed: the spec was written **in autonomous mode**, without a live interview. The assistant applied its own recommendation to each open question and wrote every one of them down as an explicit assumption in the spec, so the product owner can review and override them.

### 11.1 Decisions made in the spec

| Decision | Outcome |
|---|---|
| How does "a future change of working hours" work? | A **schedule** covers all units and has a start date and an optional end date. Saving a schedule that starts in the future **closes the current one on the day before**. A database exclusion constraint (`btree_gist`) guarantees a professional never has two overlapping schedules, even with simultaneous saves |
| Units in different time zones | Intervals in different units are compared **in real time**, converting each unit's local time with its UTC offset. Recorded as **ADR-021** |
| Linking a user to a professional | The identity module declares a port and the professionals module implements it, so the request context knows the linked professional without a dependency cycle. A link only grants permissions while the user's role allows it and the professional is active |
| What a Professional-role user sees | **Only their own profile**, read-only, plus their own time-offs. A new permission, `professional:read-all`, covers the other roles |
| Agenda color | The **same 16-color palette** as services, shown as a dot before the name, never as a background. The design system gained this rule and the weekly-hours grid pattern |
| CPF | A shared `Cpf` value object and a masked CPF input, which patients (F05) will reuse |

The spec and plan are in [F04-professionals-and-working-hours/](F04-professionals-and-working-hours/).

### 11.2 Implementation in 4 stages

| Stage | Commit | What went in |
|---|---|---|
| 1 — Foundations | `389b9f8` | ADR-021 and the design-system additions in both languages; `Cpf` and the CPF input; the `professional:read-all` permission; the port that fills the linked professional in the request context and the "Profissional vinculado" column on the Users screen |
| 2 — Database and domain | `bed323d` | Migration `0005_professionals` with five tables, the schedule exclusion constraint, council CHECKs and partial unique indexes for CPF and council registration; pure rules for intervals, business hours, cross-unit conflicts, validity and time-offs; the appointments port for F06 |
| 3 — Use cases | `ccdc521` | Profiles, enabled services, schedules and time-offs, with authorization, auditing and optimistic locking; the public API for F06 and F08; 31 integration tests, including concurrent saves |
| 4 — Screens | `8bd6aa2` | The list, the new-professional page and the professional page with the Dados, Serviços, Horários and Ausências tabs; the weekly grid marks intervals outside business hours before saving; two E2E journeys; the port registry (ADR-022) |

Final check: lint and types clean, 62 unit tests, 131 integration tests and 9 E2E journeys passing.

### 11.3 Problems found in F04

| Problem | Cause | Fix |
|---|---|---|
| **The web server never saw the linked professional** (found by the E2E test) | Next.js loads separate copies of a module in one process. The composition root registered the port in one copy, and the routes used another that still had the default | Cross-module ports moved to a registry kept in `globalThis` (`definePort`, **ADR-022**). This also fixed the professionals count on the services list, which had the same flaw since F03 but had never been exercised by a web request |
| The color picker lived inside the services module | A screen from another module that imported the services module's entry point would pull server code into the browser bundle | The palette moved to the shared kernel and the picker to the shared interface components |
| The view and time-off rules could not go in `domain/` | The lint rule keeps `domain/` free of anything outside the shared kernel, including the permission matrix | The policies live in `application/`, with their own unit tests |
| An E2E check looked for "ATIVO" and failed | The stamp is written "Ativo" and CSS turns it into capitals; tests read the text, not the rendering | The test checks the real text |
| Tests failed for reasons unrelated to the code | The machine was overloaded: the test database container did not answer in time, and the production build passed the E2E 10-minute limit | Rerun once the load dropped, with the build run separately first. The failures never reached a test, so they said nothing about the code |

### 11.4 What F04 left in place

- **The public API for the agenda (F06):** bookable professionals per service and unit, the enabled-service check and a working calendar per date, with validity applied and time-offs included.
- **Name and registration for documents (F08).**
- **The linked professional in the request context**, which the clinical-record permissions (F07) depend on.
- **The port registry**, where F06 will register its appointment ports.
- **`Cpf` and the CPF input** for the patient registry (F05).

---

## 12. Fifth feature: F05 — Patient Registry

F05 registers the clinic's patients: identity, contact, address, a guardian for minors, referral source, tags and administrative observations, plus the LGPD consent to the clinic's privacy terms. Scheduling (F06), documents (F08), packages (F10), the dashboard (F12) and the patient timeline (F14) will read this data. The workflow was the same: branch `feat/F05-patient-registry` created before anything else, spec and plan first (commit `b7aad48`), one commit per stage and a PR at the end. As with F04, the spec was written in autonomous mode, with each decision recorded as an explicit assumption.

### 12.1 Decisions made in the spec

| Decision | Outcome |
|---|---|
| Search over 100,000 patients | The application stores the name without accents and in lower case, and both phones as digits. Trigram GIN indexes (`pg_trgm`) answer "contains" searches. The search is raw SQL, so it filters by organization explicitly; one query per kind of term (name, CPF or phone) keeps each one on its own index |
| Duplicates | The same CPF blocks the save, and the message shows an abbreviated name ("Maria S. Oliveira") with a link. The same name and birth date returns the candidates without saving; the user confirms with "Criar mesmo assim" |
| Concurrent edits | The second save gets "Este cadastro foi alterado por João às 14:32", and the form lists the fields that changed |
| Consent | Versioned privacy terms published by the Administrator and consent records per patient. Both are append-only: the database role of the application cannot change or delete them, because they are legal evidence |
| Signed term upload | Through the application server, up to 10 MB, with the type checked by the file's first bytes. The strict CSP does not allow the browser to send files straight to storage. Recorded as **ADR-023** |
| What a Professional sees | Only patients with an appointment with them. Until F06 exists, the list is empty |
| Shared pieces | A `PhoneNumber` value object, and the F02 address schema, address fields and address formatting moved to shared code |

The spec and plan are in [F05-patient-registry/](F05-patient-registry/).

### 12.2 Implementation in 4 stages

| Stage | Commit | What went in |
|---|---|---|
| 1 — Foundations | `2e9e525` | ADR-023 and the design system's global search pattern in both languages; `PhoneNumber` and a phone input; the address schema and fields moved to shared code (F02 and F04 now use them); `head()` in object storage |
| 2 — Database and domain | `0793c85` | Migration `0006_patients` with seven tables, trigram indexes for name and phone, a partial unique CPF index, value CHECKs and append-only grants on terms and consent; pure rules for names, ages, search terms, consent status and CPF masking; the appointments port for F06 |
| 3 — Use cases | `06f3121` | Registration (full and quick), guardian for minors, duplicates, concurrent edits, deactivation, search, lists, terms, consent with upload and audited 5-minute download links, a daily cleanup of unused uploads; the public API; 18 integration tests, including 100,000 patients |
| 4 — Screens | `f14ee37` | The patients page with search and pagination; the global search in the header with the "/" shortcut; the full and quick forms; the patient page with the consent section; the lists and privacy terms settings; two E2E journeys |

Final check: lint and types clean, 71 unit tests, 149 integration tests and 11 E2E journeys passing. With 100,000 patients, `EXPLAIN ANALYZE` showed every search on its index, between 2 and 14 ms.

### 12.3 Problems found in F05

| Problem | Cause | Fix |
|---|---|---|
| Prisma reported the search indexes as schema drift | GIN indexes created only in raw SQL are invisible to the Prisma schema, and CI checks for drift | The indexes are declared in the schema with `type: Gin` and `ops: raw("gin_trgm_ops")` |
| The guardian fields lost their types in the form | A `z.preprocess` that turned an empty guardian section into `null` made the schema's input type `unknown` | The guardian is a normal object, validated with `superRefine` and turned into `null` with `transform` when it is empty |
| The lint rejected the global search component | It called `setState` directly inside an effect to show "Digite pelo menos 3 caracteres" | The empty and too-short states are derived from the text during render; the effect only runs real searches |
| A refactor removed more than intended | Cutting the address schema out of the units module also took a helper still in use | Typecheck caught it before the commit; the helper was restored |

### 12.4 What F05 left in place

- **Patient identity and the complete record** for F06, F08, F10, F12 and F14, with the social name taking precedence.
- **The quick registration form**, ready to embed in the booking modal (F06).
- **LGPD consent with versioned terms**, which the timeline and data export (F14) will read.
- **The appointments port**, which F06 will register to block deactivation, show the last appointment and limit what professionals see.
- **Shared address and phone pieces** for any later form.

---

## 13. Sixth feature: F06 — Scheduling and Agenda

F06 is the center of the product: the front desk books, confirms, checks in, reschedules and cancels appointments; professionals see their own agenda and mark the encounter as started and completed. Clinical notes (F07), charges (F09), packages (F10), the dashboard (F12), reports (F13) and the patient timeline (F14) all start from an appointment. The workflow was the same: branch `feat/F06-scheduling-and-agenda` created before anything else, spec and plan first (commit `694e1b5`), one commit per stage and a PR at the end. This time the spec came from a live interview, with one question at a time and a recommendation for each.

### 13.1 Decisions made in the interview

| Decision | Outcome |
|---|---|
| Scope | Core and Full Scope together: besides booking, lifecycle, rescheduling and the three views, also recurring series, drag-and-drop, the room view and a printable agenda |
| Which statuses occupy the slot | Every status except Cancelado and Faltou: after a no-show the slot can be used by another patient without an Encaixe |
| Reverting Concluído | The PRD did not allow it, but F10 assumes it ("reverting Concluído restores the session"). Decision: the professional may undo within 30 minutes; Manager and Administrator at any time with a justification. The PRD was updated in both languages |
| Editing after booking | Service, duration, room and notes change until check-in; a new service takes a new price snapshot |
| Editing a series | "Este e os seguintes" splits the series: the old one ends, a new one carries the changed sessions, each checked again |
| Cancellation reasons | A configurable list in the scheduling module, with four defaults |
| New libraries | TanStack Query for the 30-second polling (already planned in ADR-011), dnd-kit for drag-and-drop and `@react-pdf/renderer` for the printed agenda, which becomes the shared PDF base for F08, F09 and F13 |

The spec and plan are in [F06-scheduling-and-agenda/](F06-scheduling-and-agenda/). The decisions became **ADR-024** (shared PDF), **ADR-025** (agenda polling and drag-and-drop) and **ADR-026** (conflict model and lifecycle).

### 13.2 How double booking is prevented

The PRD requires that two simultaneous saves for the same slot produce exactly one appointment. The application checks every rule first, so the user gets a precise message ("Dra. Ana já possui atendimento das 14:00 às 14:50. Deseja registrar como encaixe?"). The guarantee, however, comes from PostgreSQL: two **exclusion constraints** reject any overlap of a professional's or a room's time ranges, except for cancelled and no-show appointments and, for the professional only, an Encaixe. A violated constraint becomes "Este horário acabou de ser ocupado por outro agendamento". The integration test fires six bookings at the same time and expects exactly one to succeed.

Each conflict rule (professional, room, working hours, time-off, unit hours, closure, past start, patient) is a small pure function that says whether it blocks, accepts an Encaixe, accepts a justified exception or only warns. The same rules serve saving, the preview in the panel, recurring series and the "Próximo horário livre" search.

### 13.3 Implementation in 5 stages

| Stage | Commit | What went in |
|---|---|---|
| 1 — Documentation and shared base | `f911906` | PRD update, ADR-024 to ADR-026 and the design system's agenda patterns in both languages; `DateTimeRange` and the time zone helpers in the shared kernel; error details in the action envelope; the shared PDF base and the TanStack Query provider |
| 2 — Database and domain | `70139dd` | Migration `0007_scheduling` with five tables, the two exclusion constraints, CHECKs and append-only history; the appointment as a domain entity with its state machine, the conflict rules, recurrence and availability search, with unit tests |
| 3 — Use cases | `4eeb3b3` | Booking, editing, rescheduling, status changes, cancellation (also by series), series, agenda reads with the polling feed, PDF export; the real implementations of the appointment ports of F02 to F05; 34 integration tests |
| 4 — Screens | `5e88091` | The agenda with Day, Week and List views, the booking panel (with quick patient registration), the appointment panel, drag-and-drop and keyboard moves, "Próximo horário livre"; four E2E journeys |
| 5 — Integrations | `4a63754` | The printable agenda, the Agendamentos tab on the patient page and the cancellation reasons settings |

Final check: lint and types clean, 103 unit tests, 184 integration tests and 15 E2E journeys passing.

### 13.4 Problems found in F06

| Problem | Cause | Fix |
|---|---|---|
| The production build failed after the booking panel was added | A Client Component imported the patients module's public entry point, which also wires the database and Argon2, so server code went to the browser bundle | Each module may expose a client entry point with only client-safe UI (`@/modules/patients/client`), allowed by the lint rule. Recorded as **ADR-027** |
| The worker and the setup script stopped starting | `tsx` could not resolve `@react-pdf`'s package exports through a static import | The PDF document is loaded on demand, only when a PDF is rendered |
| Every E2E journey failed after the first one | The first journey waits 30 s for the invitation email, and the worker (started by the E2E setup) took about 27 s to boot on this machine | The E2E setup waits for the worker's startup job before the journeys begin |
| Keyboard dragging did nothing | The dnd-kit keyboard sensor scrolls the page instead of moving the block when the page can scroll | The agenda grid handles the keyboard itself: Space picks up, arrows move, Space drops, Esc cancels, each step announced (ADR-025 updated) |
| Two E2E journeys "failed" on correct behavior | The test assumed the professional worked until 18:00; the F04 journey had set 08:00–12:00, and one session fell on her vacation | The journeys book inside her hours and skip the conflicting session, which also covers the series criterion |
| Turbopack crashed on the second build | A cache left by an interrupted build | Delete `.next` and build again |

### 13.5 What F06 left in place

- **Appointments with status history, reschedule history and price snapshot**, read by F07, F09, F10, F12, F13 and F14.
- **Domain events published inside the transaction**: check-in (for the F09 charge), completion and its reversal (for the F10 package debit), cancellation and the others.
- **The real appointment ports** for units, services, professionals and patients: closures, deactivations and time-offs now count real appointments, and professionals see the patients they attend.
- **The shared PDF base** for documents (F08), receipts (F09) and reports (F13).
- **Client entry points** for modules whose UI is reused by other modules.

---

## 14. F16 — Internationalization and Country Profiles

Before moving on to clinical records and billing, the product gained a new feature in the PRD: **F16**. The interface now exists in Brazilian Portuguese, English and Spanish, and each unit follows its country's conventions (currency, identity documents, phone, address, professional councils and time zones) for Brazil, Portugal, Spain, Mexico, Argentina, Chile, Colombia and the United States. Legal rules are still validated only for Brazil. It came **before** F07 on purpose: extracting text and adding a currency to every amount is cheap with six features done, and would mean migrating financial records after F09.

### 14.1 Decisions made in the interview

| Decision | Result |
|---|---|
| Library | next-intl, with no language prefix in URLs: the language is `user.locale ?? organization.defaultLocale` and travels in `RequestContext` |
| Where text lives | One catalog per module and language (`src/modules/<module>/messages/{pt-BR,en,es}.json`) plus shared catalogs (`common`, `validation`, `shell`, `countries`, `email`) |
| Use cases without text | Errors and validations carry message **keys** and parameters; the boundary (Server Action, route, worker, PDF) translates them |
| Money | Integer `amount_minor` + `currency` on every amount column; `Money` refuses to add different currencies and totals are grouped by currency |
| Countries | A typed registry per country in `src/shared/kernel/countries/` (documents, tax ID, phone, address, councils, payment methods, time zones) |
| Daylight saving time | Every local time to instant conversion goes through `zonedTimeToUtc`, tested on real 2026 and 2027 transitions |
| Translations | Produced with the extraction, following a glossary in the design system; en and es were reviewed and accepted by the product owner |

The decisions became **ADR-028** (catalogs with next-intl), **ADR-029** (country profiles and money with currency) and **ADR-030** (DST-correct calendar, superseding ADR-021). The spec and plan are in [F16-internationalization-and-country-profiles/](F16-internationalization-and-country-profiles/).

### 14.2 Implementation

| Stage | Commit | What went in |
|---|---|---|
| PRD and spec | `5276be5`, `f480feb` | F16 in the PRD in both languages; spec and plan |
| 1 — Language core | `a89d228` | ADRs 028–030, locale resolution, server translator, formatters, translated shell and language switcher |
| 2 — Country kernel | `c9ad64d` | Profiles of the eight countries, documents, phones (libphonenumber-js), generic addresses, `Money` and time zone conversions |
| 3 — Data model | `fe8f9be` | Migration `0008_internationalization`: country and currency per unit, `service_price` per currency, `professional_registration` per country, generic documents and phones |
| 4 — Everything translated | `12d9f9a` | Every screen, email and the agenda PDF in three languages; a lint rule that refuses literal text in JSX; a test that fails when a key, an ICU message or a placeholder differs between languages |
| Fixes | `6f66ec7`, `c3e2638` | Test of the agenda PDF language; indexes declared in the Prisma schema so `migrate dev` does not try to drop them |

It was the largest change so far (345 files), because it touched every existing screen. Next, the **demo data** (`npm run seed:demo`, PR #19) was updated to the new model: services priced per currency, professionals with council registrations, patients and a week of appointments, with two sample users.

### 14.3 What F16 left in place

- **Catalogs per module** and the rule that no interface text is a literal in code: every new feature is born in three languages.
- **Country profiles** used in forms and, later, in documents (F08), receipts (F09) and reports (F13).
- **Money with currency** before any charge exists.

---

## 15. Seventh feature: F07 — Clinical Encounter Records

F07 is the clinical record: the professional writes the note of each encounter, attaches exams and photos, reads the patient's history and, after 24 hours, can only complement it with addenda. It is the most sensitive data in the product, so the spec started from what the database must guarantee even if the application has a bug.

### 15.1 Decisions made in the interview

| Decision | Result |
|---|---|
| Attachment upload | Straight from the browser to the bucket through a presigned URL with signed type and size; the server confirms by reading the file's first bytes (**ADR-031**) |
| Text format | Tiptap editor and HTML sanitized on the server against a short allowlist of tags (**ADR-032**) |
| When the 24-hour clock starts | When the draft is created, at the first save with text |
| Draft never finalized | Finalized automatically when the 24 hours end and marked "Finalizado automaticamente" (PRD updated) |
| Editing a finalized note | An edit draft that only the author sees; "Salvar alterações" keeps the previous content as a version |
| Clinical alerts | One field per patient ("Alergia a dipirona"), with history, shown only on clinical screens |
| Browser copy | Only when a save fails, removed on sign-out |
| Attachments | Only while the note is editable; anything arriving later goes to the patient's documents (F08) |

### 15.2 What the database guarantees

- **24-hour lock:** a trigger refuses any content change after `locks_at`.
- **One note per appointment:** a partial unique index.
- **Append-only history:** versions, addenda and the alert history have no `UPDATE` or `DELETE` for the application role, and no clinical table has `DELETE`.

Every note read is audited, and every unauthorized attempt returns 403 and a permission-denied event.

### 15.3 Implementation in 5 stages

| Stage | Commit | What went in |
|---|---|---|
| 1 — Documentation and foundations | `dfc67a5` | PRD, ADR-031 and ADR-032, design system patterns; storage range reads, public storage URL and CSP |
| 2 — Database and domain | `52be141` | Migration `0009_clinical_records` with seven tables, the lock trigger and grants; the note lifecycle as a domain entity |
| 3 — Use cases and jobs | `83af942` | Drafts, finalization, editing, addenda, attachments, alerts; HEIC conversion, auto-finalization and upload cleanup in the worker |
| 4 — Screens | `a987efa` | Split-screen record, editor with autosave and local copy, attachments with progress and thumbnails |
| 5 — Integrations | `d2085bf` | Clinical record tab on the patient page, "Abrir prontuário" and the reminder in the agenda, E2E journeys |
| CI fixes | `d0f3739` | See 15.4 |

After the merge (PR #20), a second PR (#21) added the script that applies the CORS rule to the bucket (`npm run setup:storage-cors`) and the HEIC conversion test with a real photo.

### 15.4 Problems found in F07

| Problem | Cause | Solution |
|---|---|---|
| The presigned upload returned `400 BadDigest` | The AWS SDK computes a checksum by default, and the signed checksum did not match the file the browser sent | `requestChecksumCalculation: "WHEN_REQUIRED"` on the S3 client |
| Text typed right after clicking Bold disappeared (CI only) | Clicking the button took the focus away from the editor | Toolbar buttons keep the focus (`preventDefault` on `mousedown`), and the test waits for the focused editor |
| The concurrent booking test failed in CI | With six simultaneous bookings, PostgreSQL sometimes resolves the conflict with a deadlock instead of the constraint violation | Deadlocks and serialization errors also become "Este horário acabou de ser ocupado" |
| The local copy of the draft stayed after the note was created | It was stored under the "new" draft key, and only the note's key was cleared | Clear both keys when the save is confirmed |
| The PR was merged before the last commit | The commit was pushed after the merge and ended up outside `main` | A new branch from `main` with the commit and a separate PR (#21) |

### 15.5 What F07 left in place

- **Clinical notes, versions, addenda and attachments** read by the timeline and the LGPD export (F14).
- **Direct uploads to the bucket** confirmed by the bytes, reused by documents (F08).
- **The clinical access rule** (`canAccessPatientRecords`), which F08 uses for clinical categories.

---

## 16. Environments: development and production

Planning how the CORS rule will be applied to R2 once production exists exposed a risk: the operational scripts always read `.env`, which points to the local environment. The split is ready before the first deploy (which has not happened yet):

- **`.env`**: local development, unchanged.
- **Production**: the app and the worker get their variables from the hosting provider's secrets; no `.env*` file goes into the Docker image.
- **`.env.prod`** (template in `.env.prod.example`, ignored by git): only for running `npm run setup:storage-cors:prod` and `npm run setup:admin:prod` from your machine. The scripts print the target (database host, bucket, URL), without credentials, before writing.

The name is not `.env.production` on purpose: Next.js loads that file in every `next build`, and a local build would silently use the production database and bucket.

---

## 17. Eighth feature: F08 — Patient Documents

F08 stores the patient's files (exams, ID copies, signed terms) and issues documents from templates (medical certificate, attendance declaration, prescription). Like F07 it handles health data, so the spec started from what the database must guarantee and from what the front desk may or may not see.

### 17.1 Decisions made in the interview

| Decision | Result |
|---|---|
| Scope | Core and Full together: upload, categories, quota, archiving, templates and PDF |
| 50 GB quota | Counts only F08 files (uploaded and generated) and blocks only uploads; generated PDFs are counted but never blocked |
| Clinical categories | Exame and Laudo externo are clinical by default; the front desk can upload to them but cannot see the file afterwards |
| Clinical flag | Can be turned on but never off, and a database trigger guarantees it |
| Corrections | Managers and administrators restore archived documents; the uploader, or a manager, corrects title and category; an issued document does not change |
| 80% alert | A notice in the upload dialog, the usage in the settings and an email to the administrators each time usage crosses 80% |
| Who signs | In a clinical template, only the user's own professional; in a plain template, any active professional |

The decisions became **ADR-033** (code shared by F07 and F08, a quota counter under lock and `frame-src` for the preview) and a new design system section (5.13). The spec and plan are in [F08-patient-documents/](F08-patient-documents/).

### 17.2 What the database guarantees

- **A quota without races:** one row per organization holds the byte total and is updated under a lock in the same transaction as the document; two uploads that finish together cannot both pass the limit.
- **An irreversible clinical flag:** a trigger refuses the change from true to false.
- **No deletion:** documents, categories and templates have no `DELETE`; archiving and deactivating hide without erasing.
- **Defaults created once:** partial unique indexes and `ON CONFLICT DO NOTHING` make two simultaneous first uses create a single set of categories and templates.

### 17.3 Implementation in 5 stages

| Stage | What went in |
|---|---|
| 1 — Documentation and foundations | PRD, ADR-033 and design system; type detection by bytes (with DOCX), HEIC conversion, the sanitizer and the Tiptap editor moved to `src/shared`; an HTML to PDF converter; permissions, queue and the quota email |
| 2 — Database and module | Migration `0010_patient_documents`, a pure domain (limits, quota, template variables), ports, policies and catalogs in three languages |
| 3 — Upload and corrections | Categories, quota, direct upload with confirmation, HEIC in the worker, listing with the clinical rule, audited opening, archive and restore, the Documentos tab |
| 4 — Templates and PDF | Templates with variables and free fields, resolvers, preview, generation without a partial document, the "Emitir documento" dialog and the settings page |
| 5 — Finishing | Demo data, E2E journeys, the design system review and this log |

The work went to PR #24, and the four CI jobs (quality, integration, E2E and Docker image) passed on the implementation commit.

### 17.4 Problems found in F08

| Problem | Cause | Solution |
|---|---|---|
| Files started uploading as soon as they were dropped | The PRD asks to choose each file's category before sending | The queue got a "pending" state: sending starts at "Enviar" |
| The PDF would fail with bold and italic text in a template | The PDF font only had italics as a variable woff2, which the engine cannot read | A static italic font (OFL) next to the others |
| A prescription did not fit in a free field | The 200-character limit was too small for a prescription | Free fields of up to 1,000 characters and several lines |
| Tests needed to swap the renderer and the storage | The lint rule forbids importing another module's internal files, tests included | `createDocuments(adjust)` in the public API swaps one adapter without exposing the module |
| The PDF render test could not run as a unit test | `tsx` does not resolve the `@react-pdf` exports through a static import | The HTML parser was split out (unit test) and rendering stayed in the integration test |
| The 80% alert did not show in the test | The test arithmetic left the usage under the limit after the upload | Test fixed; the crossing rule has its own test |
| Browser uploads failed in every E2E journey, F07's included | Running `setup:storage-cors` locally stored a rule for `localhost:3001` only on the bucket, which replaces the origins the SeaweedFS server allows (3000, 3001 and 3101) | The script accepts several origins separated by commas and the local bucket got all three; the rule is per bucket, so each environment must list all of its origins |

### 17.5 What F08 left in place

- **Document records** (type, category, title, date, author, file and clinical flag) read by the timeline and the LGPD export (F14).
- **Shared code** for direct upload, image conversion, sanitizing and rich text editing, also used by the clinical record.
- **A PDF base** with rich text and a signature, reusable by receipts (F09) and reports (F13).

---

## 18. Ninth feature: F09 — Billing and Payments

F09 turns the patient's arrival into money to receive: it creates the charge, accepts discounts, receives payments (whole or partial), refunds, voids and issues the receipt. It is the first feature that **writes money**, so the specification started from what the database must refuse even if the application is wrong. F10 (packages), F11 (cash register), F12 and F13 (dashboard and reports) and F14 (timeline) read these tables.

### 18.1 Decisions made in the interview

| Decision | Result |
|---|---|
| Approval of discounts above 20% | The manager types a **personal 6-digit PIN**, set in the user menu (asks for the current password); 5 wrong PINs lock it for 15 minutes. Or the front desk sends it to the approvals list |
| Discount math | On the gross amount, percentages rounded down; it changes only while there are no payments; rejecting removes the discount and reopens the charge |
| Payment methods | Fixed codes from the country profile; the clinic only turns them on and off per country, and at least one stays active |
| Undoing a check-in | Refused if there is a payment; without payments the charge is deleted (it stays in the audit) |
| Receipt | One PDF per charge, generated on demand in the organization's language, not stored |
| Currency | A payment only enters a unit with the charge's currency |
| Items | One item per charge (a service or a free description) |
| Refund | Total or partial, in the selected unit, with the method of the original payment |

The decisions became **ADR-034** (handler rejection, PIN and money rules in the database) and section 5.14 of the design system. The specification and plan are in [F09-billing-and-payments/](F09-billing-and-payments/).

### 18.2 What the database guarantees

- **No overpayment:** a `CHECK` constraint keeps the paid amount between zero and the net amount; two simultaneous receipts go through a row lock on the charge.
- **One live charge per appointment:** a partial unique index; a cancelled charge does not count.
- **Coherent currency:** a payment points to its charge through a composite foreign key that includes the currency.
- **Duplicate submission:** the idempotency key is a primary key; repeating the submission returns what was recorded.
- **Money is never deleted:** payments, submissions and discount decisions have no `DELETE`; a charge with a payment cannot be deleted.

### 18.3 Implementation in 5 stages

| Stage | What went in |
|---|---|
| 1 — Documentation and foundations | PRD, ADR-034 and design system; `EventRejection` (a handler can refuse the operation that published it); the approval PIN in the identity module; a port that stops a unit with charges from changing country |
| 2 — Database and domain | Migrations `0011_approval_pin` and `0012_billing`; the `Charge` aggregate with discount, derived status, payments, refund and void; repositories, read models and catalogs in three languages |
| 3 — Charges and payments | Automatic charge on check-in and its removal on undo, manual and package charges, discounts and approvals, idempotent payments, refunds, voids, queries, payment methods and the PDF receipt |
| 4 — Screens | The "Cobrança" section of the agenda panel, the "Receber" modal, the patient's Financeiro tab, Financeiro > Cobranças, the detail, Aprovações and the settings page |
| 5 — Finishing | Demo data, E2E journeys, design system review and this log |

### 18.4 Problems found in F09

| Problem | Cause | Solution |
|---|---|---|
| Undoing the check-in had to be refused by billing | The agenda module does not know charges, and a port that "asks first" would open a race with receiving | `EventRejection`: the handler throws a domain error, the transaction rolls back and the caller gets the error as a result (ADR-034) |
| The count of wrong PINs vanished when the operation failed | A transaction that returns a failure is rolled back, counter included | The PIN check runs in its own transaction, before the billing operation |
| Two simultaneous receipts of 150 on 200 | Without a lock, both read a balance of 200 | A row lock (`FOR UPDATE`) on the charge; the second gets "greater than the balance"; the database constraint is the second barrier |
| The balance message showed cents | Errors carry amounts in minor units, without a language | The application layer formats the amounts in the language and format of the unit's country before the boundary with the interface |
| The PIN could not live in the password form | The user menu is shared and cannot import the identity module | The menu takes `extraItems` and the app layout composes the PIN item |
| The agenda panel could not import billing | Billing depends on the agenda (events), and the reverse would create a cycle | The agenda accepts a section component; the agenda page composes it |

### 18.5 What F09 left ready

- **Charge and payment records** (patient, origin, service, professional, unit, amounts, status, method, date and user) for F11, F12, F13 and F14.
- **Ports for F10 and F11:** `ChargeExemptionPolicy` (a package covers the appointment) and `CashRegisterGate` (closed register), both with an inert default, plus package charge creation.
- **Events** `ChargeCreated`, `PaymentRegistered` and `PaymentRefunded`, published inside the transaction, for the cash register.
- **PDF receipt** on the shared base.

---

## 19. Problems found and how they were solved

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

## 20. Reproducing the environment from scratch

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

# 7. Optional, after accepting the invitation: demo services, professionals, patients and
#    appointments (users rita@ and beatriz@clinicademo.com.br, password Demo2026senha)
npm run seed:demo
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

### Production operations

The operational scripts have a `:prod` variant that reads `.env.prod` (copy it from `.env.prod.example`). Each prints its target before writing:

```bash
npm run setup:storage-cors:prod -- --dry-run   # check the bucket and origin
npm run setup:storage-cors:prod                # bucket CORS rule (ADR-031)
npm run setup:admin:prod -- --org-name "..." --admin-name "..." --admin-email ...
```

---

## 21. Lessons learned

1. **Interview before document.** One question at a time, always with a recommendation, settles more than a long document written in the dark.
2. **End-to-end IDs** (F01 → story → criterion → test → commit) make the project traceable at no extra cost.
3. **"What" and "how" in separate documents.** The PRD does not choose libraries; the architecture does not invent requirements.
4. **Read the documentation of the installed version**, not the one you remember. Next.js 16, Prisma 7 and Better Auth 1.7 changed important APIs.
5. **"I wrote the code" is not "it is done".** Four real bugs (session expiring while active, version conflict after a logo upload, pg-boss permissions, draft not restored) only appeared by actually running the server, the browser and the database.
6. **Test against real infrastructure.** The database is never mocked in data-rule tests: constraints, privileges and concurrency can only be tested there.
7. **Record changes of direction as new ADRs.** The history of decisions tells the project's story better than any summary.
8. **Ports with a zero default unlock the build order.** F02 already has the rules that depend on appointments, with tests, before the agenda exists; when F06 arrives, only the port's implementation changes.
9. **Check in the code what the spec assumes.** The F03 spec relied on a function that did not exist; the gap showed up during implementation, was fixed and was recorded.
10. **Define the look before the dense screens.** With few screens built, a design system costs one document and a token swap; after the agenda and clinical records, it would mean redoing the most complex screens.
11. **Fix the whole class of problem, not only the case found.** F03 moved the event bus to `globalThis` because Next.js loads modules more than once, but left the ports in module variables. The same cause came back in F04.
12. **Decisions taken without the user must be written down.** When the spec was written without a live interview, every recommendation applied became an explicit assumption, so the product owner can review and override it later.
13. **Measure the performance target, do not assume it.** The F05 search test inserts 100,000 patients and checks the p95, and `EXPLAIN ANALYZE` shows which index each query uses. A missing index would have been caught by the test, not in production.
14. **A green unit test is not a working screen.** Three real problems in F06 (a broken production build, a worker that no longer started, keyboard dragging that did nothing) only appeared in the production build and the browser journeys.
15. **When a test fails, check whether the product is right first.** Two E2E failures were the agenda correctly refusing a booking outside the professional's hours and during her vacation; the fix was in the test's assumptions, not in the code.
16. **A merge does not wait for the last push.** The F07 PR was merged while a fix commit was still being pushed, and the commit ended up outside `main`. Before merging, check that the green CI belongs to the branch's last commit.
17. **Every operational script must say where it will write.** Running the CORS script "for production" would have written to the local environment, with no error at all. Printing the target first and offering `--dry-run` prevents that mistake.
18. **Share what two features use before copying it.** Direct upload, HEIC conversion, the sanitizer and the editor were born in the clinical record; F08 moved them to `src/shared` in its first stage, and the clinical record kept passing the same tests. Copying would have let the two versions drift.
19. **A rule about sensitive data becomes a database rule.** The clinical flag that never turns off and the race-free quota live in a trigger and a row lock, not only in code: an application bug cannot break them.
