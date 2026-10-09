import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
import { BillingTab, billing } from "@/modules/billing";
import { packages } from "@/modules/packages";
import { Alert } from "@/shared/ui/components/alert";
import { ClinicalNotesTable, clinicalRecords } from "@/modules/clinical-records";
import { DocumentsTab, documents } from "@/modules/documents";
import { getOrganizationProfile } from "@/modules/identity";
import { requirePermission } from "@/modules/identity/next";
import {
  ConsentSection,
  IncompleteRecordAlert,
  PatientActiveControl,
  PatientForm,
  PatientHeaderMeta,
  patients,
} from "@/modules/patients";
import { AppointmentsTable, scheduling } from "@/modules/scheduling";
import { can } from "@/shared/authz/permissions";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { Button } from "@/shared/ui/components/button";
import { Stamp } from "@/shared/ui/components/stamp";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/components/tabs";
import {
  archiveDocumentAction,
  confirmDocumentUploadAction,
  generateDocumentAction,
  getStorageUsageAction,
  listDocumentsAction,
  previewDocumentAction,
  restoreDocumentAction,
  updateDocumentAction,
} from "./documents/actions";
import { billingActions } from "../../financial/billing-actions";
import { packagesActions } from "../../packages/package-actions";
import { PackagesPanel } from "./packages-panel";
import {
  openConsentFileAction,
  recordConsentAction,
  reloadPatientAction,
  savePatientAction,
  setPatientActiveAction,
} from "../actions";
import { getTranslations } from "next-intl/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: t("common.patient") };
}

export default async function PatientPage({ params }: PageProps<"/patients/[patientId]">) {
  const t = await getTranslations();
  const ctx = await requirePermission("patient:read");
  const { patientId } = await params;
  const patient = await patients.getPatient(ctx, patientId);
  if (!patient.ok) {
    // getPatient already recorded the denial (PRD F01: 403 page).
    if (patient.error.code === "AUTHZ_FORBIDDEN") forbidden();
    notFound();
  }
  const details = patient.value;
  const canManage = can(ctx, "patient:manage");
  // PRD F07: the clinical tab exists only for those the records policy lets in. The check is made
  // before asking for the notes, so Front Desk users never trigger a denial just by opening the page.
  const canOpenRecords = await clinicalRecords.canAccessPatientRecords(ctx, patientId);
  const notes = canOpenRecords ? await clinicalRecords.listPatientNotes(ctx, { patientId }) : null;
  const [profile, sources, tags, consents, terms, appointments] = await Promise.all([
    getOrganizationProfile(ctx),
    patients.listItems(ctx, "referral-source"),
    patients.listItems(ctx, "tag"),
    patients.listConsents(ctx, patientId),
    patients.getCurrentTerms(ctx),
    can(ctx, "schedule:read-all") || can(ctx, "schedule:read-own")
      ? scheduling.listPatientAppointments(ctx, patientId)
      : null,
  ]);
  const timeZone = profile.ok ? profile.value.timeZone : "America/Sao_Paulo";
  const today = dateInTimeZone(new Date(), timeZone);
  // PRD F08: the Documentos tab. The use cases decide what the user may see (clinical documents
  // only with the F07 records policy), so a failed read simply hides the tab.
  const documentsPage = can(ctx, "document:read")
    ? await documents.listPatientDocuments(ctx, { patientId })
    : null;
  const [documentCategories, documentUsage, issueOptions] = documentsPage?.ok
    ? await Promise.all([
        documents.listCategories(ctx),
        documents.getStorageUsage(ctx),
        can(ctx, "document:generate") ? documents.getIssueOptions(ctx, patientId) : null,
      ])
    : [null, null, null];

  // PRD F09: the Financeiro tab for those who operate billing (Professionals have none).
  const charges = can(ctx, "billing:operate") ? await billing.listPatientCharges(ctx, patientId) : null;
  // PRD F10: the packages of the patient, with the notice for a package whose charge is still open.
  const patientPackages = charges?.ok ? await packages.listPatientPackages(ctx, { patientId }) : null;

  return (
    <div className="grid gap-6">
      <PageHeader
        title={details.displayName}
        titleAddon={details.active ? null : <Stamp variant="neutral">{t("common.inactive")}</Stamp>}
        meta={<PatientHeaderMeta patient={details} />}
        breadcrumb={
          <Link href="/patients" className="underline-offset-4 hover:underline">
            {t("common.patients")}
          </Link>
        }
        actions={
          <>
            {canOpenRecords ? (
              <Button asChild variant="outline">
                <Link href={`/patients/${patientId}/records`}>{t("clinicalRecords.ui.openRecord")}</Link>
              </Button>
            ) : null}
            {canManage ? (
              <PatientActiveControl
                patientId={patientId}
                active={details.active}
                action={setPatientActiveAction}
              />
            ) : null}
          </>
        }
      />
      <IncompleteRecordAlert patient={details} />
      {patientPackages?.ok && patientPackages.value.hasOpenBalance ? (
        <Alert variant="warning">{t("packages.ui.openBalanceNotice")}</Alert>
      ) : null}
      {/* PRD F05: the other tabs (Documentos, Financeiro, Linha do tempo) arrive with the features
          that fill them; F06 adds Agendamentos. */}
      <Tabs defaultValue="data">
        <TabsList>
          <TabsTrigger value="data">{t("common.data")}</TabsTrigger>
          {appointments ? <TabsTrigger value="appointments">{t("common.appointments")}</TabsTrigger> : null}
          {notes ? <TabsTrigger value="records">{t("clinicalRecords.ui.tab")}</TabsTrigger> : null}
          {documentsPage?.ok ? <TabsTrigger value="documents">{t("documents.ui.tab")}</TabsTrigger> : null}
          {charges?.ok ? <TabsTrigger value="billing">{t("billing.ui.tab")}</TabsTrigger> : null}
        </TabsList>
        <TabsContent value="data" className="grid gap-8 pt-4">
          <PatientForm
            defaultCountry={ctx.organizationCountry}
            patient={details}
            today={today}
            referralSources={sources.ok ? sources.value : []}
            tags={tags.ok ? tags.value : []}
            readOnly={!canManage || !details.active}
            actions={{ save: savePatientAction, reload: reloadPatientAction }}
          />
          <ConsentSection
            patientId={patientId}
            consents={consents.ok ? consents.value : []}
            termsVersion={terms.ok && terms.value ? terms.value.version : null}
            canManage={canManage && details.active}
            actions={{ record: recordConsentAction, openFile: openConsentFileAction }}
          />
        </TabsContent>
        {appointments ? (
          <TabsContent value="appointments" className="grid gap-4 pt-4">
            {appointments.ok ? (
              <>
                <AppointmentsTable
                  items={appointments.value.items}
                  showPatient={false}
                  hrefOf={(item) =>
                    `/schedule?${new URLSearchParams({
                      unit: item.unitId,
                      date: dateInTimeZone(new Date(item.startsAt), item.unitTimeZone),
                      appointment: item.id,
                    }).toString()}`
                  }
                  emptyText={t("patients.ui.appointmentsEmpty")}
                />
                {appointments.value.total > appointments.value.items.length ? (
                  <p className="text-muted-foreground text-sm">
                    {t("patients.ui.appointmentsRecent", {
                      shown: appointments.value.items.length,
                      total: appointments.value.total,
                    })}
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">{t("patients.ui.appointmentsLoadError")}</p>
            )}
          </TabsContent>
        ) : null}
        {notes ? (
          <TabsContent value="records" className="grid gap-4 pt-4">
            {notes.ok ? (
              <ClinicalNotesTable patientId={patientId} items={notes.value.items} total={notes.value.total} />
            ) : (
              <p className="text-muted-foreground">{t("clinicalRecords.ui.loadError")}</p>
            )}
          </TabsContent>
        ) : null}
        {documentsPage?.ok && documentCategories?.ok ? (
          <TabsContent value="documents" className="grid gap-4 pt-4">
            <DocumentsTab
              patientId={patientId}
              initialPage={documentsPage.value}
              categories={documentCategories.value}
              usage={documentUsage?.ok ? documentUsage.value : null}
              timeZone={timeZone}
              canUpload={can(ctx, "document:upload")}
              actions={{
                confirmUpload: confirmDocumentUploadAction,
                list: listDocumentsAction,
                update: updateDocumentAction,
                archive: archiveDocumentAction,
                restore: restoreDocumentAction,
                usage: getStorageUsageAction,
                preview: previewDocumentAction,
                generate: generateDocumentAction,
              }}
              issue={issueOptions?.ok ? issueOptions.value : null}
            />
          </TabsContent>
        ) : null}
        {charges?.ok ? (
          <TabsContent value="billing" className="grid gap-4 pt-4">
            <BillingTab
              patient={{ id: patientId, displayName: details.displayName }}
              initial={charges.value}
              timeZone={timeZone}
              actions={billingActions}
            />
            {patientPackages?.ok ? (
              <PackagesPanel
                patient={{ id: patientId, displayName: details.displayName }}
                initial={patientPackages.value}
                timeZone={timeZone}
                canApprove={can(ctx, "billing:approve")}
                actions={packagesActions}
              />
            ) : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
