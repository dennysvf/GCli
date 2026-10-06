import type { FieldChange } from "@/shared/audit/diff";
import type { RequestContext } from "@/shared/context/types";
import { formatDate, formatLocale, formatTime } from "@/shared/i18n/format";
import type { DomainError } from "@/shared/kernel/errors";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { ClinicalNote, NoteContent } from "../domain/clinical-note";
import { ClinicalErrors } from "../domain/errors";
import { ADDENDUM_MAX_HTML_BYTES, NOTE_MAX_HTML_BYTES } from "../domain/limits";
import type { ClinicalRecordsDeps } from "./ports";

// Helpers shared by the clinical use cases.

// Sanitizes editor HTML and derives its text. The raw size is capped before any work, so markup
// cannot inflate a note (spec F07 section 3).
export function buildContent(
  deps: ClinicalRecordsDeps,
  html: string,
  kind: "note" | "addendum" = "note",
): Result<NoteContent> {
  const maxBytes = kind === "note" ? NOTE_MAX_HTML_BYTES : ADDENDUM_MAX_HTML_BYTES;
  if (Buffer.byteLength(html, "utf-8") > maxBytes) {
    return fail(kind === "note" ? ClinicalErrors.noteTooLong() : ClinicalErrors.addendumTooLong());
  }
  const clean = deps.sanitizer.sanitize(html);
  return ok({ html: clean.html, text: clean.text, characters: Array.from(clean.text).length });
}

// Time zone to show a note's instants: the appointment's unit, else the organization (ADR-019).
export async function noteTimeZone(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  note: ClinicalNote,
): Promise<string> {
  const appointmentId = note.snapshot.appointmentId;
  if (appointmentId) {
    const facts = (await deps.directory.appointments(ctx.organizationId, [appointmentId])).get(appointmentId);
    if (facts) return facts.unitTimeZone;
  }
  return deps.directory.organizationTimeZone(ctx);
}

// The lock error with the lock instant formatted in the requester's language and the note's zone.
export async function lockedError(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  note: ClinicalNote,
): Promise<DomainError> {
  const zone = await noteTimeZone(deps, ctx, note);
  const locale = formatLocale(ctx.locale, ctx.organizationCountry);
  return ClinicalErrors.noteLocked(
    formatDate(note.snapshot.locksAt, locale, zone),
    formatTime(note.snapshot.locksAt, locale, zone),
  );
}

// Adds the lock date and time to a lock error coming out of the domain; other results pass through.
export async function withLockDetails<T>(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  note: ClinicalNote,
  result: Result<T>,
): Promise<Result<T>> {
  if (!result.ok && result.error.code === "CLINICAL_NOTE_LOCKED")
    return fail(await lockedError(deps, ctx, note));
  return result;
}

// The database trigger (ADR-032) refuses a content change that slips past the application check
// by a few milliseconds around the lock instant. It surfaces as an exception, not as a Result.
export function isLockViolation(error: unknown): boolean {
  return error instanceof Error && error.message.includes("CLINICAL_NOTE_LOCKED");
}

// Text of a note never reaches the audit log (architecture 5.3): only lengths.
export function contentChange(before: number | null, after: number): FieldChange {
  return { changed: true, beforeLength: before ?? 0, afterLength: after };
}
