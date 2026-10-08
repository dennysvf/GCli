import { MAX_FILES_PER_UPLOAD } from "../domain/limits";

// The queue of the upload dialog (PRD F08): up to 20 files per action, three at a time, each one
// independent of the others. A file that fails shows "Falha no envio" and can be retried without
// touching the files that were sent. Plain TypeScript, so it is tested without a browser.

export const MAX_CONCURRENT_UPLOADS = 3;

// "pending": added to the dialog, waiting for the user to choose categories and press Enviar.
export type UploadState = "pending" | "queued" | "uploading" | "sent" | "failed";

export type QueueItem<F> = {
  id: string;
  file: F;
  categoryId: string;
  title: string;
  state: UploadState;
  percent: number;
  // Why the file failed, already in the user's language.
  message: string | null;
  documentId: string | null;
  // The document is clinical and this user will not see it afterwards.
  hidden: boolean;
  // The browser refused the file (type or size): it is listed as failed and cannot be retried.
  refused: boolean;
};

export type SendOutcome = { ok: true; documentId: string; hidden: boolean } | { ok: false; message: string };

export type Sender<F> = (item: QueueItem<F>, onProgress: (percent: number) => void) => Promise<SendOutcome>;

export class UploadQueue<F> {
  private items: QueueItem<F>[] = [];
  private listeners = new Set<() => void>();
  private counter = 0;

  constructor(
    private readonly send: Sender<F>,
    private readonly concurrency = MAX_CONCURRENT_UPLOADS,
    private readonly limit = MAX_FILES_PER_UPLOAD,
  ) {}

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // A stable snapshot: it changes identity only when something changed.
  snapshot = (): readonly QueueItem<F>[] => this.items;

  private commit(items: QueueItem<F>[]) {
    this.items = items;
    for (const listener of this.listeners) listener();
  }

  private patch(id: string, changes: Partial<QueueItem<F>>) {
    this.commit(this.items.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }

  // Adds files to the dialog. More than the limit per action are refused as a whole, so the user
  // is asked to send the rest in another action. `refusal` marks a file that failed the checks of
  // the browser (type, size): it is listed as failed and never sent.
  add(files: { file: F; categoryId: string; title: string; refusal?: string | null }[]): {
    accepted: boolean;
  } {
    if (this.items.length + files.length > this.limit) return { accepted: false };
    const created = files.map((entry): QueueItem<F> => {
      this.counter += 1;
      return {
        id: `upload-${this.counter}`,
        file: entry.file,
        categoryId: entry.categoryId,
        title: entry.title,
        state: entry.refusal ? "failed" : "pending",
        percent: 0,
        message: entry.refusal ?? null,
        documentId: null,
        hidden: false,
        refused: !!entry.refusal,
      };
    });
    this.commit([...this.items, ...created]);
    return { accepted: true };
  }

  // "Enviar": every pending file starts, three at a time.
  start() {
    this.commit(this.items.map((item) => (item.state === "pending" ? { ...item, state: "queued" } : item)));
    this.pump();
  }

  setCategory(id: string, categoryId: string) {
    this.patch(id, { categoryId });
  }

  setTitle(id: string, title: string) {
    this.patch(id, { title });
  }

  // A retry starts again from a new intent: the server does not know about batches.
  retry(id: string) {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item || item.state !== "failed" || item.refused) return;
    this.patch(id, { state: "queued", percent: 0, message: null });
    this.pump();
  }

  // Only files that were not sent can leave the list.
  remove(id: string) {
    this.commit(
      this.items.filter((item) => !(item.id === id && item.state !== "uploading" && item.state !== "sent")),
    );
  }

  get sentCount(): number {
    return this.items.filter((item) => item.state === "sent").length;
  }

  get pendingCount(): number {
    return this.items.filter((item) => item.state === "pending").length;
  }

  get busy(): boolean {
    return this.items.some((item) => item.state === "queued" || item.state === "uploading");
  }

  private pump() {
    let running = this.items.filter((item) => item.state === "uploading").length;
    for (const item of this.items) {
      if (running >= this.concurrency) break;
      if (item.state !== "queued") continue;
      running += 1;
      this.patch(item.id, { state: "uploading", percent: 0 });
      void this.run(item.id);
    }
  }

  private async run(id: string) {
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) return;
    let outcome: SendOutcome;
    try {
      outcome = await this.send(item, (percent) => this.patch(id, { percent }));
    } catch {
      outcome = { ok: false, message: "" };
    }
    if (outcome.ok) {
      this.patch(id, { state: "sent", percent: 100, documentId: outcome.documentId, hidden: outcome.hidden });
    } else {
      this.patch(id, { state: "failed", message: outcome.message });
    }
    this.pump();
  }
}
