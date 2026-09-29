"use client";

import { useEffect } from "react";
import type { FieldValues, UseFormReturn } from "react-hook-form";

// Keeps a form's values in sessionStorage so they survive a redirect to the login page when the
// session expires (PRD F01: unsaved form data is restored after re-login).
const PREFIX = "gcli:draft:";

export function useFormDraft<T extends FieldValues>(
  key: string,
  form: UseFormReturn<T>,
): { clear: () => void } {
  const storageKey = `${PREFIX}${key}`;

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved)
        form.reset(
          { ...form.getValues(), ...(JSON.parse(saved) as Partial<T>) },
          { keepDefaultValues: true },
        );
    } catch {
      sessionStorage.removeItem(storageKey);
    }
    const subscription = form.watch((values) => {
      sessionStorage.setItem(storageKey, JSON.stringify(values));
    });
    return () => subscription.unsubscribe();
  }, [form, storageKey]);

  return { clear: () => sessionStorage.removeItem(storageKey) };
}
