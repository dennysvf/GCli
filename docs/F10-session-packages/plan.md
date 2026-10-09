# Implementation Plan: F10. Session Packages

**Prerequisites:**
- F01–F09 and F16 merged on `main`, including:
  - the billing charge API and the `ChargeExemptionPolicy` port;
  - `EventRejection` (ADR-034);
  - the scheduling events, including `AppointmentCompletionReverted`;
  - the pg-boss worker.
- No new npm dependency.
- Local services from `docker-compose.yml` and Docker for Testcontainers.
- Branch `feat/F10-session-packages` created from an updated `main`.

### Stage 1: Documentation and integration points

**1. PRD, architecture and design system** - Update PRD F10 in both languages with the interview answers. Add ADR-035 and the module dependencies to the architecture documents. Add the patterns for package cards, the "Usar pacote" choice and the agenda mark to the design system, in both languages.

**2. Scheduling pass-through and slots** - Let booking, series and edits carry an optional package reference into their events without scheduling knowing packages. Add the package slot to the booking and edit panels, and add the link lookup port with an inert default for the agenda mark.

**3. Billing inside a caller's transaction** - Expose package charge creation, discount and void as functions that run in the caller's transaction, with the same domain rules, audit and events as their F09 counterparts.

### Stage 2: Data model and domain

**4. Migration and Prisma schema** - Create the templates, prices, packages, links, movements, settings and expiration-run tables with the constraints, indexes and grants described in the spec. Add the foreign key from charges to packages, declare every relation in the Prisma schema, and register the tables for tenancy.

**5. Packages domain** - Implement the limits, the expiry arithmetic and the package aggregate with balance, linking, debit, restore, release, expiration, extension and cancellation, all pure and unit tested.

**6. Module skeleton** - Create the ports, schemas, repository with row locking, directory, catalogs in three languages, public API with test adjustment, and the composition wiring.

### Stage 3: Use cases

**7. Templates and settings** - Implement template listing, creation, editing and activation with prices per currency, and the no-show debit setting.

**8. Sale** - Implement the sale with the charge and the optional discount in a single transaction, including the rollback and the PRD failure message.

**9. Event handlers** - Implement linking on booking and edits (strict and up to the balance), release on cancellation, no-show and service change, the expiry check on rescheduling, debit on completion and restore on its reversal. Implement the charge exemption policy and the link lookup.

**10. Lifecycle** - Implement extension with its total limit, cancellation with the unlink confirmation and the charge void, and the daily expiration job with forfeits, unlinks and flags.

**11. Queries** - Implement the patient packages with payment status and links, the eligible packages for a booking and the series coverage.

### Stage 4: Screens

**12. Settings page** - Add Configurações > Pacotes with the templates table, the template form with the per-session price and discount comparison, and the no-show switch.

**13. Patient packages and sale** - Add the "Pacotes" section to the patient's Financeiro tab with cards, the sale dialog that can open the receive modal, the extension and cancellation dialogs, and the open-balance notice.

**14. Agenda integration** - Compose the package choice into the booking and edit panels, the series coverage note, and the session mark on agenda blocks and in the side panel.

### Stage 5: Finishing

**15. Worker and demo data** - Schedule the expiration job in the worker and extend the demo data with templates, a used package and an unpaid package.

**16. Design system review and build log** - Review the screens against the design system checklist and the PRD messages in the three languages, run the schema drift check locally, and record F10 in the build log in both languages.
