"use client";

import type { ReportSummaryView } from "../application/get-report";
import { ReportTable } from "./report-table";

// The small tables above a report: by reason and by professional, subtotals, aging buckets.
export function ReportSummaries({ summaries }: { summaries: ReportSummaryView[] }) {
  if (summaries.length === 0) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {summaries.map((summary) => (
        <section key={summary.key} className="grid gap-2" aria-label={summary.title}>
          <h2 className="group-title">{summary.title}</h2>
          <ReportTable caption={summary.title} columns={summary.columns} rows={summary.rows} />
        </section>
      ))}
    </div>
  );
}
