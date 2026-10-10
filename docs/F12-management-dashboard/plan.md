# Implementation Plan: F12. Management Dashboard

**Prerequisites:**
- F01–F11 and F16 merged on `main`:
  - appointments, working hours, time-offs and unit closures;
  - charges, payments and refunds;
  - financial entries and cash movements;
  - the `dashboard:read` permission (already in the matrix);
  - the shared zoned-time helpers.
- No new npm dependency.
- Local services from `docker-compose.yml` and Docker for Testcontainers.
- Branch `feat/F12-management-dashboard` created from an updated `main`.

### Stage 1: Documentation and data access

**1. PRD, architecture and design system** - Record the interview answers in PRD F12, in both languages:
- the occupancy rule with closures and the union of booked ranges;
- the definition of "Resultado";
- the hidden cards when a professional is selected;
- the previous-period rule;
- the variation formats.

Add ADR-037 (read-only analytics module, raw SQL aggregates, pure KPI functions, in-process TTL cache) to the architecture documents, in both languages. Add section 5.17 (Dashboard) to the design system, in both languages.

**2. Indexes** - Add the migration and the Prisma schema indexes for patients by creation date and for charges by unit and creation date, and check that the schema drift check stays clean.

### Stage 2: Domain and queries

**3. Analytics domain** - Implement these pure functions, with unit tests:
- the limits and thresholds;
- period resolution and the previous equivalent period;
- the occupancy calculation (working hours minus time-offs and closures, union of booked ranges, daylight-saving-correct conversion);
- the KPI math (rates, ticket and result per currency, variation with significance and tone).

**4. Read queries** - Implement the aggregate SQL queries for:
- appointment counts and ranges;
- availability inputs (schedules, intervals, time-offs, closures);
- billed, receivable and received per currency;
- paid revenues and expenses, and non-transfer cash movements;
- new patients, with the first-appointment rule.

Each query filters the organization explicitly and assigns records to the period by their unit's local date.

### Stage 3: Use case and module

**5. Dashboard use case and cache** - Implement:
- the input schema;
- the in-process TTL cache with an injected clock;
- the use case, which authorizes, validates the period and filters, resolves the units and the anchor time zone, uses the cache, and builds the view for the current and previous periods (with the hidden cards and the empty state).

**6. Module wiring** - Create the module's public API with test adjustment and the catalogs in three languages (labels, formulas, notes, presets, errors, empty state), and register the catalog in the composition root.

### Stage 4: Screen

**7. Dashboard page** - Replace the placeholder with:
- the server page, which reads the filters from the URL and loads the first view, the units and the professionals;
- the Server Action that re-runs the dashboard.

**8. Dashboard view** - Build the client view:
- the filter bar and the custom date range;
- the "Operação" and "Financeiro" rows of indicator cards, with values per currency, variation, formula tooltips and the professional note;
- "Atualizado às" and "Atualizando…";
- the empty state and the error alert;
- the URL kept in sync with the filters.

### Stage 5: Finishing

**9. Demo data and performance check** - Extend the demo data so the dashboard shows meaningful values and a comparison. Run the load check with about 15,000 appointments, and attach `EXPLAIN ANALYZE` of the aggregate queries to the pull request.

**10. Design system review and build log** - Review the screen against the design system checklist and the PRD messages in the three languages, and record F12 in the build log in both languages.
