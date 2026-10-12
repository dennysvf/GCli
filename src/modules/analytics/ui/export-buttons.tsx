"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/shared/ui/components/button";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { ReportView } from "../application/get-report";
import type { ReportId } from "../application/reports/types";
import { downloadFile } from "./download";
import { toInput, type ReportFilterState } from "./report-options";

const CSV = "csv";
const PDF = "pdf";

type Progress = { kind: "csv"; done: number; total: number } | { kind: "pdf" } | null;

// "Exportar CSV" and "Exportar PDF" (PRD F13): download the result of the last "Gerar". The CSV shows
// the lines received while it streams; a result above a limit disables its button with the advice
// written next to it (design system 5.18).
export function ExportButtons({
  report,
  applied,
  view,
}: {
  report: ReportId;
  applied: ReportFilterState;
  view: ReportView;
}) {
  const t = useTranslations("analytics.reports.ui");
  const format = useFormatters();
  const [progress, setProgress] = useState<Progress>(null);
  const [message, setMessage] = useState<string | null>(null);

  const rows = view.totals.rowCount;
  const csvTooLarge = rows > view.exportLimits.csv;
  const pdfTooLarge = rows > view.exportLimits.pdf;
  const busy = progress !== null;

  async function run(kind: typeof CSV | typeof PDF) {
    setMessage(null);
    setProgress(kind === CSV ? { kind, done: 0, total: rows } : { kind });
    const query = new URLSearchParams({ ...toInput(report, applied), format: kind }).toString();
    const result = await downloadFile(`/api/reports/${report}/export?${query}`, (done, total) => {
      if (kind === CSV) setProgress({ kind, done, total: total || rows });
    });
    setProgress(null);
    setMessage(result.ok ? t("exportDone") : result.message || t("exportFailed"));
  }

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy || rows === 0 || csvTooLarge}
          onClick={() => void run(CSV)}
        >
          {t("exportCsv")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || rows === 0 || pdfTooLarge}
          onClick={() => void run(PDF)}
        >
          {t("exportPdf")}
        </Button>
      </div>
      <p className="text-muted-foreground text-[0.8125rem]" aria-live="polite">
        {progress?.kind === "csv"
          ? t("exportingCsv", { done: format.number(progress.done), total: format.number(progress.total) })
          : progress?.kind === "pdf"
            ? t("exportingPdf")
            : csvTooLarge
              ? t("csvLimit", { max: format.number(view.exportLimits.csv) })
              : pdfTooLarge
                ? t("pdfLimit", { max: format.number(view.exportLimits.pdf) })
                : message}
      </p>
    </div>
  );
}
