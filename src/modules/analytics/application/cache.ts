import { DASHBOARD_CACHE_MAX_ENTRIES, DASHBOARD_CACHE_TTL_MS } from "../domain/limits";

export type TtlCache<T> = {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
};

// In-process cache with expiry and a size bound (ADR-037). The PRD accepts dashboard data up to 5
// minutes old; each web instance keeps its own copy. A Map keeps insertion order, so the first key
// is always the oldest entry.
export function createTtlCache<T>(options: {
  clock: () => Date;
  ttlMs?: number;
  maxEntries?: number;
}): TtlCache<T> {
  const ttlMs = options.ttlMs ?? DASHBOARD_CACHE_TTL_MS;
  const maxEntries = options.maxEntries ?? DASHBOARD_CACHE_MAX_ENTRIES;
  const entries = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt <= options.clock().getTime()) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { value, expiresAt: options.clock().getTime() + ttlMs });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
      }
    },
    clear() {
      entries.clear();
    },
  };
}
