// Business limits of the scheduling module (PRD F06 Capabilities), named so rules and messages
// reference one place.

// PRD F06: duration editable 5–480 minutes in multiples of 5.
export const DURATION_MIN = 5;
export const DURATION_MAX = 480;
export const DURATION_STEP = 5;
// PRD F06: notes for the front desk, max 500 characters.
export const NOTES_MAX = 500;
// PRD F06: undo check-in within 30 minutes; spec F06: the professional reverts a completion
// within 30 minutes too.
export const UNDO_WINDOW_MINUTES = 30;
// Spec F06 assumptions: justification for exceptions and completion reversal.
export const JUSTIFICATION_MIN = 10;
export const JUSTIFICATION_MAX = 500;
// PRD F06: cancellation note is optional text; spec F06: up to 500 characters.
export const CANCELLATION_NOTE_MAX = 500;
// PRD F06 recurrence: 1–6 weekdays, up to 52 occurrences or 12 months ahead.
export const SERIES_MIN_WEEKDAYS = 1;
export const SERIES_MAX_WEEKDAYS = 6;
export const SERIES_MIN_OCCURRENCES = 2;
export const SERIES_MAX_OCCURRENCES = 52;
export const SERIES_MAX_MONTHS = 12;
// PRD F06: "Próximo horário livre" finds the next 10 slots within 60 days.
export const AVAILABILITY_MAX_SLOTS = 10;
export const AVAILABILITY_MAX_DAYS = 60;
// PRD F06: Day view shows up to 20 columns; List view pages of 50.
export const DAY_VIEW_MAX_COLUMNS = 20;
export const LIST_PAGE_SIZE = 50;
// Design system 10.1: "atrasado" after 10 minutes without check-in.
export const LATENESS_MINUTES = 10;
// PRD F06: changes by other users appear within 30 seconds (polling).
export const POLLING_INTERVAL_MS = 30_000;
// Agenda and list queries cover at most 62 days, like the F04 working calendar.
export const AGENDA_MAX_DAYS = 62;
// Spec F06: cancellation reasons, 1–60 characters, at most 30 active.
export const REASON_NAME_MAX = 60;
export const MAX_ACTIVE_REASONS = 30;
export const DAY_MINUTES = 1440;
