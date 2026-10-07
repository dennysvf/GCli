import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { fail, ok, type Result } from "@/shared/kernel/result";
import type { ClinicalNote } from "../domain/clinical-note";
import { ClinicalErrors } from "../domain/errors";
import { requirePatientAccess } from "./policies";
import type { ClinicalRecordsDeps } from "./ports";

// Loads a note for a reader: the note must exist, the reader must pass the records policy for its
// patient (a denial is audited as PERMISSION_DENIED, PRD F07), and a draft is visible only to its
// author. An invisible draft looks like a missing note.
export async function loadAccessibleNote(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  noteId: string,
  action: "clinical:read" | "clinical:write" = "clinical:read",
): Promise<Result<ClinicalNote>> {
  const loaded = await withTransaction(ctx, async (uow) => ok(await deps.notes.findById(uow, noteId)));
  if (!loaded.ok) return loaded;
  const note = loaded.value;
  if (!note) return fail(ClinicalErrors.noteNotFound());
  const access = await requirePatientAccess(deps, ctx, note.snapshot.patientId, action);
  if (!access.ok) return access;
  if (!note.isAuthor(ctx.user.id) && !note.isVisibleToOthers(deps.clock())) {
    return fail(ClinicalErrors.noteNotFound());
  }
  return ok(note);
}
