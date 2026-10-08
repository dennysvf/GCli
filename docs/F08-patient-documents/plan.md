# Implementation Plan: F08. Patient Documents

**Prerequisites:**
- F01, F02, F04, F05, F07 and F16 merged on `main` (organization profile, unit contact, professional credentials, patient identity, the clinical records policy, the direct-upload flow of ADR-031, and the shared PDF base of ADR-024).
- Node.js and the dependencies already in the repository: `@react-pdf/renderer`, `@aws-sdk/client-s3` and `s3-request-presigner`, `@tiptap/*`, `sanitize-html`, `heic-convert`, `sharp`, `pg-boss`. No new package is needed.
- Environment: the existing `S3_*` variables and `S3_PUBLIC_ENDPOINT`. The bucket CORS rule from `npm run setup:storage-cors` already allows `PUT` and `GET` from `APP_URL`.
- Local services from `docker-compose.yml` (PostgreSQL 18, SeaweedFS with `-s3.allowedOrigins`), and Docker for Testcontainers.
- Branch `feat/F08-patient-documents` created from an updated `main`.

### Stage 1: Documentation and shared foundations

**1. PRD, architecture and design system** - Update PRD F08 in both languages with the interview answers listed in the spec (quota scope, default clinical categories, the one-way clinical flag, restoring and correcting, the 80% alert, the signer of clinical templates). Add ADR-033 and the new module dependencies to the architecture documents, and add the Documents tab, upload dialog, emission dialog and template editor patterns to the design system, all in both languages.

**2. Shared code extraction** - Move magic-byte detection, the image processor, the HTML sanitizer and the Tiptap editor from the clinical records module into `src/shared`, so F07 and F08 share them. F07 then imports the shared versions with unchanged behavior.

**3. Storage, PDF and security helpers** - Extend the object storage range read with an offset or a suffix and add the DOCX check to file type detection. Add the converter from the sanitized HTML subset to PDF elements, and add the storage origin to the CSP `frame-src`.

**4. Permissions, outbox and queues** - Add the four document actions to the permission matrix and register the new outbox message types and pg-boss queues. Add the provided identity read that lists administrator contacts for the quota email.

### Stage 2: Data model and module skeleton

**5. Migration and Prisma schema** - Create the categories, documents, upload intents, templates and storage usage tables with the constraints, unique indexes, clinical-flag trigger, grants and usage backfill described in the spec. Register the new tables in the tenant-scoped client.

**6. Module skeleton** - Create the `documents` module with its limits, pure helpers for template variables, quota math and the clinical flag rule, error factories, schemas, events, dependencies and directory over the other modules' public APIs. Add the pt-BR, en and es catalogs and register the catalog in the composition root.

**7. Access policies** - Implement the patient-document policies that combine the permission matrix, patient visibility and the F07 clinical rule, and that record every denial.

### Stage 3: Uploads, listing and corrections (Core Scope)

**8. Categories** - Implement the default categories created on first use in the organization's language, plus listing, creating, renaming, activating, and the clinical flag change that propagates to existing documents in one direction only.

**9. Storage usage** - Implement the usage read and the usage charge with the row lock, the quota enforcement for uploads, and the 80% alert that queues one email per crossing. Add the email template.

**10. Upload intents and confirmation** - Implement the intent route and the confirmation use case following the F07 flow, including real type detection, quota enforcement, idempotent confirmation, deletion of refused objects, audit and events.

**11. File processing and cleanup jobs** - Add the worker handlers that convert HEIC files and count the converted bytes, mark files that fail after the retries, and remove unconfirmed intents and their objects every day.

**12. Listing, opening, editing, archiving and restoring** - Implement the paged list with filters, clinical filtering and list audit; the download route with audited 5-minute URLs; and the correction, archive and restore use cases with their audit and events.

**13. Documents tab and upload dialog** - Add the "Documentos" tab to the patient page, with the table, filters, "Mostrar arquivados", the preview modal, the edit and archive dialogs, and the upload dialog with per-file category, progress, retry, the 20-file limit and the quota notice.

### Stage 4: Templates and PDF generation (Full Scope)

**14. Templates** - Implement the default templates per language and the template use cases: listing (including the list of templates a user can generate for a patient), creating, editing and activating, with sanitizing, variable validation and the limit of 50 active templates.

**15. Variable resolvers** - Implement the registry of resolvers for patient, professional, unit, organization, date and free-field variables. It returns the resolved values, their labels and the missing items.

**16. PDF layout and generation** - Build the document PDF layout on the shared base, then implement preview and generation with the signer rule, the missing-value confirmation, the timeout, the storage write and the single transaction that records the document and the usage, with cleanup on any failure.

**17. Emission dialog** - Add "Emitir documento" with template, professional and unit selection, free fields, the live preview with highlighted missing values, the confirmation, and the new tab that opens the generated PDF.

**18. Settings page** - Add the "Documentos" settings entry with the categories panel, the templates table, the storage usage, and the template editor pages with the variable menu and free fields.

### Stage 5: Finishing

**19. Demo data** - Extend the local demo data with a few uploaded and generated documents, a clinical category in use, and the default templates, so every screen can be explored locally.

**20. Design system review and build log** - Review every new screen against the design system checklist and the PRD messages in the three languages, and record F08 in the build log.
