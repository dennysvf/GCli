import { describe, expect, it } from "vitest";
import { UploadQueue, type SendOutcome } from "./upload-queue";

type Deferred = { resolve: (outcome: SendOutcome) => void };

// A sender whose files finish only when the test says so.
function controlledQueue(concurrency = 3) {
  const pending = new Map<string, Deferred>();
  const started: string[] = [];
  const queue = new UploadQueue<string>(
    (item, onProgress) =>
      new Promise<SendOutcome>((resolve) => {
        started.push(item.file);
        onProgress(40);
        pending.set(item.file, { resolve });
      }),
    concurrency,
  );
  return { queue, pending, started };
}

const entry = (name: string) => ({ file: name, categoryId: "c1", title: name });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("upload queue", () => {
  it("F08: the upload queue runs 3 files at a time", async () => {
    const { queue, pending, started } = controlledQueue();
    queue.add(["a", "b", "c", "d", "e"].map(entry));
    // Nothing is sent until the user presses Enviar, so the categories can be chosen first.
    expect(started).toEqual([]);
    expect(queue.pendingCount).toBe(5);
    queue.start();
    expect(started).toEqual(["a", "b", "c"]);
    expect(queue.snapshot().map((item) => item.state)).toEqual([
      "uploading",
      "uploading",
      "uploading",
      "queued",
      "queued",
    ]);
    pending.get("a")?.resolve({ ok: true, documentId: "d1", hidden: false });
    await tick();
    expect(started).toEqual(["a", "b", "c", "d"]);
    expect(queue.snapshot()[0]).toMatchObject({ state: "sent", percent: 100, documentId: "d1" });
    expect(queue.sentCount).toBe(1);
    expect(queue.busy).toBe(true);
  });

  it("F08: a 21st file is refused as a whole, so the user sends the rest in another action", () => {
    const { queue } = controlledQueue();
    const twenty = Array.from({ length: 20 }, (_, index) => entry(`f${index}`));
    expect(queue.add(twenty).accepted).toBe(true);
    expect(queue.add([entry("extra")]).accepted).toBe(false);
    expect(queue.snapshot()).toHaveLength(20);
    const fresh = controlledQueue();
    expect(fresh.queue.add([...twenty, entry("extra")]).accepted).toBe(false);
    expect(fresh.queue.snapshot()).toHaveLength(0);
  });

  it("F08: a failed file can be retried without touching the others", async () => {
    const { queue, pending, started } = controlledQueue();
    queue.add(["a", "b", "c"].map(entry));
    queue.start();
    pending.get("a")?.resolve({ ok: true, documentId: "d1", hidden: false });
    pending.get("b")?.resolve({ ok: false, message: "Falha no envio" });
    pending.get("c")?.resolve({ ok: true, documentId: "d3", hidden: true });
    await tick();
    expect(queue.snapshot().map((item) => item.state)).toEqual(["sent", "failed", "sent"]);
    expect(queue.snapshot()[1]?.message).toBe("Falha no envio");
    queue.retry(queue.snapshot()[1]?.id ?? "");
    expect(started).toEqual(["a", "b", "c", "b"]);
    pending.get("b")?.resolve({ ok: true, documentId: "d2", hidden: false });
    await tick();
    expect(queue.snapshot().map((item) => item.state)).toEqual(["sent", "sent", "sent"]);
    expect(queue.snapshot()[2]?.hidden).toBe(true);
    expect(queue.busy).toBe(false);
  });

  it("F08: a file the browser refused is listed as failed and never sent, and a thrown send becomes a failure", async () => {
    const { queue, started } = controlledQueue();
    queue.add([{ ...entry("exame.zip"), refusal: "não suportado" }]);
    expect(started).toEqual([]);
    expect(queue.snapshot()[0]).toMatchObject({ state: "failed", message: "não suportado" });
    const failing = new UploadQueue<string>(async () => {
      throw new Error("rede");
    });
    failing.add([entry("x")]);
    failing.start();
    await tick();
    expect(failing.snapshot()[0]?.state).toBe("failed");
  });

  it("F08: the category and the title of a pending file can be changed until it is sent", () => {
    const { queue } = controlledQueue();
    queue.add([entry("a")]);
    const id = queue.snapshot()[0]?.id ?? "";
    queue.setCategory(id, "c2");
    queue.setTitle(id, "Novo título");
    expect(queue.snapshot()[0]).toMatchObject({ categoryId: "c2", title: "Novo título", state: "pending" });
    queue.remove(id);
    expect(queue.snapshot()).toHaveLength(0);
  });

  it("F08: only files that were not sent can be removed from the list", async () => {
    const { queue, pending } = controlledQueue(1);
    queue.add(["a", "b"].map(entry));
    queue.start();
    const [first, second] = queue.snapshot();
    queue.remove(first?.id ?? "");
    expect(queue.snapshot()).toHaveLength(2);
    queue.remove(second?.id ?? "");
    expect(queue.snapshot()).toHaveLength(1);
    pending.get("a")?.resolve({ ok: true, documentId: "d1", hidden: false });
    await tick();
    queue.remove(queue.snapshot()[0]?.id ?? "");
    expect(queue.snapshot()).toHaveLength(1);
  });
});
