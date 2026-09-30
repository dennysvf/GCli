"use client";

import { useEffect } from "react";
import type { FieldValues, Path, PathValue, UseFormReturn } from "react-hook-form";

// Keeps a form's values in sessionStorage so they survive a redirect to the login page when the
// session expires (PRD F01: unsaved form data is restored after re-login).
const PREFIX = "gcli:draft:";

export function useFormDraft<T extends FieldValues, TOutput = T>(
  key: string,
  form: UseFormReturn<T, unknown, TOutput>,
): { clear: () => void } {
  const storageKey = `${PREFIX}${key}`;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        // setValue writes to each registered input directly; reset() does not override inputs
        // whose initial value came from the server-rendered HTML.
        for (const [name, value] of Object.entries(JSON.parse(saved) as Record<string, unknown>)) {
          if (value === null || value === undefined) continue;
          form.setValue(name as Path<T>, value as PathValue<T, Path<T>>, { shouldDirty: true });
        }
      }
    } catch {
      sessionStorage.removeItem(storageKey);
    }
    const subscription = form.watch((values) => {
      // Only values the user can type are kept; nulls come from schema transforms.
      const typed = Object.fromEntries(Object.entries(values).filter(([, value]) => value != null));
      sessionStorage.setItem(storageKey, JSON.stringify(typed));
    });
    return () => subscription.unsubscribe();
  }, [form, storageKey]);

  return { clear: () => sessionStorage.removeItem(storageKey) };
}
