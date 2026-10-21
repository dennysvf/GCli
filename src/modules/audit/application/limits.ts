// Named limits of the audit log viewer (spec F15 section 4).

// PRD F15: the result table is paginated 100 per page.
export const AUDIT_PAGE_SIZE = 100;

// PRD F15: a query covers at most 366 days.
export const AUDIT_MAX_PERIOD_DAYS = 366;

// PRD F15: the CSV export accepts up to 100,000 rows.
export const AUDIT_CSV_MAX_ROWS = 100_000;

// Spec F15 decision D3: the count stops one row past the export limit, so the work per search is
// bounded and the screen still knows whether the export is allowed.
export const AUDIT_COUNT_CAP = AUDIT_CSV_MAX_ROWS + 1;

// Spec F15 decision D8: the CSV is streamed in keyset batches of this size (ADR-038).
export const AUDIT_EXPORT_BATCH_SIZE = 2_000;

// Spec F15 decision D4: without dates the viewer shows the last 30 days, including today.
export const AUDIT_DEFAULT_PERIOD_DAYS = 30;
