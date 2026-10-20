import type { ActionResult } from "@/shared/kernel/action-result";
import type { TimelineGroup } from "../domain/timeline-event";
import type { TimelineNote, TimelinePage } from "../application/timeline";

// The Server Actions the timeline tab calls. The route passes the real ones, so the module's UI
// never imports from `app/` (spec F14 section 4).
export type TimelineActions = {
  list: (input: {
    patientId: string;
    groups: TimelineGroup[];
    from: string | null;
    to: string | null;
    cursor: string | null;
  }) => Promise<ActionResult<TimelinePage>>;
  openNote: (input: { patientId: string; noteId: string }) => Promise<ActionResult<TimelineNote>>;
};
