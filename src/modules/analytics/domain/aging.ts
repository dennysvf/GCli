import { daysBetween } from "@/shared/kernel/calendar-date";
import { AGING_BUCKETS } from "./limits";

export type AgingBucketId = (typeof AGING_BUCKETS)[number]["id"];

// Spec F13 decision D2: charges have no due date and are due on issue, so the days open count from
// the issue date (local date in the unit's zone) to today (local date in the same zone).
export function daysOpen(issueDate: string, today: string): number {
  return Math.max(0, daysBetween(issueDate, today));
}

export function agingBucket(days: number): AgingBucketId {
  const bucket = AGING_BUCKETS.find((entry) => entry.to === null || days <= entry.to);
  return bucket ? bucket.id : "D90_PLUS";
}
