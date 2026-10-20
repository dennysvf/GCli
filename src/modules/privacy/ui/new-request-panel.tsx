"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/components/sheet";
import { Textarea } from "@/shared/ui/components/textarea";
import { Field } from "@/shared/ui/forms/field";
import { REQUEST_TYPES, REQUESTER_KINDS } from "../domain/lgpd-request";
import { REQUEST_DESCRIPTION_MAX } from "../domain/limits";
import type { RequestActions } from "./request-actions";

type Patient = { id: string; displayName: string };
type Result = { id: string; displayName: string; age: number; mobilePhone: string };

const MIN_SEARCH = 3;

// Patient search of the panel: name, document or phone (the F05 search, every status), with the age
// to tell namesakes apart.
function PatientChooser({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: Patient | null;
  onChange: (patient: Patient | null) => void;
  error?: string;
}) {
  const t = useTranslations();
  const listId = useId();
  const [text, setText] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const term = text.trim();
  const searchable = term.replace(/\s/g, "").length >= MIN_SEARCH;

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/patients/search?limit=8&status=all&q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        if (!response.ok) return setResults([]);
        const data = (await response.json()) as { items: Result[] };
        setResults(data.items);
      } catch {
        // Aborted by the next keystroke.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, searchable]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="text-sm font-semibold">{value.displayName}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
          aria-label={t("privacy.requests.changePatient")}
        >
          <X />
          {t("privacy.requests.changePatient")}
        </Button>
      </div>
    );
  }
  const items = searchable ? (results ?? []) : [];
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
        <Input
          id={id}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder={t("patients.ui.nameDocumentPhone")}
          className="pl-8"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      {searchable ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("privacy.requests.patientsFound")}
          className="divide-y rounded-md border"
        >
          {items.length === 0 ? (
            <li className="text-muted-foreground px-3 py-2 text-sm">
              {results === null ? t("common.searching") : t("patients.ui.noPatientsFound", { term })}
            </li>
          ) : (
            items.map((item) => (
              <li
                key={item.id}
                role="option"
                aria-selected={false}
                className="hover:bg-muted cursor-pointer px-3 py-2"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange({ id: item.id, displayName: item.displayName });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onChange({ id: item.id, displayName: item.displayName });
                }}
                tabIndex={0}
              >
                <span className="block text-sm font-semibold">{item.displayName}</span>
                <span className="text-muted-foreground text-xs">
                  {t("patients.ui.ageYears", { age: item.age })}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">{t("patients.ui.typeAtLeast3")}</p>
      )}
    </div>
  );
}

// "Nova solicitação" (PRD F14 Experience, design system 5.21): a side panel with the patient, the
// type, who asked and the description (also the recorded reason of an export).
export function NewRequestPanel({ actions }: { actions: RequestActions }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [type, setType] = useState<string>("");
  const [requestedBy, setRequestedBy] = useState<string>("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  function reset() {
    setPatient(null);
    setType("");
    setRequestedBy("");
    setDescription("");
    setErrors({});
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await actions.create({
        patientId: patient?.id ?? "",
        type,
        requestedBy,
        description,
      });
      if (result.ok) {
        toast.success(t("privacy.requests.created"));
        setOpen(false);
        reset();
        router.refresh();
        return;
      }
      if (result.error.fields) setErrors(result.error.fields);
      else toast.error(result.error.message, { duration: Infinity, closeButton: true });
    });
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {t("privacy.requests.new")}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) reset();
        }}
      >
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{t("privacy.requests.new")}</SheetTitle>
            <SheetDescription>{t("privacy.requests.newHint")}</SheetDescription>
          </SheetHeader>
          <form className="grid gap-4 px-6" onSubmit={submit} noValidate>
            <Field id="request-patient" label={t("privacy.requests.patient")} error={errors.patientId}>
              <PatientChooser
                id="request-patient"
                value={patient}
                onChange={setPatient}
                error={errors.patientId}
              />
            </Field>
            <Field id="request-type" label={t("privacy.requests.type")} error={errors.type}>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger
                  id="request-type"
                  className="w-full"
                  aria-invalid={errors.type ? true : undefined}
                >
                  <SelectValue placeholder={t("privacy.requests.type")} />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`privacy.requests.types.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="request-requester"
              label={t("privacy.requests.requestedBy")}
              error={errors.requestedBy}
            >
              <Select value={requestedBy} onValueChange={setRequestedBy}>
                <SelectTrigger
                  id="request-requester"
                  className="w-full"
                  aria-invalid={errors.requestedBy ? true : undefined}
                >
                  <SelectValue placeholder={t("privacy.requests.requestedBy")} />
                </SelectTrigger>
                <SelectContent>
                  {REQUESTER_KINDS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {t(`privacy.requests.requesters.${value}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field
              id="request-description"
              label={t("privacy.requests.description")}
              error={errors.description}
              hint={t("privacy.requests.descriptionHint")}
            >
              <Textarea
                id="request-description"
                rows={5}
                maxLength={REQUEST_DESCRIPTION_MAX}
                value={description}
                aria-invalid={errors.description ? true : undefined}
                aria-describedby={errors.description ? "request-description-error" : undefined}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <p className="text-muted-foreground -mt-2 text-xs tabular-nums">
              {t("privacy.requests.characters", { count: description.length, max: REQUEST_DESCRIPTION_MAX })}
            </p>
            <SheetFooter className="bg-popover sticky bottom-0 border-t px-0">
              <Button type="submit" disabled={pending}>
                {pending ? t("privacy.requests.submitting") : t("privacy.requests.submit")}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}
