"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { maskCep } from "@/shared/kernel/address";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Alert, AlertDescription } from "@/shared/ui/components/alert";
import { Button } from "@/shared/ui/components/button";
import { Checkbox } from "@/shared/ui/components/checkbox";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Textarea } from "@/shared/ui/components/textarea";
import { AddressFields } from "@/shared/ui/forms/address-fields";
import { CpfInput } from "@/shared/ui/forms/cpf-input";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import { PhoneInput } from "@/shared/ui/forms/phone-input";
import { useFormDraft } from "@/shared/ui/forms/use-form-draft";
import type { ListItem } from "../application/lists";
import type { CreatePatientResult, DuplicateCandidate, PatientDetails } from "../application/patients";
import { createPatientSchema } from "../application/schemas";
import { isMinor } from "../domain/age";
import { MAX_TAGS_PER_PATIENT } from "../domain/limits";
import {
  GUARDIAN_RELATIONSHIP_LABELS,
  GUARDIAN_RELATIONSHIPS,
  SEX_LABELS,
  SEXES,
} from "../domain/patient-fields";
import { DuplicateDialog } from "./duplicate-dialog";

type Values = z.input<typeof createPatientSchema>;
type Parsed = z.output<typeof createPatientSchema>;

export type SavePatientInput = Parsed & { patientId?: string; version?: number };
export type SavePatientResult = CreatePatientResult | { patientId: string; version: number };

const NONE = "none";

// Labels used to list what changed when another user saved first (PRD F05 concurrent edit).
const FIELD_LABELS: Record<string, string> = {
  fullName: "Nome completo",
  socialName: "Nome social",
  birthDate: "Data de nascimento",
  sex: "Sexo",
  cpf: "CPF",
  rg: "RG",
  mobilePhone: "Celular",
  secondaryPhone: "Telefone secundário",
  email: "E-mail",
  address: "Endereço",
  occupation: "Profissão",
  observations: "Observações",
  guardian: "Responsável",
};

function defaultsFrom(patient: PatientDetails | undefined): Values {
  return {
    mode: "full",
    fullName: patient?.fullName ?? "",
    socialName: patient?.socialName ?? "",
    birthDate: patient?.birthDate ?? "",
    sex: patient?.sex ?? "NOT_INFORMED",
    cpf: patient?.cpf ?? "",
    rg: patient?.rg ?? "",
    mobilePhone: patient?.mobilePhone ?? "",
    secondaryPhone: patient?.secondaryPhone ?? "",
    email: patient?.email ?? "",
    address: {
      cep: maskCep(patient?.address.cep),
      street: patient?.address.street ?? "",
      number: patient?.address.number ?? "",
      complement: patient?.address.complement ?? "",
      district: patient?.address.district ?? "",
      city: patient?.address.city ?? "",
      state: patient?.address.state ?? "",
    },
    occupation: patient?.occupation ?? "",
    referralSourceId: patient?.referralSource?.id ?? null,
    observations: patient?.observations ?? "",
    tagIds: patient?.tags.map((tag) => tag.id) ?? [],
    guardian: patient?.guardian
      ? {
          name: patient.guardian.name,
          cpf: patient.guardian.cpf ?? "",
          relationship: patient.guardian.relationship,
          phone: patient.guardian.phone,
        }
      : { name: "", cpf: "", relationship: "MOTHER", phone: "" },
    confirmDuplicate: false,
  };
}

function changedFields(mine: PatientDetails, theirs: PatientDetails): string[] {
  return Object.keys(FIELD_LABELS).filter(
    (key) =>
      JSON.stringify((mine as Record<string, unknown>)[key]) !==
      JSON.stringify((theirs as Record<string, unknown>)[key]),
  );
}

// Patient form (PRD F05 Experience): the full form with sections, or the quick form used from the
// booking modal (full name, birth date, mobile phone, and the guardian for minors).
export function PatientForm({
  patient,
  mode = "full",
  today,
  referralSources,
  tags,
  readOnly = false,
  actions,
  onCreated,
}: {
  patient?: PatientDetails;
  mode?: "full" | "quick";
  today: string;
  referralSources: ListItem[];
  tags: ListItem[];
  readOnly?: boolean;
  actions: {
    save: (input: SavePatientInput) => Promise<ActionResult<SavePatientResult>>;
    reload?: (patientId: string) => Promise<ActionResult<PatientDetails>>;
  };
  onCreated?: (patientId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [candidates, setCandidates] = useState<DuplicateCandidate[] | null>(null);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ message: string; fields: string[] } | null>(null);
  const defaults = defaultsFrom(patient);
  const form = useForm<Values, unknown, Parsed>({
    resolver: zodResolver(createPatientSchema),
    defaultValues: defaults,
  });
  const draft = useFormDraft(`patient-${patient?.id ?? mode}`, form);
  const { errors } = form.formState;
  const birthDate = useWatch({ control: form.control, name: "birthDate" });
  const selectedTags = useWatch({ control: form.control, name: "tagIds" }) ?? [];
  const showGuardian =
    !!patient?.guardian || (/^\d{4}-\d{2}-\d{2}$/.test(birthDate ?? "") && isMinor(birthDate ?? "", today));

  const submit = (values: Parsed, confirmDuplicate: boolean) =>
    startTransition(async () => {
      setExistingId(null);
      const input: SavePatientInput = {
        ...values,
        mode,
        confirmDuplicate,
        guardian: showGuardian ? values.guardian : null,
        ...(patient ? { patientId: patient.id, version: patient.version } : {}),
      };
      const result = await actions.save(input);
      if (!result.ok && result.error.code === "PATIENTS_CPF_TAKEN") {
        form.setError("cpf", { type: "server", message: result.error.fields?.cpf ?? result.error.message });
        setExistingId(result.error.fields?.existingPatientId ?? null);
        return;
      }
      if (!result.ok && result.error.code === "PATIENTS_STALE_VERSION" && patient && actions.reload) {
        const current = await actions.reload(patient.id);
        setConflict({
          message: result.error.message,
          fields: current.ok
            ? changedFields(patient, current.data).map((key) => FIELD_LABELS[key] ?? key)
            : [],
        });
        return;
      }
      if (!handleActionResult(result, { setError: form.setError })) return;
      const data = result.data;
      if ("kind" in data && data.kind === "possible-duplicates") {
        setCandidates(data.candidates);
        return;
      }
      setCandidates(null);
      draft.clear();
      toast.success(patient ? "Cadastro salvo." : "Paciente cadastrado.");
      const patientId = data.patientId;
      if (onCreated) onCreated(patientId);
      else if (!patient) router.push(`/patients/${patientId}`);
      else router.refresh();
    });

  const onSubmit = form.handleSubmit((values) => submit(values, false));

  type TextName = "fullName" | "socialName" | "rg" | "email" | "occupation";
  const text = (name: TextName, id: string, props: Record<string, unknown> = {}) => (
    <Input
      id={id}
      readOnly={readOnly}
      defaultValue={(defaults[name] as string | null | undefined) ?? ""}
      aria-invalid={!!errors[name]}
      {...props}
      {...form.register(name)}
    />
  );

  const guardianSection = showGuardian ? (
    <fieldset className="grid gap-4 rounded-lg border p-4" data-testid="guardian-section">
      <legend className="px-1 text-sm font-semibold">Responsável</legend>
      <p className="text-muted-foreground text-xs">Obrigatório para pacientes menores de 18 anos.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="guardian-name" label="Nome do responsável" error={errors.guardian?.name?.message}>
          <Input
            id="guardian-name"
            readOnly={readOnly}
            defaultValue={defaults.guardian?.name ?? ""}
            {...form.register("guardian.name")}
          />
        </Field>
        <Field id="guardian-relationship" label="Parentesco" error={errors.guardian?.relationship?.message}>
          <Controller
            control={form.control}
            name="guardian.relationship"
            render={({ field }) => (
              <Select value={field.value ?? "MOTHER"} onValueChange={field.onChange} disabled={readOnly}>
                <SelectTrigger id="guardian-relationship" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GUARDIAN_RELATIONSHIPS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {GUARDIAN_RELATIONSHIP_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </Field>
        <Field id="guardian-phone" label="Telefone do responsável" error={errors.guardian?.phone?.message}>
          <Controller
            control={form.control}
            name="guardian.phone"
            render={({ field }) => (
              <PhoneInput
                id="guardian-phone"
                readOnly={readOnly}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        <Field id="guardian-cpf" label="CPF do responsável (opcional)" error={errors.guardian?.cpf?.message}>
          <Controller
            control={form.control}
            name="guardian.cpf"
            render={({ field }) => (
              <CpfInput id="guardian-cpf" readOnly={readOnly} value={field.value} onChange={field.onChange} />
            )}
          />
        </Field>
      </div>
    </fieldset>
  ) : null;

  return (
    <form onSubmit={onSubmit} className="grid max-w-2xl gap-6" noValidate>
      {conflict ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{conflict.message}</p>
            {conflict.fields.length > 0 ? <p>Campos alterados: {conflict.fields.join(", ")}.</p> : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => {
                draft.clear();
                window.location.reload();
              }}
            >
              Ver versão atual
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <HydratedFieldset disabled={readOnly}>
        <fieldset className="grid gap-4">
          <legend className="sr-only">Identificação</legend>
          <Field id="patient-full-name" label="Nome completo" error={errors.fullName?.message}>
            {text("fullName", "patient-full-name", { autoComplete: "off" })}
          </Field>
          {mode === "full" ? (
            <Field
              id="patient-social-name"
              label="Nome social (opcional)"
              error={errors.socialName?.message}
              hint="Quando preenchido, aparece no lugar do nome completo."
            >
              {text("socialName", "patient-social-name")}
            </Field>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="patient-birth-date" label="Data de nascimento" error={errors.birthDate?.message}>
              <Input
                id="patient-birth-date"
                type="date"
                max={today}
                readOnly={readOnly}
                defaultValue={defaults.birthDate}
                aria-invalid={!!errors.birthDate}
                {...form.register("birthDate")}
              />
            </Field>
            <Field id="patient-mobile" label="Celular" error={errors.mobilePhone?.message}>
              <Controller
                control={form.control}
                name="mobilePhone"
                render={({ field }) => (
                  <PhoneInput
                    id="patient-mobile"
                    readOnly={readOnly}
                    aria-invalid={!!errors.mobilePhone}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            </Field>
          </div>
          {mode === "full" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="patient-sex" label="Sexo" error={errors.sex?.message}>
                <Controller
                  control={form.control}
                  name="sex"
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "NOT_INFORMED"}
                      onValueChange={field.onChange}
                      disabled={readOnly}
                    >
                      <SelectTrigger id="patient-sex" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEXES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {SEX_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>
              <Field id="patient-cpf" label="CPF (opcional)" error={errors.cpf?.message}>
                <Controller
                  control={form.control}
                  name="cpf"
                  render={({ field }) => (
                    <CpfInput
                      id="patient-cpf"
                      readOnly={readOnly}
                      aria-invalid={!!errors.cpf}
                      value={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
                {existingId ? (
                  <Link href={`/patients/${existingId}`} className="text-primary text-sm hover:underline">
                    Abrir cadastro existente
                  </Link>
                ) : null}
              </Field>
              <Field id="patient-rg" label="RG (opcional)" error={errors.rg?.message}>
                {text("rg", "patient-rg")}
              </Field>
            </div>
          ) : null}
        </fieldset>

        {guardianSection}

        {mode === "full" ? (
          <>
            <fieldset className="grid gap-4">
              <legend className="mb-2 text-sm font-semibold">Contato</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="patient-secondary"
                  label="Telefone secundário (opcional)"
                  error={errors.secondaryPhone?.message}
                >
                  <Controller
                    control={form.control}
                    name="secondaryPhone"
                    render={({ field }) => (
                      <PhoneInput
                        id="patient-secondary"
                        readOnly={readOnly}
                        placeholder="(11) 3333-4444"
                        value={field.value}
                        onChange={field.onChange}
                      />
                    )}
                  />
                </Field>
                <Field id="patient-email" label="E-mail (opcional)" error={errors.email?.message}>
                  {text("email", "patient-email", { type: "email" })}
                </Field>
              </div>
            </fieldset>

            <AddressFields form={form} idPrefix="patient" defaults={defaults.address} readOnly={readOnly} />

            <fieldset className="grid gap-4">
              <legend className="mb-2 text-sm font-semibold">Outras informações</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  id="patient-occupation"
                  label="Profissão (opcional)"
                  error={errors.occupation?.message}
                >
                  {text("occupation", "patient-occupation")}
                </Field>
                <Field
                  id="patient-referral"
                  label="Como conheceu a clínica (opcional)"
                  error={errors.referralSourceId?.message}
                >
                  <Controller
                    control={form.control}
                    name="referralSourceId"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? NONE}
                        onValueChange={(value) => field.onChange(value === NONE ? null : value)}
                        disabled={readOnly}
                      >
                        <SelectTrigger id="patient-referral" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Não informado</SelectItem>
                          {referralSources
                            .filter((item) => item.active || item.id === field.value)
                            .map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                {item.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>
              {tags.length > 0 ? (
                <Field
                  id="patient-tags"
                  label="Etiquetas (opcional)"
                  error={errors.tagIds?.message}
                  hint={`Até ${MAX_TAGS_PER_PATIENT} etiquetas. ${selectedTags.length} selecionadas.`}
                >
                  <Controller
                    control={form.control}
                    name="tagIds"
                    render={({ field }) => (
                      <div id="patient-tags" className="flex flex-wrap gap-x-4 gap-y-2">
                        {tags
                          .filter((tag) => tag.active || (field.value ?? []).includes(tag.id))
                          .map((tag) => {
                            const checked = (field.value ?? []).includes(tag.id);
                            return (
                              <div key={tag.id} className="flex items-center gap-2">
                                <Checkbox
                                  id={`tag-${tag.id}`}
                                  checked={checked}
                                  disabled={
                                    readOnly ||
                                    (!checked && (field.value ?? []).length >= MAX_TAGS_PER_PATIENT)
                                  }
                                  onCheckedChange={(value) =>
                                    field.onChange(
                                      value === true
                                        ? [...(field.value ?? []), tag.id]
                                        : (field.value ?? []).filter((id) => id !== tag.id),
                                    )
                                  }
                                />
                                <Label htmlFor={`tag-${tag.id}`} className="font-normal">
                                  {tag.name}
                                </Label>
                              </div>
                            );
                          })}
                      </div>
                    )}
                  />
                </Field>
              ) : null}
              <Field
                id="patient-observations"
                label="Observações administrativas (opcional)"
                error={errors.observations?.message}
                hint="Informações não clínicas, como preferências de horário."
              >
                <Textarea
                  id="patient-observations"
                  maxLength={2000}
                  readOnly={readOnly}
                  defaultValue={defaults.observations ?? ""}
                  {...form.register("observations")}
                />
              </Field>
            </fieldset>
          </>
        ) : null}

        {readOnly ? null : (
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : patient ? "Salvar alterações" : "Cadastrar paciente"}
            </Button>
          </div>
        )}
      </HydratedFieldset>
      <DuplicateDialog
        candidates={candidates}
        pending={pending}
        onCancel={() => setCandidates(null)}
        onConfirm={() => form.handleSubmit((values) => submit(values, true))()}
      />
    </form>
  );
}

// The quick registration form that F06 embeds in the booking modal (PRD F05 Experience).
export function QuickPatientForm(props: Omit<Parameters<typeof PatientForm>[0], "mode" | "patient">) {
  return <PatientForm {...props} mode="quick" />;
}
