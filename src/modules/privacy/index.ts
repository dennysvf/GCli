// Public API of the privacy module (spec F14 section 5): the patient timeline, the LGPD request
// register, the data export and the anonymization. Use cases are wired here with their
// infrastructure adapters; callers never import files inside the module.
import type { RequestContext } from "@/shared/context/types";
import { getPatientTimeline, getTimelineNote, type TimelineDeps } from "./application/timeline";
import { clinicalGate, patientGate, privacyDirectory } from "./infrastructure/directory";
import { sqlTimelineReader } from "./infrastructure/sql-timeline-reader";

const baseDeps: TimelineDeps = {
  timeline: sqlTimelineReader,
  patients: patientGate,
  clinical: clinicalGate,
  directory: privacyDirectory,
  clock: () => new Date(),
};

// The use cases bound to their dependencies. `adjust` lets tests replace an adapter (a clock, the
// storage) while the rest stays real.
export function createPrivacy(adjust?: (base: TimelineDeps) => TimelineDeps) {
  const deps = adjust ? adjust(baseDeps) : baseDeps;
  return {
    // Timeline
    getPatientTimeline: (ctx: RequestContext, input: unknown) => getPatientTimeline(deps, ctx, input),
    getTimelineNote: (ctx: RequestContext, input: unknown) => getTimelineNote(deps, ctx, input),
  };
}

export const privacy = createPrivacy();

export { privacyCatalog } from "./messages/catalog";
export { TIMELINE_PAGE_SIZE, TIMELINE_P95_MS } from "./domain/limits";
export {
  TIMELINE_GROUPS,
  TIMELINE_KINDS,
  type TimelineGroup,
  type TimelineKind,
} from "./domain/timeline-event";
export type { TimelineItem } from "./application/ports";
export type { TimelineNote, TimelinePage } from "./application/timeline";
