// Browser backup of unsent note text (PRD F07 Error Handling, spec F07 section 3). Written only
// when a save fails or the page closes with unsaved changes, and removed as soon as the server
// confirms, on sign-out and when the note locks, so little clinical text stays on the device.

const PREFIX = "gcli.clinical.";

export type LocalBackup = { html: string; savedAt: string; baseVersion: number };

function key(userId: string, noteKey: string): string {
  return `${PREFIX}backup.${userId}.${noteKey}`;
}

export function writeBackup(userId: string, noteKey: string, backup: LocalBackup): void {
  try {
    window.localStorage.setItem(key(userId, noteKey), JSON.stringify(backup));
  } catch {
    // Storage can be blocked or full; the draft then lives only in the editor.
  }
}

// The stored text itself, as one primitive, so a component can read it with useSyncExternalStore
// (null on the server and when storage is unavailable).
export function readBackupRaw(userId: string, noteKey: string): string | null {
  try {
    return window.localStorage.getItem(key(userId, noteKey));
  } catch {
    return null;
  }
}

export function parseBackup(raw: string | null): LocalBackup | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalBackup>;
    if (typeof parsed.html !== "string" || typeof parsed.savedAt !== "string") return null;
    return { html: parsed.html, savedAt: parsed.savedAt, baseVersion: Number(parsed.baseVersion ?? 0) };
  } catch {
    return null;
  }
}

export function readBackup(userId: string, noteKey: string): LocalBackup | null {
  try {
    const raw = window.localStorage.getItem(key(userId, noteKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalBackup>;
    if (typeof parsed.html !== "string" || typeof parsed.savedAt !== "string") return null;
    return { html: parsed.html, savedAt: parsed.savedAt, baseVersion: Number(parsed.baseVersion ?? 0) };
  } catch {
    return null;
  }
}

export function clearBackup(userId: string, noteKey: string): void {
  try {
    window.localStorage.removeItem(key(userId, noteKey));
  } catch {
    // Nothing to clear.
  }
}

// Called before signing out: no clinical text stays behind on a shared computer.
export function clearClinicalBackups(): void {
  try {
    const storage = window.localStorage;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const name = storage.key(index);
      if (name?.startsWith(PREFIX)) storage.removeItem(name);
    }
  } catch {
    // Nothing to clear.
  }
}
