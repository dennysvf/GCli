// Text that modules keep in this browser must not outlive the session on a shared computer. On
// sign-out, every key that starts with one of these prefixes is removed (PRD F07: the unsent
// clinical drafts, spec F07 section 3).
const DEVICE_DATA_PREFIXES = ["gcli.clinical."];

export function clearDeviceData(): void {
  try {
    const storage = window.localStorage;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const name = storage.key(index);
      if (name && DEVICE_DATA_PREFIXES.some((prefix) => name.startsWith(prefix))) storage.removeItem(name);
    }
  } catch {
    // Storage can be blocked; there is nothing to clear then.
  }
}
