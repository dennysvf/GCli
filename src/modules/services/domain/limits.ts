// Service catalog business limits (PRD F03 Capabilities).
// PRD F03: up to 500 services per organization; counted on active services (spec F03 assumptions).
export const MAX_ACTIVE_SERVICES = 500;
// PRD F03: up to 50 categories per organization.
export const MAX_CATEGORIES = 50;

// PRD F03: name max 100 chars, description max 500 chars.
export const SERVICE_NAME_MIN = 2;
export const SERVICE_NAME_MAX = 100;
export const SERVICE_DESCRIPTION_MAX = 500;
// Spec F03 assumptions: category names 1–50 chars.
export const CATEGORY_NAME_MAX = 50;

// PRD F03: duration 5–480 minutes in multiples of 5.
export const DURATION_MIN = 5;
export const DURATION_MAX = 480;
export const DURATION_STEP = 5;

// PRD F03 and F16: price from 0 to 99,999.99 in the currency (zero allowed for free returns).
export const PRICE_MAX_MAJOR = 99_999;

// Upper bound for allowed rooms in one request: 20 units × 30 rooms (PRD F02 limits).
export const ALLOWED_ROOMS_MAX = 600;

// Default categories are catalog messages (services.defaultCategories.*), created in the language of
// the organization; afterwards they are clinic data and are not translated (PRD F16).
export const DEFAULT_CATEGORY_KEYS = ["consultations", "procedures", "therapies"] as const;
