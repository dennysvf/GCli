import { QUOTA_ALERT_PERCENT, QUOTA_BYTES } from "./limits";

// Storage quota of the organization (PRD F08): 50 GB for the files of this feature.

export type UsageLevel = "ok" | "warning" | "full";

// An upload fits while the total stays within the quota (exactly 50 GB is allowed).
export function canStore(usedBytes: number, size: number, quota = QUOTA_BYTES): boolean {
  return usedBytes + size <= quota;
}

export function usagePercent(usedBytes: number, quota = QUOTA_BYTES): number {
  return Math.min(100, Math.floor((usedBytes * 100) / quota));
}

// Integer arithmetic, so the threshold is exact: used / quota >= 80 / 100.
export function reachesAlert(usedBytes: number, quota = QUOTA_BYTES): boolean {
  return usedBytes * 100 >= quota * QUOTA_ALERT_PERCENT;
}

export function usageLevel(usedBytes: number, quota = QUOTA_BYTES): UsageLevel {
  if (usedBytes >= quota) return "full";
  return reachesAlert(usedBytes, quota) ? "warning" : "ok";
}

// The email goes out when a change moves the usage from below 80% to 80% or more, never again
// while it stays above (spec F08, "80% alert").
export function crossedAlert(before: number, after: number, quota = QUOTA_BYTES): boolean {
  return !reachesAlert(before, quota) && reachesAlert(after, quota);
}
