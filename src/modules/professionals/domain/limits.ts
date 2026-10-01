// Business limits of the professionals module (PRD F04 Capabilities), named so rules and messages
// reference one place.

// PRD F04: up to 100 active professionals per organization.
export const MAX_ACTIVE_PROFESSIONALS = 100;
// PRD F04: per unit and weekday, up to 4 intervals per day, 5-minute granularity.
export const MAX_INTERVALS_PER_UNIT_DAY = 4;
export const MINUTE_GRANULARITY = 5;
export const DAY_MINUTES = 1440;
export const WEEK_MINUTES = 7 * DAY_MINUTES;
// PRD F04: time-offs up to 1 year ahead.
export const TIME_OFF_MAX_DAYS_AHEAD = 365;
export const TIME_OFF_MIN_MINUTES = 5;
// F06 reads at most two months of working calendar per call (spec F04 section 5).
export const WORKING_CALENDAR_MAX_DAYS = 62;

export const FULL_NAME_MIN = 3;
export const FULL_NAME_MAX = 150;
export const DISPLAY_NAME_MAX = 60;
export const SPECIALTY_MAX = 100;
export const COUNCIL_NUMBER_MAX = 15;
export const COUNCIL_OTHER_NAME_MIN = 2;
export const COUNCIL_OTHER_NAME_MAX = 20;
export const EMAIL_MAX = 254;
export const TIME_OFF_NOTE_MAX = 200;
