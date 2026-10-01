"use server";

import { withRequestContext } from "@/modules/identity/next";
import { patients, patientsMessages } from "@/modules/patients";
import { toActionResult } from "@/shared/kernel/action-result";

// Creates or updates depending on patientId, so the patient form uses one action for both.
export async function savePatientAction(input: Record<string, unknown>) {
  return withRequestContext(async (ctx) =>
    toActionResult(
      await (input.patientId ? patients.updatePatient(ctx, input) : patients.createPatient(ctx, input)),
      patientsMessages,
    ),
  );
}

// Reloads the current record after a concurrent edit, so the form can list what changed.
export async function reloadPatientAction(patientId: string) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.getPatient(ctx, patientId), patientsMessages),
  );
}

export async function setPatientActiveAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.setPatientActive(ctx, input), patientsMessages),
  );
}

export async function recordConsentAction(input: unknown) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.recordConsent(ctx, input), patientsMessages),
  );
}

export async function openConsentFileAction(input: { consentId: string }) {
  return withRequestContext(async (ctx) =>
    toActionResult(await patients.getConsentFileUrl(ctx, input.consentId), patientsMessages),
  );
}
