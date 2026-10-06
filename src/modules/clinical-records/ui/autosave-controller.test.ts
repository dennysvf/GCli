import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AutosaveController, type AutosaveStatus, type SaveOutcome } from "./autosave-controller";

const saved = (): SaveOutcome => ({ kind: "saved", savedAt: new Date() });

function setup(save: (html: string) => Promise<SaveOutcome>) {
  const backup = { text: null as string | null };
  const statuses: AutosaveStatus[] = [];
  const controller = new AutosaveController({
    save,
    intervalMs: 10_000,
    retryMs: 15_000,
    backup: {
      write: (html) => {
        backup.text = html;
      },
      clear: () => {
        backup.text = null;
      },
    },
    onStatus: (status) => statuses.push(status),
  });
  return { controller, backup, statuses };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("note autosave", () => {
  it("F07: autosave runs every 10 seconds, only with changes", async () => {
    const save = vi.fn(async () => saved());
    const { controller } = setup(save);
    controller.start("<p>a</p>");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
    controller.change("<p>ab</p>");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith("<p>ab</p>");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    controller.stop();
  });

  it("F07: blur saves right away, one save at a time", async () => {
    let release: (outcome: SaveOutcome) => void = () => undefined;
    const save = vi.fn(
      () =>
        new Promise<SaveOutcome>((resolve) => {
          release = resolve;
        }),
    );
    const { controller } = setup(save);
    controller.start("");
    controller.change("<p>x</p>");
    const first = controller.flush();
    controller.change("<p>xy</p>");
    await controller.flush();
    expect(save).toHaveBeenCalledTimes(1);
    release(saved());
    await first;
    // Text typed during the save is still pending and goes out on the next flush.
    expect(controller.dirty).toBe(true);
    const second = controller.flush();
    release(saved());
    await second;
    expect(save).toHaveBeenCalledTimes(2);
    expect(controller.dirty).toBe(false);
    controller.stop();
  });

  it("F07: a failed save keeps the text locally and retries every 15 seconds and when online", async () => {
    const outcomes: SaveOutcome[] = [{ kind: "network" }, { kind: "network" }, saved()];
    const save = vi.fn(async () => outcomes.shift() ?? saved());
    const { controller, backup, statuses } = setup(save);
    controller.start("");
    controller.change("<p>sem rede</p>");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(backup.text).toBe("<p>sem rede</p>");
    expect(statuses.at(-1)?.kind).toBe("offline");
    // The next attempt comes at the 15-second retry (and the 10-second tick, which also retries).
    await vi.advanceTimersByTimeAsync(15_000);
    expect(save.mock.calls.length).toBeGreaterThanOrEqual(2);
    controller.online();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(backup.text).toBeNull();
    expect(statuses.at(-1)?.kind).toBe("saved");
    controller.stop();
  });

  it("F07: a thrown save is treated as a network failure", async () => {
    const save = vi.fn(async () => {
      throw new Error("fetch failed");
    });
    const { controller, backup } = setup(save);
    controller.start("");
    controller.change("<p>x</p>");
    await controller.flush();
    expect(backup.text).toBe("<p>x</p>");
    controller.stop();
  });

  it("F07: a note changed in another window stops saving and keeps the text", async () => {
    const save = vi.fn(async (): Promise<SaveOutcome> => ({ kind: "stale" }));
    const { controller, backup, statuses } = setup(save);
    controller.start("");
    controller.change("<p>minha versão</p>");
    await controller.flush();
    expect(statuses.at(-1)?.kind).toBe("stale");
    expect(backup.text).toBe("<p>minha versão</p>");
    controller.change("<p>mais</p>");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("F07: closing the page with unsaved text writes the backup", () => {
    const { controller, backup } = setup(async () => saved());
    controller.start("<p>a</p>");
    controller.pageHide();
    expect(backup.text).toBeNull();
    controller.change("<p>ab</p>");
    controller.pageHide();
    expect(backup.text).toBe("<p>ab</p>");
    controller.stop();
  });
});
