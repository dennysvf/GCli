import {
  pastStart,
  patientOverlap,
  professionalOverlap,
  roomOverlap,
  timeOff,
  unitClosure,
  unitHours,
  workingHours,
  type ConflictRule,
} from "./rules";
import type { CheckOptions, ConflictContext, Draft, Finding, Severity } from "./types";

const RULES: readonly ConflictRule[] = [
  roomOverlap,
  professionalOverlap,
  pastStart,
  unitClosure,
  unitHours,
  workingHours,
  timeOff,
  patientOverlap,
];

const ORDER: Record<Severity, number> = { BLOCKING: 0, OVERBOOKABLE: 1, EXCEPTION: 2, WARNING: 3 };

// All findings for a draft, blocking first (design system 5.11: blocking, overridable, warning).
export function checkConflicts(draft: Draft, context: ConflictContext, options: CheckOptions): Finding[] {
  return RULES.flatMap((rule) => rule(draft, context, options)).sort(
    (a, b) => ORDER[a.severity] - ORDER[b.severity],
  );
}

export type Overrides = { confirmOverbooking: boolean; exceptionJustification: string | null };

export type Resolution =
  | { ok: true; isOverbooking: boolean; exceptionCodes: string[]; warnings: Finding[] }
  | { ok: false; reason: "CONFLICTS" | "JUSTIFICATION_REQUIRED"; findings: Finding[] };

// Decides whether a save may proceed with the user's overrides (spec F06 section 3: Overrides).
// Blocking or unconfirmed Encaixe findings give CONFLICTS; when only unjustified exceptions are
// left it is JUSTIFICATION_REQUIRED. Both return every finding so the panel can show them.
export function resolveFindings(findings: Finding[], overrides: Overrides): Resolution {
  const blocking = findings.some((finding) => finding.severity === "BLOCKING");
  const overbooking = findings.filter((finding) => finding.severity === "OVERBOOKABLE");
  const exceptions = findings.filter((finding) => finding.severity === "EXCEPTION");
  if (blocking || (overbooking.length > 0 && !overrides.confirmOverbooking)) {
    return { ok: false, reason: "CONFLICTS", findings };
  }
  if (exceptions.length > 0 && !overrides.exceptionJustification) {
    return { ok: false, reason: "JUSTIFICATION_REQUIRED", findings };
  }
  return {
    ok: true,
    isOverbooking: overbooking.length > 0,
    exceptionCodes: [...new Set(exceptions.map((finding) => finding.code))],
    warnings: findings.filter((finding) => finding.severity === "WARNING"),
  };
}

// Availability search and series suggestions accept only slots that need no override.
export function isFree(findings: Finding[]): boolean {
  return findings.every((finding) => finding.severity === "WARNING");
}
