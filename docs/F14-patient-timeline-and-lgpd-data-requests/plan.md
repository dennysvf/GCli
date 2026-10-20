# Implementation Plan: F14. Patient Timeline and LGPD Data Requests

**Prerequisites:**
- F05, F06, F07, F08 and F09 merged on `main`:
  - patients with consents and the visibility policy;
  - appointments with status history;
  - clinical notes with the records policy and the audited read;
  - documents with the clinical flag and the quota;
  - charges, payments and refunds.
- The `patient:read`, `clinical:read`, `billing:operate`, `schedule:read-all`, `schedule:read-own` and `lgpd:manage` actions already in the permission matrix.
- New npm dependencies: `archiver`, `@types/archiver` and `@aws-sdk/lib-storage`.
- Local services from `docker-compose.yml` (PostgreSQL, SeaweedFS, Mailpit), the worker process, and Docker for Testcontainers.
- Branch `feat/F14-patient-timeline-and-lgpd` created from an updated `main`.

### Stage 1: Documentation and foundations

**1. PRD, architecture and design system** - Record the F14 clarifications in the PRD in both languages:
- the request register in the Full Scope;
- newest-first order;
- the Administrator and Manager visibility;
- what anonymization changes and keeps;
- the export layout.

Add ADR-040, the `privacy` arrows of the module graph and the new jobs of section 5.5 to both architecture documents. Add sections 5.20 (Patient timeline) and 5.21 (LGPD requests) to both design system documents.

**2. Privacy module skeleton** - Create the `privacy` module with its public entry point, its catalogs in three languages and the catalog registration in the composition root. Add the "LGPD > Solicitações" sidebar item for Administrators.

**3. Database migration** - Create the request and export tables. Add the anonymization marks and the irreversibility trigger to patients and the erased state to patient documents, with their constraints, indexes and grants. Update the Prisma schema and the truncate list of the integration helpers.

**4. Streamed storage and job plumbing** - Give the shared object storage a streamed multipart upload and a streamed read. Register the new outbox message types, queues, worker handlers and the daily export cleanup schedule.

### Stage 2: Domain rules

**5. Timeline rules** - Define the event kinds and groups, the visibility rules that turn the viewer's access into allowed kinds, the cursor, and the named limits with their PRD references.

**6. LGPD rules** - Implement the request and export entities with their status machines, the overdue rule, the export availability window, the anonymization eligibility rules in their order, the name comparison and the placeholder code, plus the module's error codes.

### Stage 3: Timeline

**7. Timeline reader and gates** - Declare the timeline ports and implement the read-only query that merges the five sources in newest-first order with keyset paging, and the gates over the patients and clinical records public APIs.

**8. Timeline use cases** - Implement the use case that lists one page with role filtering and the audited read of clinical items, and the use case that opens a clinical note through the audited read of the clinical records module.

### Stage 4: Request register and export

**9. Request register use cases** - Implement listing, reading, creating and completing requests, with authorization, validation, the one-open-anonymization rule, the overdue flag and audit events.

**10. Export request and download** - Implement the use case that starts an export in one transaction with its audit event and outbox message. Implement the download, which checks availability, records the audited download and returns a short-lived link.

**11. Export build job** - Implement the patient data reader, the JSON document, the PDF summary on the shared base and the ZIP writer that streams every file into storage. Mark the export ready or failed without ever leaving a partial file, and add the jobs that delete one export file and the expired ones.

### Stage 5: Anonymization

**12. Owning-module steps** - Add the transactional functions that anonymize the patient record, erase the non-clinical uploaded documents (with the quota update and the file deletion job) and clear the appointment notes. Each records its own audit event inside the caller's transaction.

**13. Anonymization use cases** - Implement the preview and the anonymization. The anonymization authorizes, locks the patient, checks the rules again, registers legal retention when clinical records exist, refuses on future appointments, open charges or a mismatched name, and otherwise runs every step, expires the patient's exports and completes the request in one transaction.

### Stage 6: Screens

**14. Timeline tab** - Add the timeline Server Actions and the "Linha do tempo" tab, loaded on first open. Build the filters, the month-grouped list with stamps and disclosures, the clinical expansion, infinite scroll with its keyboard alternative and live count, and the empty, end and error states.

**15. Request register screens** - Add the register list with its filters, overdue stamps and pagination, the "Nova solicitação" side panel, and the request detail page with the history and the action block for each request type.

**16. Export and anonymization interactions** - Build the export block with its generating, failed, available and expired states and the download, and the two-step anonymization dialog with the eligibility preview, the PRD messages and the name confirmation. Show the anonymized and erased states on the patient page and in the Documentos tab.

### Stage 7: Finishing

**17. Demo data and performance checks** - Extend the demo data with a patient that shows every timeline event and with requests in every status. Run the timeline latency check and the 500-file export check, and attach the query plans of the timeline and export reads to the pull request.

**18. Design system review and build log** - Review every new screen against the design system checklist and the PRD texts in the three languages, at 375 px and at 200% zoom. Record F14 in the build log in both languages.
