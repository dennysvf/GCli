"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/components/alert-dialog";
import { Button } from "@/shared/ui/components/button";
import { Textarea } from "@/shared/ui/components/textarea";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { TermsVersion } from "../application/terms";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";

// Privacy terms (PRD F05): the Administrator publishes numbered versions; a new version leaves the
// patients' earlier consents pending. Published versions cannot be edited.
export function TermsPanel({
  versions,
  action,
}: {
  versions: TermsVersion[];
  action: (input: { text: string }) => Promise<ActionResult<{ version: number }>>;
}) {
  const t = useTranslations();
  const format = useFormatters();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState(versions[0]?.text ?? "");
  const [error, setError] = useState<string | undefined>();
  const [confirming, setConfirming] = useState(false);

  const publish = () =>
    startTransition(async () => {
      setConfirming(false);
      setError(undefined);
      const result = await action({ text });
      if (!result.ok && result.error.fields?.text) {
        setError(result.error.fields.text);
        return;
      }
      if (handleActionResult(result, { successMessage: t("patients.ui.termsPublished") })) router.refresh();
    });

  return (
    <div className="grid max-w-3xl gap-6">
      <Field
        id="terms-text"
        label={
          versions.length > 0
            ? t("patients.ui.newTermsText", { version: versions[0]?.version ?? 0 })
            : t("patients.ui.termsText")
        }
        error={error}
        hint={t("patients.ui.termsTextHint")}
      >
        <Textarea
          id="terms-text"
          className="min-h-64"
          maxLength={20000}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>
      <div>
        <Button onClick={() => setConfirming(true)} disabled={pending || text.trim().length === 0}>
          {pending ? t("common.publishing") : t("patients.ui.publishNewVersion")}
        </Button>
      </div>

      <section aria-labelledby="terms-history" className="grid gap-2">
        <h2 id="terms-history" className="section-title">
          {t("patients.ui.publishedVersions")}
        </h2>
        {versions.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("patients.ui.noPublishedVersions")}</p>
        ) : (
          <ul className="divide-y border-y">
            {versions.map((version) => (
              <li key={version.id} className="grid gap-1 py-2 text-sm">
                <span className="font-semibold">
                  {t("common.version")} {version.version}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t("patients.ui.publishedOnBy", {
                    date: format.dateTime(version.publishedAt),
                    name: version.publishedByName ?? "—",
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("patients.ui.publishConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("patients.ui.publishConfirmBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={publish}>
              {t("patients.ui.publishVersion")} {(versions[0]?.version ?? 0) + 1}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
