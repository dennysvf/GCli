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
