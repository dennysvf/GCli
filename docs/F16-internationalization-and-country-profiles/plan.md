# Implementation Plan: F16. Internationalization and Country Profiles

**Prerequisites:**
- F01 through F06 implemented and merged.
- Local services running: `docker compose up -d`.
- New npm dependencies: `next-intl`, `libphonenumber-js` and the development dependency `eslint-plugin-i18next`.
- No new environment variables and no new external services.
- Reference documents: `docs/prd.en.md` (F16 and the updated F01–F05, F09, F13), `docs/architecture.en.md` (sections 4, 5.7, 5.8; ADR-010, ADR-015, ADR-019, ADR-021), `docs/design-system.en.md` (section 7) and this folder's `spec.md`.

### Stage 1: Decisions and i18n Foundation

**1. Architecture, conventions and design system** - Add ADR-028 (internationalization with next-intl and message catalogs), ADR-029 (country profiles, money with currency and generic personal data) and ADR-030 (daylight-saving-correct calendar, superseding ADR-021) to both language versions of the architecture document. Update the CLAUDE.md conventions about UI text, messages and money, and extend both language versions of the design system with the language, glossary and per-locale number rules.

**2. i18n core and next-intl setup** - Install the new dependencies and create the shared i18n module with the supported locales, locale negotiation, the server translator, the kernel formatters and the shared catalogs. Configure next-intl without locale routing and add the catalog completeness check.

**3. Locale in the request and the shell** - Resolve the user's locale with the session, set the document language and the client message provider in the root layout, and translate the application shell, the navigation and the public pages, including the language selector on the login page and in the user menu.

### Stage 2: Country Profiles and Kernel

**4. Country profiles** - Create the typed registry with the eight country profiles described in the spec, including currencies, tax IDs, identity documents, address rules, phone codes, councils, payment methods, time zones and the legal-validation flag.

**5. Personal data validators** - Implement the identity document, tax ID, phone and address validators and formatters driven by the profiles, keeping the Brazilian CPF and CNPJ rules.

**6. Money with currency** - Extend the money value object with its currency and per-locale parsing and formatting, refuse arithmetic across currencies, and add the per-currency totals helper.

**7. Daylight-saving-correct time** - Fix the wall-clock conversions with the gap and overlap rules of the spec and route every local date and time conversion through them.

### Stage 3: Data Model and Module Contracts

**8. Schema and migration** - Add the locale, country, currency, generic document, phone and address columns, the service price and professional registration tables, and the constraints and indexes of the spec, migrating every existing record as Brazil before the old columns are dropped.

**9. Errors and validation as message keys** - Change domain errors, field errors and the Zod schemas of every module to carry message keys, and translate them at the boundary in the requester's language.

**10. Organization, users and emails** - Add the headquarters country, default language and tax ID to the organization settings, the user language preference and the invitation language, and render emails in the recipient's language.

**11. Units** - Add the country, currency, tax ID and generic address to units, lock the country once a unit has appointments, warn about services without a price in a new currency, and show the legal banner.

**12. Services and scheduling prices** - Move service prices to one price per currency with history, and make booking snapshot the price and currency of the unit.

**13. Professionals** - Replace the CPF and council fields with the identity document and the registrations per country, require a registration in each unit's country, and compare cross-unit working hours on concrete dates.

**14. Patients** - Replace the CPF, guardian CPF, Brazilian phones and address with their country-driven versions, and adapt duplicate detection, search and masking to any document type.

### Stage 4: Translated Screens and Outputs

**15. Catalog extraction per module** - Move every interface text of the identity, units, services, professionals, patients and scheduling screens into their catalogs, with the English and Spanish translations following the glossary, and format dates, numbers and money with the user's locale.

**16. Agenda findings and PDF** - Send conflict findings as codes and parameters translated in the browser, format their times in the requester's locale, and render the daily agenda PDF in the requester's language.

**17. Country-driven forms** - Build the document, tax ID, phone, address and money inputs that follow the country, and use them in the organization, unit, service, professional and patient forms.

**18. Literal text lint** - Enable the rule that rejects literal text in interface components and remove every remaining violation.
