// Business limits of the patient timeline and the LGPD requests (PRD F14).

// PRD F14: the timeline loads 50 events per page (infinite scroll).
export const TIMELINE_PAGE_SIZE = 50;
// PRD F14: a timeline page answers in at most 2 seconds at p95.
export const TIMELINE_P95_MS = 2_000;

// PRD F14: requests pending for more than 15 days are highlighted.
export const LGPD_OVERDUE_DAYS = 15;
// The register lists 50 requests per page (design system 5.21).
export const REQUESTS_PAGE_SIZE = 50;

// PRD F14: every request records its description (also the reason of an export) and a correction
// is closed with its resolution; both take 10 to 2,000 characters.
export const REQUEST_DESCRIPTION_MIN = 10;
export const REQUEST_DESCRIPTION_MAX = 2_000;
export const RESOLUTION_MIN = 10;
export const RESOLUTION_MAX = 2_000;

// PRD F14: the export stays available for download for 7 days.
export const EXPORT_AVAILABILITY_DAYS = 7;
export const EXPORT_AVAILABILITY_MS = EXPORT_AVAILABILITY_DAYS * 24 * 60 * 60 * 1000;
// PRD F14: an export is generated in at most 5 minutes for a patient with up to 500 files.
export const EXPORT_TIME_BUDGET_MS = 300_000;
export const EXPORT_FILE_TARGET = 500;
// ADR-009: download links are valid for 5 minutes.
export const EXPORT_LINK_SECONDS = 300;

// PRD F14: the placeholder "Paciente anonimizado #A1B2C3" carries 6 hexadecimal characters.
export const ANONYMIZATION_CODE_LENGTH = 6;
