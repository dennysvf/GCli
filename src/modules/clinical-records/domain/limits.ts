// Business limits of the clinical-records module (PRD F07 Capabilities), named so rules, messages
// and the database constraints reference one place.

// PRD F07: rich text up to 50,000 characters; addenda up to 10,000 characters each.
export const NOTE_MAX_CHARACTERS = 50_000;
export const ADDENDUM_MAX_CHARACTERS = 10_000;
// Spec F07: the stored HTML is capped at four times the text limit, so markup cannot inflate a note.
export const HTML_BYTES_PER_CHARACTER = 4;
export const NOTE_MAX_HTML_BYTES = NOTE_MAX_CHARACTERS * HTML_BYTES_PER_CHARACTER;
export const ADDENDUM_MAX_HTML_BYTES = ADDENDUM_MAX_CHARACTERS * HTML_BYTES_PER_CHARACTER;

// PRD F07: a note is editable by its author for 24 hours after its creation, then locked for good.
export const LOCK_WINDOW_MS = 24 * 60 * 60 * 1000;
// PRD F07: an attachment added by mistake can be marked within 24 hours.
export const IN_ERROR_WINDOW_MS = 24 * 60 * 60 * 1000;
// PRD F07: autosave every 10 seconds and on blur; PRD Error Handling: retry every 15 seconds.
export const AUTOSAVE_INTERVAL_MS = 10_000;
export const AUTOSAVE_RETRY_MS = 15_000;
// Spec F07: autosaves of the same note and author are audited at most once per minute.
export const AUTOSAVE_AUDIT_INTERVAL_MS = 60_000;

// PRD F07: PDF, JPG, PNG and HEIC up to 20 MB per file, up to 10 files per note.
export const ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const ATTACHMENT_MAX_PER_NOTE = 10;
export const FILE_NAME_MAX = 255;
// PRD F07: clinical files are served through URLs that expire after 5 minutes.
export const SIGNED_URL_SECONDS = 300;
// Spec F07: upload intents expire after 24 hours; the daily job removes the unused ones.
export const UPLOAD_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
export const THUMBNAIL_SIZE = 320;

// PRD F07 Experience: the list of previous notes shows the first 150 characters.
export const PREVIEW_CHARACTERS = 150;
export const LIST_PAGE_SIZE = 30;
// Spec F07: a patient's clinical alert has up to 500 characters.
export const ALERT_MAX_CHARACTERS = 500;
