# Implementation Plan: F02. Units and Rooms

**Prerequisites:**
- F01 implemented (authentication, authorization, tenant scoping, auditing, application shell)
- Local services running: `docker compose up -d`
- No new environment variables. Outbound HTTPS to `brasilapi.com.br` and `viacep.com.br` for CEP lookups (optional: without it, addresses are typed manually)
- New shadcn/ui components: tabs, switch, textarea, alert-dialog
- Reference documents: `docs/prd.en.md` (F02), `docs/architecture.en.md` (ADR-019, recorded with this spec), this folder's `spec.md`

### Stage 1: Shared Foundations for Units

**1. CNPJ in the shared kernel** - Move the CNPJ rules from the identity module to the shared kernel and update identity to use them, with no behavior change.

**2. Messages with parameters** - Extend the domain error and the action result envelope so pt-BR messages can include values such as appointment counts.

**3. CEP lookup** - Add the shared CEP lookup with its primary and fallback providers and the authenticated, rate-limited route that forms call.

### Stage 2: Data Model and Domain

**4. Schema and migration** - Add the units, business hours, closures, rooms and unit selection tables with their constraints and case-insensitive unique indexes, and register them in the tenant scope.

**5. Business hours rules** - Implement the pure rules for weekly business hours and the module's limits as named constants.

**6. Appointment port** - Define the scheduled-appointments port with its zero default and the registration point that F06 will use.

### Stage 3: Use Cases and Public API

**7. Unit use cases** - Implement listing, reading, creation, editing and activation of units with limits, uniqueness, CNPJ validation, optimistic locking, appointment checks and auditing.

**8. Business hours use cases** - Implement reading and replacing a unit's weekly hours, reporting future appointments left outside the new hours.

**9. Room use cases** - Implement listing, creation, editing and activation of rooms with per-unit uniqueness, limits and appointment checks.

**10. Closure use cases** - Implement listing, the two-step creation with overlap confirmation, and deletion of future closures.

**11. Selection and provided API** - Implement the per-user unit selection with its fallback, and the read functions provided to F04, F06, F08, F11 and F12 through the module's public entry point.

### Stage 4: Screens and Navigation

**12. Units pages** - Build the units list, the new unit page and the unit page with its four tabs, in read-only mode for users without the manage permission.

**13. Forms and panels** - Build the unit form with CEP lookup, the weekly hours form, the rooms panel and the closures panel with the confirmation dialog.

**14. Header selector and menu** - Add the unit selector to the application header slot and the "Unidades" item to the settings menu.
