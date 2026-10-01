import type { Metadata } from "next";
import Link from "next/link";
import { forbidden, notFound } from "next/navigation";
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
import { can } from "@/shared/authz/permissions";
import { dateInTimeZone } from "@/shared/kernel/time-zones";
import { PageHeader } from "@/shared/ui/app-shell/page-header";
import { Stamp } from "@/shared/ui/components/stamp";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/components/tabs";
import {
  openConsentFileAction,
  recordConsentAction,
  reloadPatientAction,
  savePatientAction,
  setPatientActiveAction,
} from "../actions";

export const metadata: Metadata = { title: "Paciente" };

export default async function PatientPage({ params }: PageProps<"/patients/[patientId]">) {
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
  const [profile, sources, tags, consents, terms] = await Promise.all([
    getOrganizationProfile(ctx),
    patients.listItems(ctx, "referral-source"),
    patients.listItems(ctx, "tag"),
    patients.listConsents(ctx, patientId),
    patients.getCurrentTerms(ctx),
  ]);
  const today = dateInTimeZone(new Date(), profile.ok ? profile.value.timeZone : "America/Sao_Paulo");

  return (
    <div className="grid gap-6">
      <PageHeader
        title={details.displayName}
        titleAddon={details.active ? null : <Stamp variant="neutral">Inativo</Stamp>}
        meta={<PatientHeaderMeta patient={details} />}
        breadcrumb={
          <Link href="/patients" className="underline-offset-4 hover:underline">
            Pacientes
          </Link>
        }
        actions={
          canManage ? (
            <PatientActiveControl
              patientId={patientId}
              active={details.active}
              action={setPatientActiveAction}
            />
          ) : null
        }
      />
      <IncompleteRecordAlert patient={details} />
      {/* PRD F05: the other tabs (Agendamentos, Documentos, Financeiro, Linha do tempo) arrive with
          the features that fill them. */}
      <Tabs defaultValue="data">
        <TabsList>
          <TabsTrigger value="data">Dados</TabsTrigger>
        </TabsList>
        <TabsContent value="data" className="grid gap-8 pt-4">
          <PatientForm
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
      </Tabs>
    </div>
  );
}
