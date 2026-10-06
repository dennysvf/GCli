"use client";

import { useCallback, useState } from "react";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { ClinicalRecord, NoteListItem, RecordCurrent } from "../application/queries";
import { NoteWorkspace } from "./note-workspace";
import { NotesList } from "./notes-list";
import type { RecordActions } from "./record-actions";
import { RecordHeader } from "./record-header";

// The split screen of the record (PRD F07 Experience): patient header and previous notes on the
// left, the note on the right. Below the md breakpoint the note comes first (design system 5.12).
export function ClinicalRecordView({
  record,
  userId,
  actions,
}: {
  record: ClinicalRecord;
  userId: string;
  actions: RecordActions;
}) {
  const [items, setItems] = useState<NoteListItem[]>(record.notes.items);
  const [total, setTotal] = useState(record.notes.total);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState<RecordCurrent>(record.current);
  // A different note or a new one remounts the workspace, so its editor starts from scratch.
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const show = (next: RecordCurrent) => {
    setCurrent(next);
    setWorkspaceKey((value) => value + 1);
  };
  const [selectedId, setSelectedId] = useState<string | null>(
    record.current.kind === "NOTE" ? record.current.note.id : null,
  );
  const { patientId } = record.header;

  const refreshList = useCallback(async () => {
    const result = await actions.listNotes({ patientId, page: 1 });
    if (handleActionResult(result)) {
      setItems(result.data.items);
      setTotal(result.data.total);
      setPage(1);
    }
  }, [actions, patientId]);

  async function loadMore() {
    setLoading(true);
    try {
      const result = await actions.listNotes({ patientId, page: page + 1 });
      if (handleActionResult(result)) {
        setItems((existing) => [...existing, ...result.data.items]);
        setTotal(result.data.total);
        setPage(page + 1);
      }
    } finally {
      setLoading(false);
    }
  }

  async function select(noteId: string) {
    const result = await actions.openNote({ noteId });
    if (handleActionResult(result)) {
      setSelectedId(noteId);
      show({ kind: "NOTE", note: result.data });
      window.history.replaceState(null, "", `?note=${noteId}`);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[22.5rem_minmax(0,1fr)]">
      <div className="order-2 grid content-start gap-6 lg:order-1">
        <RecordHeader header={record.header} canWrite={record.permissions.canWrite} actions={actions} />
        <NotesList
          items={items}
          total={total}
          selectedId={selectedId}
          canAddStandalone={record.permissions.canAddStandalone}
          loading={loading}
          onSelect={(noteId) => void select(noteId)}
          onLoadMore={() => void loadMore()}
          onNewStandalone={() => {
            setSelectedId(null);
            show({ kind: "NEW_STANDALONE" });
          }}
        />
      </div>
      <div className="order-1 min-w-0 lg:order-2">
        <NoteWorkspace
          key={workspaceKey}
          current={current}
          patientId={patientId}
          userId={userId}
          timeZone={record.timeZone}
          canWrite={record.permissions.canWrite}
          actions={actions}
          onCreated={(noteId) => {
            setSelectedId(noteId);
            void refreshList();
          }}
          onListChanged={() => void refreshList()}
        />
      </div>
    </div>
  );
}
