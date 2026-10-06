import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ClinicalRecordView, clinicalRecords } from "@/modules/clinical-records";
import { requirePermission } from "@/modules/identity/next";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import {
  addAddendumAction,
  confirmAttachmentAction,
  discardEditAction,
  finalizeNoteAction,
  getVersionAction,
  listNotesAction,
  listVersionsAction,
  markAttachmentInErrorAction,
  openNoteAction,
  publishEditAction,
  saveDraftAction,
  saveEditDraftAction,
  startEditAction,
  updateClinicalAlertAction,
} from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("clinicalRecords.ui.title") };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// The split-screen clinical record (PRD F07 Experience). Front Desk users and professionals
// without an appointment with the patient get the 403 page and an audited denial.
export default async function RecordsPage({
  params,
  searchParams,
}: PageProps<"/patients/[patientId]/records">) {
  const t = await getTranslations();
  const ctx = await requirePermission("clinical:read");
  const { patientId } = await params;
  const query = await searchParams;
  const record = await clinicalRecords.getClinicalRecord(ctx, {
    patientId,
    appointmentId: first(query.appointment),
    noteId: first(query.note),
    standalone: first(query.standalone),
  });
  if (!record.ok) {
    if (record.error.code === "AUTHZ_FORBIDDEN") forbidden();
    notFound();
  }

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t("clinicalRecords.ui.title")}
        meta={record.value.header.displayName}
        breadcrumb={
          <Link href={`/patients/${patientId}`} className="underline-offset-4 hover:underline">
            {record.value.header.displayName}
          </Link>
        }
      />
      <ClinicalRecordView
        record={record.value}
        userId={ctx.user.id}
        actions={{
          saveDraft: saveDraftAction,
          finalize: finalizeNoteAction,
          startEdit: startEditAction,
          saveEditDraft: saveEditDraftAction,
          publishEdit: publishEditAction,
          discardEdit: discardEditAction,
          addAddendum: addAddendumAction,
          openNote: openNoteAction,
          listNotes: listNotesAction,
          listVersions: listVersionsAction,
          getVersion: getVersionAction,
          confirmAttachment: confirmAttachmentAction,
          markAttachmentInError: markAttachmentInErrorAction,
          updateAlert: updateClinicalAlertAction,
        }}
      />
    </div>
  );
}
