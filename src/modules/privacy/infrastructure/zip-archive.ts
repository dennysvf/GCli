import archiver, { type Archiver } from "archiver";
import { Transform } from "node:stream";
import { objectStorage } from "@/shared/storage/object-storage";
import { EXPORT_LINK_SECONDS } from "../domain/limits";
import { ExportBuildError, type ExportArchive } from "../application/ports";

// The export ZIP (spec decision D13): archiver streams every entry into a multipart upload, reading
// the stored files one at a time, so memory stays bounded for 500 files of up to 20 MB. ZIP64 is
// used automatically past 4 GB. JSON and PDF are deflated; stored files are kept as they are (they
// are usually compressed already). Any failure aborts the upload, so no object is ever left behind.

const DEFLATE_LEVEL = 6;

function asBuildError(error: unknown): ExportBuildError {
  return error instanceof ExportBuildError ? error : new ExportBuildError("STORAGE_ERROR");
}

// Resolves once archiver has written the entry, rejects on an archive error, on the time budget or
// when the upload already failed (otherwise a stalled upload would hang the archive forever).
function entryWritten(archive: Archiver, signal: AbortSignal, uploadFailed: Promise<never>): Promise<void> {
  const written = new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      archive.off("entry", onEntry);
      archive.off("error", onError);
      signal.removeEventListener("abort", onAbort);
    };
    const onEntry = () => {
      cleanup();
      resolve();
    };
    const onError = (error: unknown) => {
      cleanup();
      reject(asBuildError(error));
    };
    const onAbort = () => {
      cleanup();
      reject(new ExportBuildError("TIME_BUDGET_EXCEEDED"));
    };
    archive.once("entry", onEntry);
    archive.once("error", onError);
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
  return Promise.race([written, uploadFailed]);
}

export const zipExportArchive: ExportArchive = {
  async write(key, entries, options) {
    const storage = objectStorage();
    const archive = archiver("zip", { zlib: { level: DEFLATE_LEVEL } });
    let sizeBytes = 0;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        callback(null, chunk);
      },
    });
    // Errors are handled where each entry is awaited; these listeners only keep an error emitted
    // between entries (or after an abort) from crashing the worker.
    archive.on("error", () => undefined);
    archive.on("warning", () => undefined);
    counter.on("error", () => undefined);
    archive.pipe(counter);
    const uploadControl = new AbortController();
    const stopUpload = () => uploadControl.abort();
    options.signal.addEventListener("abort", stopUpload, { once: true });
    const upload = storage.putStream(key, counter, "application/zip", { signal: uploadControl.signal });
    const uploadFailed = upload.then(
      () => new Promise<never>(() => undefined),
      (error: unknown) => Promise.reject(asBuildError(error)),
    );
    // The race above may lose to a later failure; it is observed here so it is never unhandled.
    uploadFailed.catch(() => undefined);

    try {
      for (const entry of entries) {
        if (options.signal.aborted) throw new ExportBuildError("TIME_BUDGET_EXCEEDED");
        if (entry.kind === "content") {
          archive.append(Buffer.from(entry.body), { name: entry.name, store: !entry.compress });
        } else {
          const body = await storage.getStream(entry.objectKey).catch((error: unknown) => {
            throw asBuildError(error);
          });
          if (!body) throw new ExportBuildError("FILE_MISSING");
          archive.append(body, { name: entry.name, store: true });
        }
        await entryWritten(archive, options.signal, uploadFailed);
      }
      await Promise.race([archive.finalize(), uploadFailed]);
      await Promise.race([upload, uploadFailed]);
      return { sizeBytes };
    } catch (error) {
      archive.abort();
      counter.destroy(new Error("export aborted"));
      uploadControl.abort();
      await upload.catch(() => undefined);
      // Belt and braces: a completed single-part upload cannot race the abort, but if one did, the
      // object is removed so a partial file is never offered.
      await storage.delete(key).catch(() => undefined);
      throw asBuildError(error);
    } finally {
      options.signal.removeEventListener("abort", stopUpload);
    }
  },

  async delete(key) {
    await objectStorage().delete(key);
  },

  presignDownload(key, fileName) {
    return objectStorage().presignBrowserGet(key, EXPORT_LINK_SECONDS, {
      contentDisposition: `attachment; filename="${fileName}"`,
    });
  },
};
