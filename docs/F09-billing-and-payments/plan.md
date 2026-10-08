# Implementation Plan: F09. Billing and Payments

**Prerequisites:**
- F01, F02, F03, F04, F05, F06, F08 and F16 merged on `main`. Billing uses:
  - the identity, units, services, patients and professionals public APIs;
  - the scheduling check-in events with the price snapshot;
  - the shared PDF base of ADR-024;
  - the country profiles with payment methods and `Money`.
- Node.js and the dependencies already in the repository (`@react-pdf/renderer`, `@node-rs/argon2`, `zod`, `next-intl`). No new package is needed.
- Local services from `docker-compose.yml` (PostgreSQL 18) and Docker for Testcontainers.
- Branch `feat/F09-billing-and-payments` created from an updated `main`.

### Stage 1: Documentation and shared foundations

**1. PRD, architecture and design system** - Update PRD F09 in both languages with the interview answers listed in the spec, and add ADR-034 and the new module dependencies to the architecture documents. Add the billing patterns to the design system in both languages: charge status stamps, the receive modal with payment lines, the PIN approval fields and the totals footer.

**2. Handler rejection** - Let a domain-event handler reject the operation that published the event with a domain error. The transaction then returns that error as a failed result instead of failing the request.

**3. Approval PIN in identity** - Add the personal approval PIN for Managers and Administrators: set it with the current password, verify it with lockout and audit, list the approvers, and clear it on deactivation or role change. Add the "PIN de aprovação" dialog to the user menu.

**4. Unit country lock port** - Add the units port that reports financial records in a unit, with an inert default, so a unit with charges cannot change its country once billing registers it.

### Stage 2: Data model and domain

**5. Migration and Prisma schema** - Create the charge, payment, submission, discount request, number sequence and disabled method tables, plus the PIN columns on users. Include the constraints, partial unique indexes, composite foreign keys and grants described in the spec, and register the new tables in the tenant-scoped client.

**6. Billing domain** - Implement the limits, the discount math with its thresholds, the charge aggregate with its derived status and commands, the domain errors and the billing events, all pure and unit tested.

**7. Module skeleton and ports** - Create the billing application ports, schemas, policies and directory over the other modules' public APIs. Add the repository adapter with row locking and the number sequence, the default exemption and cash register implementations, the pt-BR, en and es catalogs, and the public API with test adjustment. Wire them in the composition root.

### Stage 3: Charges, discounts and payments

**8. Automatic charges** - Subscribe billing to the check-in and undo events: create the charge with the price snapshot unless the price is zero or the exemption policy applies, and delete it on undo or reject the undo when it has payments.

**9. Manual charges and payment methods** - Implement manual charges for a service or a free description, the package-origin entry point for F10, and the payment method settings per country with at least one method enabled.

**10. Discounts and approvals** - Implement setting and removing discounts with the reason and approval thresholds, inline approval with an approver PIN, sending for approval, the pending list, approving and rejecting.

**11. Receiving payments** - Implement the receive use case with the optional discount, multiple lines, idempotent submissions, the overpayment check under lock, unit and currency rules, backdating, installments, the cash register gate, audit and events.

**12. Refunds and voids** - Implement partial and total refunds as negative movements in the selected unit, and voids of charges without active payments, both with mandatory reasons, audit and events.

**13. Queries and receipt** - Implement the charge reads for the agenda, the patient tab, the detail and the filtered list with totals per currency. Implement the receipt PDF layout and the receipt route with the time target.

### Stage 4: Screens

**14. Agenda section and receive modal** - Add the "Cobrança" section to the agenda panel through the route-level composition, and the receive modal with the discount, approval, payment lines, live balance, toast and receipt printing.

**15. Patient Financeiro tab** - Add the patient tab with open charges and the total due at the top, the history with payments, and "Nova cobrança".

**16. Financeiro pages** - Add the navigation group, the charges list with filters, pagination and totals, the charge detail with discount, refund, void and receipt actions, and the approvals list with approve and reject.

**17. Settings page** - Add the "Financeiro" settings entry with the payment methods panel per country used by the organization's units.

### Stage 5: Finishing

**18. Demo data** - Extend the local demo data with charges in every status, a pending discount, a refund and a manager with an approval PIN, so every screen can be explored locally.

**19. Design system review and build log** - Review every new screen against the design system checklist and the PRD messages in the three languages, and record F09 in the build log in both languages.
