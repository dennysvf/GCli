"use client";

import type { FieldValues, Path, UseFormSetError } from "react-hook-form";
import { toast } from "sonner";
import type { ActionResult } from "@/shared/kernel/action-result";

// Shared client handling of Server Action results (spec F01 section 4): field errors go to the
// form, other errors become toasts, and an expired session redirects to the login page with the
// current path so the user comes back to the same form (draft restored by useFormDraft).
export function handleActionResult<T, F extends FieldValues>(
  result: ActionResult<T>,
  options: { setError?: UseFormSetError<F>; successMessage?: string } = {},
): result is { ok: true; data: T } {
  if (result.ok) {
    if (options.successMessage) toast.success(options.successMessage);
    return true;
  }
  const { code, message, fields } = result.error;
  if (code === "AUTH_UNAUTHENTICATED") {
    const next = `${window.location.pathname}${window.location.search}`;
    // Full navigation on purpose: it drops client state; useFormDraft restores the form after sign-in.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign(`/login?next=${encodeURIComponent(next)}&reason=expired`);
    return false;
  }
  if (fields && options.setError) {
    // Field errors are shown next to their fields.
    for (const [name, fieldMessage] of Object.entries(fields)) {
      options.setError(name as Path<F>, { type: "server", message: fieldMessage });
    }
    return false;
  }
  // Design system 5.8: errors stay until the user dismisses them.
  toast.error(message, { duration: Infinity, closeButton: true });
  return false;
}
