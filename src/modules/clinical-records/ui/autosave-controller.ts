// Autosave of the note editor (PRD F07): every 10 seconds and on blur, one save at a time. When a
// save fails because the network is down, the text is kept in a browser backup and sent again
// every 15 seconds and as soon as the browser is back online (PRD Error Handling). Plain TypeScript
// with injected timers and storage, so the rules are unit-tested without a browser.

export type SaveOutcome =
  | { kind: "saved"; savedAt: Date }
  | { kind: "network" }
  // The note changed in another window, or locked: saving again would never work.
  | { kind: "stale" }
  | { kind: "locked" }
  | { kind: "error" };

export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; savedAt: Date }
  | { kind: "offline" }
  | { kind: "stale" }
  | { kind: "locked" }
  | { kind: "error" };

export type AutosaveOptions = {
  save: (html: string) => Promise<SaveOutcome>;
  intervalMs: number;
  retryMs: number;
  backup: { write(html: string): void; clear(): void };
  onStatus: (status: AutosaveStatus) => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
};

export class AutosaveController {
  private latest: string | null = null;
  private saved: string | null = null;
  private saving = false;
  private inflight: Promise<void> | null = null;
  private stopped = true;
  private offline = false;
  private interval: unknown = null;
  private retry: unknown = null;
  private readonly setTimer: (callback: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(private readonly options: AutosaveOptions) {
    this.setTimer = options.setTimer ?? ((callback, ms) => setInterval(callback, ms));
    this.clearTimer =
      options.clearTimer ?? ((handle) => clearInterval(handle as ReturnType<typeof setInterval>));
  }

  // The text the editor starts with is already on the server.
  start(initialHtml: string): void {
    this.latest = initialHtml;
    this.saved = initialHtml;
    this.stopped = false;
    this.interval = this.setTimer(() => void this.flush(), this.options.intervalMs);
  }

  stop(): void {
    this.stopped = true;
    if (this.interval !== null) this.clearTimer(this.interval);
    if (this.retry !== null) this.clearTimer(this.retry);
    this.interval = null;
    this.retry = null;
  }

  get dirty(): boolean {
    return this.latest !== null && this.latest !== this.saved;
  }

  change(html: string): void {
    this.latest = html;
  }

  // On blur, on a hidden page, and every interval. Skips when nothing changed or a save is running.
  async flush(): Promise<void> {
    if (this.stopped || this.saving || !this.dirty || this.latest === null) return;
    const html = this.latest;
    this.saving = true;
    this.options.onStatus({ kind: "saving" });
    this.inflight = (async () => {
      let outcome: SaveOutcome;
      try {
        outcome = await this.options.save(html);
      } catch {
        outcome = { kind: "network" };
      }
      this.saving = false;
      this.handle(html, outcome);
    })();
    await this.inflight;
    this.inflight = null;
  }

  // Waits for the save that is running, so finalizing or publishing uses the version it produced.
  async settle(): Promise<void> {
    if (this.inflight) await this.inflight;
  }

  // The browser reports the connection is back: do not wait for the next retry.
  online(): void {
    if (this.offline) void this.flush();
  }

  // Closing the page with unsaved text: keep it locally for the next visit.
  pageHide(): void {
    if (this.dirty && this.latest !== null) this.options.backup.write(this.latest);
  }

  private handle(html: string, outcome: SaveOutcome): void {
    if (outcome.kind === "saved") {
      this.saved = html;
      this.offline = false;
      this.stopRetry();
      // Text typed while the save ran stays dirty and is sent by the next tick.
      if (!this.dirty) this.options.backup.clear();
      this.options.onStatus({ kind: "saved", savedAt: outcome.savedAt });
      return;
    }
    if (outcome.kind === "network") {
      this.offline = true;
      if (this.latest !== null) this.options.backup.write(this.latest);
      this.startRetry();
      this.options.onStatus({ kind: "offline" });
      return;
    }
    // Stale, locked or an unexpected error: stop trying, but keep the text for the user.
    if (this.latest !== null) this.options.backup.write(this.latest);
    this.stop();
    this.options.onStatus({ kind: outcome.kind });
  }

  private startRetry(): void {
    if (this.retry !== null) return;
    this.retry = this.setTimer(() => void this.flush(), this.options.retryMs);
  }

  private stopRetry(): void {
    if (this.retry === null) return;
    this.clearTimer(this.retry);
    this.retry = null;
  }
}
