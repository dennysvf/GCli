// Business limits of PRD F12, as named constants.

// PRD F12: a custom period covers at most 366 days.
export const MAX_DASHBOARD_DAYS = 366;

// PRD F12: data freshness up to 5 minutes; cached aggregates are acceptable (ADR-037).
export const DASHBOARD_CACHE_TTL_MS = 5 * 60_000;
// Bounds the memory of the in-process cache (spec F12, decision D5).
export const DASHBOARD_CACHE_MAX_ENTRIES = 500;

// Spec F12 decision D7: a change is highlighted from 5% (counts and money) or 2 percentage points
// (rates).
export const SIGNIFICANT_CHANGE_PERCENT = 5;
export const SIGNIFICANT_CHANGE_POINTS = 2;

// PRD F13: reports cover at most 366 days, as the dashboard.
export const MAX_REPORT_DAYS = 366;
// PRD F13: on-screen pagination of 50 rows.
export const REPORT_PAGE_SIZE = 50;
// PRD F13: CSV up to 50,000 rows; PDF up to 5,000 rows (above that the user is advised to use CSV).
export const CSV_MAX_ROWS = 50_000;
export const PDF_MAX_ROWS = 5_000;
// Spec F13 decision D5: rows read per query while an export is streamed.
export const EXPORT_BATCH_SIZE = 2_000;

// PRD F13 receivables: aging buckets by days open; the last one has no upper bound.
export const AGING_BUCKETS = [
  { id: "D0_30", from: 0, to: 30 },
  { id: "D31_60", from: 31, to: 60 },
  { id: "D61_90", from: 61, to: 90 },
  { id: "D90_PLUS", from: 91, to: null },
] as const;
