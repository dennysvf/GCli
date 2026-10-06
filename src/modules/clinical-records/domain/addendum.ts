import { fail, ok, type Result } from "@/shared/kernel/result";
import type { NoteState } from "./clinical-note";
import { ClinicalErrors } from "./errors";
import { ADDENDUM_MAX_CHARACTERS } from "./limits";

// PRD F07: addenda complement a locked note, up to 10,000 characters, and are immutable.
export function validateAddendum(state: NoteState, characters: number): Result<void> {
  if (state !== "LOCKED") return fail(ClinicalErrors.addendumBeforeLock());
  if (characters < 1) return fail(ClinicalErrors.addendumEmpty());
  if (characters > ADDENDUM_MAX_CHARACTERS) return fail(ClinicalErrors.addendumTooLong());
  return ok(undefined);
}
