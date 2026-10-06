// Business limits of the patients module (PRD F05 Capabilities), named so rules and messages
// reference one place.

// PRD F05: up to 10 tags per patient.
export const MAX_TAGS_PER_PATIENT = 10;
// Spec F05 assumptions: sizes of the configurable lists.
export const MAX_ACTIVE_REFERRAL_SOURCES = 30;
export const MAX_ACTIVE_TAGS = 50;
export const LIST_ITEM_NAME_MAX = 40;

// PRD F05: administrative observations up to 2,000 characters.
export const OBSERVATIONS_MAX = 2000;
// PRD F05: full name up to 150 characters.
export const NAME_MAX = 150;
export const NAME_MIN = 3;
export const RG_MAX = 20;
export const OCCUPATION_MAX = 80;
export const EMAIL_MAX = 254;
export const INACTIVE_NOTE_MAX = 200;
export const MAX_AGE_YEARS = 130;

// PRD F05: guardian required for patients under 18 at registration.
export const MAJORITY_AGE = 18;

// PRD F05: search with at least 3 characters, 20 results per page; header search shows 8.
export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_PAGE_SIZE = 20;
export const HEADER_SEARCH_LIMIT = 8;
// PRD F16: a document or a phone is searched from 5 characters.
export const DOCUMENT_SEARCH_MIN_LENGTH = 5;

// Spec F05 (ADR-023): signed term files up to 10 MB; unused uploads deleted after 24 hours.
export const CONSENT_FILE_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_TTL_HOURS = 24;

// Spec F05 assumptions: privacy terms text length.
export const TERMS_TEXT_MIN = 50;
export const TERMS_TEXT_MAX = 20_000;
