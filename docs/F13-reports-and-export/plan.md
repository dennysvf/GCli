# Implementation Plan: F13. Reports and Export

**Prerequisites:**
- F01, F06, F09, F12 and F16 merged on `main`:
  - appointments with cancellation origin and reason;
  - charges, payments and refunds;
  - the organization profile and logo;
  - the `report:read` permission (already in the matrix);
  - the `analytics` module with the period presets and the query scope (ADR-037);
  - the CSV helper of `src/shared/i18n/csv.ts` and the shared PDF base (ADR-024).
- No new npm dependency.
- Local services from `docker-compose.yml` and Docker for Testcontainers.
- Branch `feat/F13-reports-and-export` created from an updated `main`.

### Stage 1: Documentation and shared pieces

**1. PRD, architecture and design system** - Record the decisions in PRD F13, in both languages:
- days open counted from the charge's issue date;
- the reports index as a list;
- the report-specific filters and defaults.

Add ADR-038 (report registry, offset pages on screen, keyset batches streamed for CSV, PDF in landscape on the shared base, export limits checked first, audit before the first byte) and the F13 rows in sections 3 and 8 of the architecture documents, in both languages. Add section 5.18 (Reports) to the design system, in both languages.

**2. Shared PDF base and navigation** - Give the shared PDF document an orientation option, keeping portrait as the default, and add a summary block for label and value pairs and small tables. Add the "Relatórios" sidebar item, with its icon and its label in the three shell catalogs.

### Stage 2: Domain and report definitions

**3. Analytics domain** - Add the report limits and aging buckets as named constants. Add pure functions, with unit tests, for days open and the aging bucket, the cancellation lead time, and the revenue subtotals per group and currency. Add the new error codes.

**4. Shared query helpers** - Move the UTC window and the unit and time zone loading out of the dashboard use case into the shared query scope, so the dashboard and the reports use the same rules, with no change in dashboard behavior.

**5. Report registry and filters** - Create the registry with the common filter schema and the shape every report follows: filters, columns, count and totals, one page, keyset batches and optional summaries. Add the row formatter for the screen, the CSV and the PDF in the user's language.

**6. Five report definitions** - Implement the queries of each report (Agendamentos, Cancelamentos e faltas, Receitas, Contas a receber, Produtividade por profissional), with their extra filters, totals per currency and summaries, as the spec describes.

### Stage 3: Use cases and endpoints

**7. Get report use case** - Implement the use case that authorizes, resolves the report, validates the filters and the period, and returns one page with the totals and summaries from the aggregate queries. Expose it in the module's public API.

**8. Export use case** - Implement the export: authorize, validate, check the row count against the CSV or PDF limit, record the audit event, then return either a CSV stream written batch by batch or the rendered PDF with the organization header, the filters, the summaries and the table. Add the organization header adapter and the report PDF document, and make both replaceable for tests.

**9. Export Route Handler and catalogs** - Add the export endpoint that maps the result to a file response or a JSON error with the right status. Add the report texts to the analytics catalogs in the three languages: names, descriptions, columns, filters, values, summaries, progress texts, PDF texts, file names and errors.

### Stage 4: Screens

**10. Reports pages** - Add the reports index, the report page that validates the report, loads the filter lists and generates on load when the URL asks for it, and the Server Action behind "Gerar" and the page changes.

**11. Report view** - Build the client view: the filter bar with each report's own filters, the remembered filters for the session, "Gerar", the summaries, the result table with the totals row and the pagination, the empty state and the error alert, and the export buttons with the progress text, the automatic download and the PDF limit advice.

### Stage 5: Finishing

**12. Demo data and performance check** - Extend the demo data so every report shows meaningful rows, including cancellations with reasons, refunds and charges in every aging bucket. Run the export load check with 50,000 rows, and attach `EXPLAIN ANALYZE` of each report query to the pull request.

**13. Design system review and build log** - Review the screens against the design system checklist and the PRD messages in the three languages, and record F13 in the build log in both languages.
