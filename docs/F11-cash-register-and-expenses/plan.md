# Implementation Plan: F11. Cash Register and Expenses

**Prerequisites:**
- F01–F10 and F16 merged on `main`, including:
  - the F09 payments and refunds with the `CashRegisterGate` port;
  - the units `UnitFinancialRecords` port;
  - the object storage and direct uploads of F08;
  - the pg-boss worker.
- No new npm dependency.
- Local services from `docker-compose.yml` and Docker for Testcontainers.
- Branch `feat/F11-cash-register-and-expenses` created from an updated `main`.

### Stage 1: Documentation and integration points

**1. PRD, architecture and design system** - Update PRD F11 in both languages with the interview answers. Add ADR-036 and the module dependencies to the architecture documents. Add section 5.16 (Cash register and expenses) to the design system, in both languages.

**2. Permissions** - Add the cash and finance actions to the permission matrix with their roles, and cover them in the permission tests.

**3. Billing integration points** - Change the cash register gate into a yes/no question answered inside the payment transaction, with billing keeping its closed-register message. Add the read of payments and refunds per unit and period, and expose billing's financial-records check for the units composite.

### Stage 2: Data model and domain

**4. Migration and Prisma schema** - Create the categories, registers, closings, reopenings, movements, attachments, entries, entry payments and series tables. Include the constraints, indexes and grants described in the spec, declare every relation in the Prisma schema, and register the tables for tenancy.

**5. Cash domain** - Implement the limits, the register aggregate with opening, movements, reversal, closing, reopening and the unclosed flag, and the expected-cash calculation. Implement the entry aggregate with payment, reversal and deletion, the monthly recurrence dates and the statement balance, all pure and unit tested.

**6. Module skeleton** - Create the ports, schemas, repositories with row locking, the billing gateway, the directory, the attachment storage, the catalogs in three languages and the public API with test adjustment. Wire the composition: the gate and the unit records composite.

### Stage 3: Use cases

**7. Categories** - Implement the category listing with the default seeding, creation, renaming and activation, protecting the transfer category.

**8. Cash register** - Implement opening (with the suggested balance, the reason, the allowed dates and the existing-register case), manual movements with receipts, reversals, closing with the justification rule and the snapshot, reopening, and the register-day read.

**9. Entries** - Implement expense and revenue creation with the monthly series, editing and deletion of one or the following occurrences, payment, payment reversal, ending a series, and the filtered listing with overdue entries.

**10. Statement** - Implement the statement with the previous balance, the lines from every source, the running balance, the totals per category and source, and the period and currency rules.

**11. Attachments and jobs** - Implement the upload intents and authorized downloads, and the system use cases that flag unclosed registers, extend recurrences and clean up abandoned uploads.

### Stage 4: Screens

**12. Caixa** - Add Financeiro > Caixa with the open form, the register view with summary cards, movements and history, the movement, reversal, closing and reopening dialogs, and the unclosed banner.

**13. Despesas, Receitas and Extrato** - Add the entries pages with filters, the overdue highlight, the entry form with recurrence and attachment, and the payment and reversal dialogs. Add the statement page with its filters, running balance and totals.

**14. Settings and navigation** - Add the financial categories section to Configurações > Financeiro, and the new Financeiro entries to the navigation with their permissions.

### Stage 5: Finishing

**15. Worker and demo data** - Schedule the unclosed-register, recurrence and upload-cleanup jobs in the worker, and extend the demo data with closed and open registers, expenses (one overdue, one recurring) and a revenue.

**16. Design system review and build log** - Review the screens against the design system checklist and the PRD messages in the three languages, run the schema drift check locally, and record F11 in the build log in both languages.
