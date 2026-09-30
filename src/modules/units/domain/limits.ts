// Units business limits (PRD F02 Capabilities). Counted on active records (spec F02 assumptions).
export const MAX_ACTIVE_UNITS = 20;
export const MAX_ACTIVE_ROOMS_PER_UNIT = 30;
export const MAX_FUTURE_CLOSURES_PER_UNIT = 100;

export const UNIT_NAME_MAX = 80;
export const ROOM_NAME_MAX = 50;
export const ROOM_DESCRIPTION_MAX = 200;
export const CLOSURE_REASON_MAX = 120;
// A closure spans at most 366 days (spec F02 section 6).
export const CLOSURE_MAX_DAYS = 366;
