# Implementation Plan: F03. Service Catalog

**Prerequisites:**
- F01 implemented (authentication, authorization, tenant scoping, auditing, events, application shell).
- F02 implemented: rooms and units public API.
- Local services running: `docker compose up -d`.
- No new environment variables and no new external services.
- Reference documents: `docs/prd.en.md` (F03), `docs/architecture.en.md` (ADR-007, ADR-010, ADR-018), and this folder's `spec.md`.

### Stage 1: Shared Foundations

**1. Money value object** - Add the `Money` value object to the shared kernel. It holds integer cents, formats BRL for pt-BR and parses masked input. Add the reusable BRL money input for forms.

**2. Composition root and organization event** - Publish an organization-created event from identity when the first organization is set up, and add the idempotent composition root that registers cross-module subscriptions. The web server, the worker and the integration test setup call it.

**3. Room lookup in units** - Add a read function to the units public API that returns rooms with their unit, filtered by ID and active status.

### Stage 2: Data Model and Domain

**4. Schema and migration** - Add the four tables: categories, services, allowed rooms and price history. Include their CHECK constraints, case-insensitive unique indexes and append-only grants on the price history, and insert the default categories for existing organizations. Register the tables in the tenant scope and in the test reset helper.

**5. Domain rules and palette** - Implement the pure rules for duration, price, duration formatting and per-unit allowed-room resolution. Add the 16-color palette with its default-color choice and the module's limits as named constants.

**6. Ports with zero defaults** - Define the future-appointments and enabled-professionals ports with their inert defaults and the register functions that F06 and F04 will use.

### Stage 3: Use Cases and Public API

**7. Category use cases** - Implement listing, creation, renaming, reordering and deletion of empty categories with limits, uniqueness and auditing. Add the subscriber that seeds the default categories for new organizations.

**8. Service use cases** - Implement listing with filters, reading, creation, editing and activation of services. Include limits, uniqueness, room validation, optimistic locking, price history entries, the future-appointments warning and auditing.

**9. Provided API** - Expose the active-services list, the single-service read and the per-unit allowed-rooms resolution through the module's public entry point.

### Stage 4: Screens and Navigation

**10. Services page** - Build the settings page with the URL filters and the list grouped by category, with read-only mode for users without the manage permission.

**11. Service panel and form** - Build the side panel with the service form (money input, color picker, allowed rooms grouped by unit, price-change confirmation) and the price history tab.

**12. Categories dialog and menu** - Build the category management dialog and add the "Serviços" item to the settings menu.

### Stage 5: Verification

**13. Tests** - Write the unit, integration and E2E tests listed in the spec's Testing Strategy, named with the F03 feature ID, covering every PRD acceptance criterion and the provider side of the cross-feature criteria.
