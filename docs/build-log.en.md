# Build log — how GCli was built

This log records, in order, everything done on the project from reading the briefing to implementing the first feature (F01). The goal is for anyone to **understand the decisions** and **repeat the process** on another project.

The work was done as a pair: a product owner and an AI coding assistant. The product owner answered questions, made the business decisions and approved each stage; the assistant ran the interviews, wrote documents and code, ran the tests and recorded what it found along the way.

> **The path in one line:** briefing → interview → PRD → bilingual docs → public repository → architecture and ADRs → F01 technical spec and plan → implementation in 6 stages, with tests and a commit per stage.

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
8. [Problems found and how they were solved](#8-problems-found-and-how-they-were-solved)
9. [Reproducing the environment from scratch](#9-reproducing-the-environment-from-scratch)
10. [Lessons learned](#10-lessons-learned)

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

**Problem:** the push failed with `SSL certificate problem: unable to get local issuer certificate`. **Cause:** Git for Windows uses OpenSSL's certificate store, which did not recognize the certificate presented by the network. **Fix:** `git config --global http.sslbackend schannel`, which makes Git use the Windows certificate store. The root cause showed up later (see [section 8](#8-problems-found-and-how-they-were-solved)).

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

## 8. Problems found and how they were solved

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

## 9. Reproducing the environment from scratch

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

## 10. Lessons learned

1. **Interview before document.** One question at a time, always with a recommendation, settles more than a long document written in the dark.
2. **End-to-end IDs** (F01 → story → criterion → test → commit) make the project traceable at no extra cost.
3. **"What" and "how" in separate documents.** The PRD does not choose libraries; the architecture does not invent requirements.
4. **Read the documentation of the installed version**, not the one you remember. Next.js 16, Prisma 7 and Better Auth 1.7 changed important APIs.
5. **"I wrote the code" is not "it is done".** Four real bugs (session expiring while active, version conflict after a logo upload, pg-boss permissions, draft not restored) only appeared by actually running the server, the browser and the database.
6. **Test against real infrastructure.** The database is never mocked in data-rule tests: constraints, privileges and concurrency can only be tested there.
7. **Record changes of direction as new ADRs.** The history of decisions tells the project's story better than any summary.
