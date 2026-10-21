"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/shared/ui/components/button";

type DownloadResult = { ok: true } | { ok: false; message: string };

// Downloads the CSV with the name the server chose, reporting the lines received while the stream
// arrives (the F13 pattern, spec F15 decision D8).
async function downloadCsv(
  url: string,
  onProgress: (lines: number, total: number) => void,
): Promise<DownloadResult> {
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin" });
  } catch {
    return { ok: false, message: "" };
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, message: body?.message ?? "" };
  }
  const total = Number(response.headers.get("X-Report-Rows") ?? 0);
  const chunks: BlobPart[] = [];
  const reader = response.body?.getReader();
  if (reader) {
    let newlines = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value.slice());
      for (const byte of value) if (byte === 10) newlines += 1;
      // The first line is the header.
      onProgress(Math.max(0, newlines - 1), total);
    }
  } else {
    chunks.push(await response.blob());
  }
  const fileName =
    /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "audit.csv";
  const href = URL.createObjectURL(
    new Blob(chunks, { type: response.headers.get("Content-Type") ?? "text/csv" }),
  );
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  return { ok: true };
}

// "Exportar CSV", the one primary button of the viewer (design system 5.19). Disabled with its reason
// written next to it when nothing matches or the result is above the 100,000-row limit.
export function AuditExportButton({
  query,
  count,
  capped,
  limit,
  disabled,
}: {
  query: string;
  count: number;
  capped: boolean;
  limit: number;
  disabled: boolean;
}) {
  const t = useTranslations("audit.export");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const tooLarge = capped || count > limit;
  const empty = count === 0;
  const busy = progress !== null;

  async function run() {
    setMessage(null);
    setProgress({ done: 0, total: count });
    const result = await downloadCsv(`/api/audit/export?${query}`, (done, total) =>
      setProgress({ done, total: total || count }),
    );
    setProgress(null);
    setMessage(result.ok ? t("done") : result.message || t("failed"));
  }

  const reason = tooLarge ? t("limit", { limit }) : empty ? t("empty") : null;
  return (
    <div className="grid justify-items-end gap-1">
      <Button type="button" disabled={disabled || busy || empty || tooLarge} onClick={() => void run()}>
        {t("button")}
      </Button>
      <p className="text-muted-foreground max-w-md text-right text-[0.8125rem]" aria-live="polite">
        {progress ? t("progress", { done: progress.done, total: progress.total }) : (reason ?? message)}
      </p>
    </div>
  );
}
