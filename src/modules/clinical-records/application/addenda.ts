import type { RequestContext } from "@/shared/context/types";
import { withTransaction } from "@/shared/db/transaction";
import { newId } from "@/shared/kernel/ids";
import { ok, type Result } from "@/shared/kernel/result";
import { parseInput } from "@/shared/kernel/validation";
import { validateAddendum } from "../domain/addendum";
import { clinicalEvent, CLINICAL_RECORDS_EVENTS } from "../domain/events";
import { loadAccessibleNote } from "./access";
import { requireWriter } from "./policies";
import type { ClinicalRecordsDeps } from "./ports";
import { addAddendumSchema } from "./schemas";
import { buildContent, contentChange } from "./support";

export type AddendumResult = { addendumId: string; createdAt: string; authorName: string };

// PRD F07: once a note is locked, its author or another authorized professional can add addenda.
// They have their own author and timestamp and are immutable (append-only grants, spec F07 section 6).
export async function addAddendum(
  deps: ClinicalRecordsDeps,
  ctx: RequestContext,
  input: unknown,
): Promise<Result<AddendumResult>> {
  const writer = await requireWriter(ctx);
  if (!writer.ok) return writer;
  const parsed = parseInput(addAddendumSchema, input);
  if (!parsed.ok) return parsed;
  const content = buildContent(deps, parsed.value.html, "addendum");
  if (!content.ok) return content;
  const loaded = await loadAccessibleNote(deps, ctx, parsed.value.noteId, "clinical:write");
  if (!loaded.ok) return loaded;
  const note = loaded.value;
  const now = deps.clock();
  const valid = validateAddendum(note.effectiveState(now), content.value.characters);
  if (!valid.ok) return valid;

  const addendumId = newId();
  return withTransaction(ctx, async (uow) => {
    await deps.notes.insertAddendum(
      uow,
      {
        id: addendumId,
        noteId: note.snapshot.id,
        authorUserId: ctx.user.id,
        professionalId: writer.value.professionalId,
        contentHtml: content.value.html,
        contentText: content.value.text,
        characters: content.value.characters,
      },
      { userId: ctx.user.id, organizationId: ctx.organizationId },
    );
    await uow.audit.record({
      action: "CREATE",
      entityType: "clinical_note_addendum",
      entityId: addendumId,
      summary: "Adendo adicionado ao registro clínico",
      changes: { content: contentChange(0, content.value.characters) },
      metadata: { noteId: note.snapshot.id },
    });
    await uow.publish(
      clinicalEvent(
        CLINICAL_RECORDS_EVENTS.addendumAdded,
        {
          noteId: note.snapshot.id,
          patientId: note.snapshot.patientId,
          appointmentId: note.snapshot.appointmentId,
          professionalId: note.snapshot.professionalId,
          actorUserId: ctx.user.id,
          addendumId,
        },
        now,
      ),
    );
    return ok({ addendumId, createdAt: now.toISOString(), authorName: ctx.user.name });
  });
}
