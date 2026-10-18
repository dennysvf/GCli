import { kindsOf, TIMELINE_GROUPS, type TimelineGroup, type TimelineKind } from "./timeline-event";

// Who sees what on the timeline (PRD F14 role filtering, spec decision D3). The rule is built on the
// policies the source screens already apply, so the timeline never shows more than they do:
// - clinical: the F07 records policy (a linked professional with an appointment with the patient);
// - financial: the F09 permission to operate billing (Professionals have none);
// - ownProfessionalId: set when the viewer may only read their own agenda (F06).
// Clinical documents follow the clinical rule too; that filter is applied in SQL.
export type ViewerAccess = {
  clinical: boolean;
  financial: boolean;
  ownProfessionalId: string | null;
};

export function visibleGroups(access: Pick<ViewerAccess, "clinical" | "financial">): TimelineGroup[] {
  return TIMELINE_GROUPS.filter(
    (group) => (group !== "CLINICAL" || access.clinical) && (group !== "FINANCIAL" || access.financial),
  );
}

export function visibleKinds(access: Pick<ViewerAccess, "clinical" | "financial">): TimelineKind[] {
  return kindsOf(visibleGroups(access));
}

// The kinds a page asks for: the chosen groups (none means every visible group). A group the viewer
// may not see is dropped silently, so the filter can never reveal hidden events.
export function requestedKinds(
  access: Pick<ViewerAccess, "clinical" | "financial">,
  groups: readonly TimelineGroup[],
): TimelineKind[] {
  const visible = visibleGroups(access);
  const chosen = groups.length === 0 ? visible : visible.filter((group) => groups.includes(group));
  return kindsOf(chosen);
}
