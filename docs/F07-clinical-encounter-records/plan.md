# Implementation Plan: F07. Clinical Encounter Records

**Prerequisites:**
- F01 through F06 and F16 implemented, including the port registry (ADR-022), the scheduling public API and the module catalogs (ADR-028).
- Local services running: `docker compose up -d` (PostgreSQL and SeaweedFS).
- New npm dependencies: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `sanitize-html` (with its types) and `heic-convert`.
- New optional environment variable `S3_PUBLIC_ENDPOINT`, the storage URL that browsers can reach. It defaults to `S3_ENDPOINT`. Locally it is `http://localhost:8333`. In production it is the R2 public S3 endpoint.
- A CORS rule on the bucket that allows `PUT` and `GET` from `APP_URL`, both in SeaweedFS locally and in R2.
- Reference documents: `docs/prd.en.md` (F01 permission matrix, F06, F07, F14), `docs/architecture.en.md` (sections 3, 5.2, 5.3, 5.5, 5.6 and 6; ADR-009, ADR-022, ADR-023, ADR-027, ADR-028), `docs/design-system.en.md`, and this folder's `spec.md`.

### Stage 1: Documentation and Shared Foundations

**1. PRD and architecture decisions** - Update PRD F07 in both languages with auto-finalization of expired drafts, clinical alerts as an F07 record, and attachments only while the note is editable. Add ADR-031 (direct presigned uploads for clinical attachments, with the CSP, CORS and public endpoint changes) and ADR-032 (note storage as sanitized HTML, the database lock trigger, edit drafts and versions) to both language versions of the architecture document.

**2. Design system record patterns** - Extend both language versions of the design system with the record page patterns the spec introduces. These are the split-screen record layout, the rich text editor and its toolbar, the save status line and offline banner, the attachment drop zone with progress and thumbnails, the clinical alert stamp, and addenda below a note.

**3. Storage, configuration and security headers** - Extend the shared object storage with ranged reads, presigned uploads with a signed size, and signing against the public endpoint. Add the optional public endpoint variable, the storage origin in the CSP, and the local SeaweedFS CORS setup in Docker Compose.

**4. Dependencies and module skeleton** - Install the new dependencies. Create the `clinical-records` module folders, the three message catalogs, the client entry point and the public API file, and register the catalog in the composition root.

### Stage 2: Data Model and Domain

**5. Schema and migration** - Add the tables for notes, versions, addenda, attachments, upload intents, alerts and alert history. Include the partial unique index, the CHECKs, the lock trigger and the grants described in the spec. Register the tables in the tenant scope and in the test reset helper.

**6. Clinical note entity** - Implement the note lifecycle: draft saves, finalization, the edit draft with publish and discard, auto-finalization and the effective state at a given instant. Define the module's limits as named constants with PRD references.

**7. Eligibility, addenda and attachment rules** - Implement the rules for creating notes (appointment status, professional match, standalone eligibility), the addendum rules, and the attachment rules for types by magic bytes, the per-note limit and the in-error window. Define the module's errors and events.

### Stage 3: Use Cases and Integrations

**8. Ports, repositories and adapters** - Define the module ports. Implement the Prisma repositories with the version check and the mapping of the lock trigger and unique violations. Implement the HTML sanitizer, the attachment storage, the image processor and the directory over the public APIs of scheduling, patients, professionals and identity.

**9. Scheduling additions** - Add the scheduling read functions that F07 needs, which are not filtered by the own agenda. Add the clinical note lookup port with an inert default, and the note state in appointment details for users with clinical read access.

**10. Access policy and reads** - Implement the patient records access policy with audited denials. Implement the record page query, the paginated notes list, the note read, the versions and the patient tab list, each with its read audit.

**11. Note writing use cases** - Implement draft saving with creation on the first save, finalization, starting, saving, publishing and discarding edits, and addenda. All of them are authorized, audited without clinical text, and publish their events.

**12. Attachments and alerts** - Implement upload intents, confirmation with magic-byte checks and job enqueueing, marking an attachment in error, opening an attachment through a short-lived URL, and clinical alert updates with history.

**13. Worker jobs and port registration** - Implement attachment processing (HEIC conversion and thumbnails), auto-finalization of expired drafts and cleanup of unused upload intents, and register their queues and schedules in the worker. Register the clinical note lookup port in the composition root.

### Stage 4: Record Screens

**14. Routes and actions** - Create the record page with its URL parameters and the 403 handling, the Server Actions, the upload intent route and the attachment download route.

**15. Record layout, header and notes list** - Build the split-screen record view, the patient header with the alert stamp and its edit dialog, and the list of previous notes with previews, states and loading more.

**16. Editor, autosave and offline backup** - Build the Tiptap editor with the allowed formatting and the character counter, the save status line, autosave on interval, blur and hidden page, the browser backup with retry and recovery, and the edit mode for finalized notes. Clear the backups on sign-out.

**17. Reader, addenda and versions** - Build the read-only view with the lock message, the addendum form and list, and the versions dialog.

**18. Attachments area** - Build the drop zone with client-side checks, per-file upload progress straight to storage, confirmation, thumbnails and the processing state, and the in-error marking with the hidden attachments toggle.

### Stage 5: Entry Points

**19. Patient page** - Add the "Prontuário" tab and the "Abrir prontuário" header action to the patient page, shown only to users who pass the records policy.

**20. Agenda panel** - Add "Abrir prontuário" to the appointment panel for valid statuses or when a note exists, and the reminder after Concluído when the note is not finalized. Wire the record link and permission from the agenda page.
