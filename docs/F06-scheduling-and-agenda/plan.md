# Implementation Plan: F06. Scheduling and Agenda

**Prerequisites:**
- F01 through F05 implemented, including the inert appointment ports of F02, F03, F04 and F05 and the port registry (ADR-022).
- Local services running: `docker compose up -d`.
- PostgreSQL extension `btree_gist`, already created by migration 0005.
- New npm dependencies: `@tanstack/react-query`, `@dnd-kit/core` and `@react-pdf/renderer`. Static TTF files of Source Sans 3 and Source Serif 4 (OFL) for the PDF base.
- No new environment variables and no new external services.
- Reference documents: `docs/prd.en.md` (F01 permission matrix, F06, F10), `docs/architecture.en.md` (sections 3, 5.4, 6, 8 and 11.2; ADR-011, ADR-019, ADR-021, ADR-022), `docs/design-system.en.md` (sections 5 and 10), and this folder's `spec.md`.

### Stage 1: Documentation and Shared Foundations

**1. PRD and architecture decisions** - Update PRD F06 in both languages with the reversal of Concluído. Add ADR-024 (shared PDF generation), ADR-025 (agenda client: TanStack Query polling and drag-and-drop) and ADR-026 (appointment conflict model, slot-occupying statuses, Encaixe and completion reversal) to both language versions of the architecture document.

**2. Design system agenda patterns** - Extend both language versions of the design system with the agenda patterns the spec introduces. These are the week grid, drag and resize, the Encaixe stamp, conflict findings in the booking panel, the series conflict list, the availability dialog and the printed agenda layout.

**3. Shared kernel and permissions** - Add the date-time range value object and move the zoned-time helpers into the shared kernel, keeping the professionals module working through a re-export. Add the optional details field to domain errors and the action envelope. Add the two new scheduling permissions to the matrix.

**4. Shared PDF and query infrastructure** - Install the new dependencies. Create the shared PDF base with fonts, the page template and rendering to a buffer. Add the TanStack Query provider to the authenticated layout.

### Stage 2: Data Model and Domain

**5. Schema and migration** - Add the tables for appointments, status changes, reschedules, series and cancellation reasons, with the exclusion constraints, CHECKs, indexes and append-only grants described in the spec. Register the tables in the tenant scope and the test reset helper.

**6. Appointment entity and state machine** - Implement the status transition table with its time-window guards, and the appointment entity with booking, edit, reschedule, every transition and cancellation, with the module's limits as named constants.

**7. Conflict strategies** - Implement one strategy per conflict rule with its severity, and the composition that serves saving, the preview, series validation and availability.

**8. Recurrence, availability and agenda time** - Implement series expansion in the unit time zone, the next-free-slot search, granularity alignment, lateness and the undo windows as pure functions.

### Stage 3: Use Cases and Ports

**9. Ports, repositories and directory** - Define the repository and directory ports. Implement the Prisma repositories with the version check and the mapping of exclusion violations to the "slot taken" error. Implement the directory adapter over the public APIs of identity, units, services, professionals and patients.

**10. Booking, editing and rescheduling** - Implement the conflict context loader, booking with Encaixe and justified exceptions, editing before check-in with the price re-snapshot, and rescheduling with history, all authorized, audited and publishing their events.

**11. Status lifecycle and cancellation** - Implement every status transition, including the undo of check-in and the completion reversal, with the own-appointment rules for professionals. Implement cancellation with origin and reason for single appointments and series scopes, and the cancellation reasons list with its defaults.

**12. Recurring series** - Implement series preview, booking with per-occurrence resolutions, and series editing by splitting, revalidating every changed occurrence.

**13. Queries, availability and PDF export** - Implement the agenda range query with the change feed for polling, appointment details with history, the paginated list, the patient's appointments, the conflict preview, the availability search, and the audited daily agenda export. All of them apply the own-agenda policy.

**14. Cross-module ports and public API** - Implement the appointment ports for units, services, professionals and patients, register them in the composition root, and expose the module's public API, events and UI through its entry point.

### Stage 4: Agenda Screens

**15. Agenda page and data layer** - Replace the agenda placeholder with the page that resolves unit, date, view and filters from the URL. Add the client agenda root with polling, the toolbar and keyboard shortcuts, and honor the URL contracts promised by F04.

**16. Day, Week and List views** - Build the day grid per professional or per room, the week grid, the appointment block with stamps, Encaixe and lateness, and the paginated list view.

**17. Booking panel and conflicts** - Build the booking side panel with patient search and quick registration, the filtered selects, end time and price, inline conflict findings with Encaixe and justification, and the recurrence fields with the series conflict resolution.

**18. Appointment panel and dialogs** - Build the details panel with history and status buttons, the reschedule and edit flows, the cancellation dialog, the series scope dialog and the completion reversal dialog.

**19. Drag-and-drop and availability** - Add drag-and-drop rescheduling and resizing with the drop confirmation and keyboard support. Add the "Próximo horário livre" dialog, which opens a prefilled booking.

### Stage 5: Integrations and Settings

**20. Printable agenda** - Build the daily agenda PDF document on the shared base, serve it from its route, and add the print action to the toolbar.

**21. Patient tab and settings** - Add the Agendamentos tab to the patient page. Add the cancellation reasons settings page and its menu item.
