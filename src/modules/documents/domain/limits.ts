// Business limits of the documents module (PRD F08 Capabilities), named so rules, messages and the
// database constraints reference one place.

// PRD F08: PDF, JPG, PNG, HEIC and DOCX up to 20 MB each and up to 20 files per upload action.
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_UPLOAD = 20;
export const FILE_NAME_MAX = 255;
export const TITLE_MAX = 200;

// PRD F08: organization storage quota of 50 GB, with an alert at 80%.
export const QUOTA_BYTES = 50 * 1024 * 1024 * 1024;
export const QUOTA_GB = 50;
export const QUOTA_ALERT_PERCENT = 80;

// PRD F08: up to 50 templates. Spec F08: categories are capped so the selects stay usable.
export const MAX_ACTIVE_TEMPLATES = 50;
export const MAX_ACTIVE_CATEGORIES = 30;
export const CATEGORY_NAME_MAX = 60;
export const TEMPLATE_NAME_MAX = 120;
// Spec F08: a template body has at most 20,000 characters of text; the HTML is capped at four times.
export const TEMPLATE_MAX_CHARACTERS = 20_000;
export const TEMPLATE_MAX_HTML_BYTES = TEMPLATE_MAX_CHARACTERS * 4;
export const FIELD_VALUE_MAX = 200;
export const FIELD_NAME_PATTERN = /^[a-z0-9_]{1,40}$/;

// Spec F08: an archive reason of 3 to 500 characters.
export const ARCHIVE_REASON_MIN = 3;
export const ARCHIVE_REASON_MAX = 500;

// PRD F08 (same rule as F07): files are served through URLs that expire after 5 minutes.
export const SIGNED_URL_SECONDS = 300;
// Spec F08: upload intents expire after 24 hours; the daily job removes the unused ones.
export const UPLOAD_INTENT_TTL_MS = 24 * 60 * 60 * 1000;
export const PAGE_SIZE = 50;

// PRD F08: the PDF is generated in 5 seconds or less; a render that takes longer is given up.
export const GENERATION_TARGET_MS = 5_000;
export const GENERATION_TIMEOUT_MS = 15_000;
