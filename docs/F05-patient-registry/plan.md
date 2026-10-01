# Implementation Plan: F05. Patient Registry

**Prerequisites:**
- F01 implemented (authentication, authorization, tenant scoping, auditing, storage, worker, application shell) and the port registry from F04 (ADR-022).
- Local services running: `docker compose up -d`.
- PostgreSQL extensions `pg_trgm` and `unaccent`, already created by migration 0001.
- No new environment variables and no new external services.
- Reference documents: `docs/prd.en.md` (F01 permission matrix, F05), `docs/architecture.en.md` (sections 5.6 and 8, ADR-009, ADR-022), `docs/design-system.en.md`, and this folder's `spec.md`.

### Stage 1: Shared Foundations

**1. Decisions recorded in the documentation** - Add ADR-023 to both language versions of the architecture document, covering consent file uploads through the application server. Extend both language versions of the design system with the global search pattern.

**2. Phone and address in the shared kernel** - Add the phone number value object and move the address schema and the address fields with CEP lookup from the units module to the shared kernel and shared form components, keeping F02 unchanged in behavior.

**3. Storage confirmation** - Add the object metadata check to the storage adapter so uploads can be confirmed before they are attached.

### Stage 2: Data Model and Domain

**4. Schema and migration** - Add the tables for patients, referral sources, tags, patient tags, privacy terms versions, consent records and pending uploads, with the trigram search indexes, the partial unique CPF index, the CHECK constraints and the append-only grants described in the spec. Register the tables in the tenant scope and the test reset helper.

**5. Domain rules** - Implement the pure rules for name normalization and display, ages and minors, search term classification, duplicate identity, consent status, record completeness and CPF masking, with the module's limits as named constants.

**6. Ports and adapters** - Define the patient-appointments port with its inert default for F06, and the file store and user name adapters.

### Stage 3: Use Cases and Public API

**7. Patient use cases** - Implement reading, full and quick creation with the guardian rule and duplicate detection, editing with concurrent-edit detection, and deactivation, all audited and checked against the visibility policy.

**8. Search** - Implement the search by name, CPF or phone with explicit tenant filtering, the Professional restriction, CPF masking for Front Desk and last appointment dates, and verify the performance target with 100,000 records.

**9. Lists and terms** - Implement the referral source and tag lists and the publication of privacy terms versions.

**10. Consents and files** - Implement the consent file upload route, consent recording with the current terms version, audited file access and the daily cleanup of unused uploads.

**11. Provided API** - Expose patient identity, the complete record, search, quick creation and the appointments extension point through the module's public entry point.

### Stage 4: Screens and Navigation

**12. Patients page and header search** - Build the patients page with URL search, filters and pagination, and the global search field in the header with the "/" shortcut.

**13. Registration forms** - Build the full patient form with its sections, the quick form for F06, the duplicate dialog and the concurrent-edit alert.

**14. Patient page** - Build the patient page with the record header, the incomplete-record alert, the Dados tab, the consent section and deactivation.

**15. Settings and menu** - Build the patient lists and privacy terms settings pages and add the menu items.
