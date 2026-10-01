# Implementation Plan: F04. Professionals and Working Hours

**Prerequisites:**
- F01 implemented: authentication, authorization, tenant scoping, auditing, events, composition root and application shell.
- F02 implemented: the units public API with business hours, time zones and `isWithinHours`.
- F03 implemented: the active services list, the color palette and the `ServiceProfessionals` port.
- Local services running: `docker compose up -d`.
- PostgreSQL extension `btree_gist`, created by the F04 migration and available in the standard PostgreSQL image.
- No new environment variables and no new external services.
- New shadcn/ui component: checkbox.
- Reference documents: `docs/prd.en.md` (F01 permission matrix, F04), `docs/architecture.en.md` (ADR-007, ADR-018, ADR-019, ADR-020), `docs/design-system.en.md`, and this folder's `spec.md`.

### Stage 1: Shared Foundations

**1. Decisions recorded in the documentation** - Add ADR-021 to both language versions of the architecture document, covering the comparison of working hours across unit time zones. Extend both language versions of the design system with the professional color rule and the weekly-hours grid pattern, including the out-of-hours highlight.

**2. CPF value object and input** - Add the CPF value object to the shared kernel and the masked CPF input to the shared form components, so F04 and F05 use the same rules.

**3. Permission for reading all professionals** - Add the read-all professionals action to the permission matrix for Administrator, Manager and Front Desk, keeping the Professional role limited to its own profile.

**4. Linked professional in identity** - Add the professional-links port to identity with an inert default and a register function. Use it to fill the linked professional in the request context and in the users list, and show the linked professional on the Users screen.

### Stage 2: Data Model and Domain

**5. Schema and migration** - Add the five tables for professionals, enabled services, schedules, working intervals and time-offs. Include the CHECK constraints, partial unique indexes and the validity exclusion constraint described in the spec, and register the tables in the tenant scope and the test reset helper.

**6. Domain rules** - Implement the pure rules for council registration, working-hour intervals, business-hours and cross-unit checks across time zones, schedule validity, time-off ranges and the view and time-off policies. Put the module's limits in named constants with PRD references.

**7. Ports and defaults** - Define the professional-appointments port with its inert default and register function for F06, and the directory ports that wrap the units, services and identity public APIs.

### Stage 3: Use Cases and Public API

**8. Profile use cases** - Implement listing, reading, creation, editing and activation of professionals. Include the limit, CPF and council uniqueness, user linking, optimistic locking, the future-appointments block and auditing.

**9. Enabled services use cases** - Implement reading and replacing a professional's enabled services, accepting only active services and reporting kept future appointments for removed services.

**10. Schedule use cases** - Implement listing, saving and deleting working-hour schedules. Saving validates every interval and closes the previous schedule; deleting a future schedule restores the previous end date.

**11. Time-off use cases** - Implement listing, creating and deleting time-offs under the own-or-manager policy, returning the appointments affected by a new time-off.

**12. Provided API and wiring** - Expose the bookable professionals, service enablement, working calendar, professional summaries and credentials through the module's public entry point. Register the professional-links and services-count implementations in the composition root.

### Stage 4: Screens and Navigation

**13. Professionals list and menu** - Build the professionals list page with URL filters and the empty states, and add the "Profissionais" item to the settings menu. Users with only the Professional role go to their own profile.

**14. Professional page: Dados and Serviços** - Build the new-professional page and the professional page with its record header and tabs. Add the profile form with the council fields, CPF input, color and linked user, and the services checklist grouped by category.

**15. Professional page: Horários and Ausências** - Build the schedule editor with validity, "Copiar semana", unit tabs and the weekly grid that highlights intervals outside business hours. Add the time-offs panel with the new time-off dialog and the affected-appointments list.
