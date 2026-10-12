export type DownloadResult = { ok: true } | { ok: false; message: string };

// Downloads a file from an export endpoint and saves it with the name the server chose. For a CSV
// the lines received are reported while the stream arrives (spec F13 decision D7).
export async function downloadFile(
  url: string,
  onProgress?: (lines: number, total: number) => void,
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
      onProgress?.(Math.max(0, newlines - 1), total);
    }
  } else {
    chunks.push(await response.blob());
  }

  const fileName =
    /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? "report";
  const blob = new Blob(chunks, { type: response.headers.get("Content-Type") ?? "application/octet-stream" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
  return { ok: true };
}
