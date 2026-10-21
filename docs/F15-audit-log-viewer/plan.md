# Implementation Plan: F15. Audit Log Viewer

**Prerequisites:**
- F01 merged on `main` (audit recording, `audit_event` partitions, `audit:read` in the permission matrix); F05, F06 and F09 merged for the host screens of the "Ver auditoria" links.
- The CSV helper of `src/shared/i18n/csv.ts` and the streamed export pattern of F13 (ADR-038).
- F14 merged on `main` (migration `0016_privacy` adds `patient.anonymized_at`, which the viewer reads; F15 uses no F14 use case or screen).
- No new npm dependency.
- Local services from `docker-compose.yml` and Docker for Testcontainers.
- Branch `feat/F15-audit-log-viewer` created from an updated `main`.

### Stage 1: Documentation and database

**1. Architecture and design system** - Add ADR-039 (keyset viewer over the partitioned audit table, explicit organization filter outside the tenant extension, GET read endpoints, masking at presentation, including the masking of personal data of anonymized patients in the detail and the CSV while the stored rows stay unchanged as legal evidence, which answers the trade-off recorded in ADR-040; audited streamed export) and update the F15 row of section 8 and the module dependency graph, in both languages. The PRD dependency row, the wave (now 7) and the "leitura de dado sensível" label were already updated in both languages. Add section 5.19 (Audit log) to the design system in both languages, covering the filter bar, the table, the detail side panel with the diff and the "Ver auditoria" link.

**2. Viewer indexes** - Add the hand-written migration with the two indexes the spec lists for the action and entity type filters, and mirror them in the Prisma schema so the drift check stays clean.

### Stage 2: Audit module read side

**3. Limits, registries and errors** - Add the named limits with their PRD references, the lists of actions and entity types with their groups (complete against what the modules record, including the privacy group), the input schemas and the module errors.

**4. Pure presentation helpers** - Add the period resolution in the organization's time zone, the cursor encoding, and the change presenter that renders values, masks clinical changes with their character counts and hides secret-like fields, including the single-cell text used by the CSV. Add the pure masking rule for anonymized patients (which events it covers and which personal fields it replaces), applied by the same presenter.

**5. Read queries** - Add the read-only queries with the explicit organization filter and the UTC window: the keyset page with the actor names, the capped count, the export batches, the event by id and the user options. The event and batch queries also tell whether the patient an event refers to is anonymized.

**6. Use cases and public API** - Implement search, detail, export and filter options, each starting with the authorization check. The detail and the export apply the anonymized-patient masking. The export checks the limit, records its own audit event and returns the streamed CSV. Expose them, the catalog and a test factory through the module entry point, and add the client entry with the link helpers.

**7. Catalogs** - Add the audit catalogs in the three languages (labels of filters, columns, actions, entity types and fields, panel texts, the "dado anonimizado" text, export texts, empty state, errors, CSV header and file name) and register them in the composition root, with the shell label of the new sidebar item.

### Stage 3: Endpoints and screens

**8. Route Handlers** - Add the search, detail and export endpoints that build the request context, call the use cases and map results to JSON, the CSV stream or a translated error with its status.

**9. Viewer page and view** - Add the settings page that checks the permission, reads the filters from the URL and renders the first page, and the client view with the filter bar, the result table, the keyset pagination, the empty and error states, the export button with its progress and limit advice, and the detail side panel with the diff, which shows masked fields as "dado anonimizado".

**10. Navigation and "Ver auditoria" links** - Add the "Auditoria" sidebar item for Administrators and mount the link on the patient page, the charge page, the users table and the appointment side panel, visible only to those who may read the audit log.

### Stage 4: Finishing

**11. Demo data and performance check** - Make sure the demo data produces a varied audit log, run the 1-million-event load check, and attach the query plans of each filter combination to the pull request.

**12. Design system review and build log** - Review the screens against the design system checklist and the messages in the three languages, and record F15 in the build log in both languages.
