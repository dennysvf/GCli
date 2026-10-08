"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import { Checkbox } from "@/shared/ui/components/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/components/dialog";
import { Input } from "@/shared/ui/components/input";
import { Label } from "@/shared/ui/components/label";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";
import type { CategoryItem } from "../application/categories";
import { CATEGORY_NAME_MAX } from "../domain/limits";
import type { SettingsActions } from "./settings-actions";

// The categories of the documents (PRD F08 Capabilities): a name and a clinical flag. They are
// renamed or deactivated, never deleted. Turning the flag on makes the documents of the category
// clinical, which cannot be undone, so it asks first.
export function CategoriesPanel({
  categories,
  actions,
}: {
  categories: CategoryItem[];
  actions: SettingsActions;
}) {
  const t = useTranslations("documents");
  const format = useFormatters();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [clinical, setClinical] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirming, setConfirming] = useState<CategoryItem | null>(null);

  const run = (call: () => Promise<ActionResult<unknown>>, success: string, after?: () => void) =>
    startTransition(async () => {
      setError(undefined);
      const result = await call();
      if (!result.ok && result.error.fields?.name) {
        setError(result.error.fields.name);
        return;
      }
      if (handleActionResult(result, { successMessage: success })) {
        after?.();
        router.refresh();
      }
    });

  const update = (category: CategoryItem, changes: Partial<{ name: string; clinical: boolean }>) =>
    run(
      () =>
        actions.updateCategory({
          categoryId: category.id,
          name: changes.name ?? category.name,
          clinical: changes.clinical ?? category.clinical,
          version: category.version,
        }),
      t("ui.categorySavedToast"),
      () => {
        setEditing(null);
        setConfirming(null);
      },
    );

  function toggleClinical(category: CategoryItem, next: boolean) {
    // Only turning it on changes documents that already exist.
    if (next && (category.documentCount ?? 0) > 0) setConfirming(category);
    else update(category, { clinical: next });
  }

  return (
    <section aria-labelledby="categories-title" className="grid gap-3">
      <h2 id="categories-title" className="section-title">
        {t("ui.categoriesTitle")}
      </h2>
      <p className="text-muted-foreground text-sm">{t("ui.categoriesHint")}</p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => actions.createCategory({ name, clinical }),
            t("ui.categorySavedToast"),
            () => {
              setName("");
              setClinical(false);
            },
          );
        }}
      >
        <Field id="new-category-name" label={t("ui.categoryName")} error={error}>
          <Input
            id="new-category-name"
            className="w-64"
            maxLength={CATEGORY_NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="new-category-clinical"
            checked={clinical}
            onCheckedChange={(checked) => setClinical(checked === true)}
          />
          <Label htmlFor="new-category-clinical">{t("ui.categoryClinical")}</Label>
        </div>
        <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
          {t("ui.addCategory")}
        </Button>
      </form>
      <div className="border-y">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("ui.categoryName")}</TableHead>
              <TableHead className="w-28">{t("ui.categoryClinical")}</TableHead>
              <TableHead className="w-32">{t("ui.columns.documents")}</TableHead>
              <TableHead className="w-28">{t("ui.columns.status")}</TableHead>
              <TableHead className="w-48" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell>
                  {editing?.id === category.id ? (
                    <Input
                      aria-label={t("ui.categoryNameFor", { name: category.name })}
                      maxLength={CATEGORY_NAME_MAX}
                      value={editing.name}
                      onChange={(event) => setEditing({ id: category.id, name: event.target.value })}
                    />
                  ) : (
                    category.name
                  )}
                </TableCell>
                <TableCell>
                  <Checkbox
                    aria-label={t("ui.categoryClinicalFor", { name: category.name })}
                    checked={category.clinical}
                    disabled={pending || category.system}
                    onCheckedChange={(checked) => toggleClinical(category, checked === true)}
                  />
                </TableCell>
                <TableCell>{format.number(category.documentCount ?? 0)}</TableCell>
                <TableCell>
                  {category.system ? (
                    <Stamp variant="neutral">{t("ui.stampSystem")}</Stamp>
                  ) : (
                    <Stamp variant={category.active ? "success" : "neutral"}>
                      {category.active ? t("ui.stampActive") : t("ui.stampInactive")}
                    </Stamp>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {category.system ? null : editing?.id === category.id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending || !editing.name.trim()}
                      onClick={() => update(category, { name: editing.name })}
                    >
                      {t("ui.saveName")}
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing({ id: category.id, name: category.name })}
                      >
                        {t("ui.rename")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(
                            () =>
                              actions.setCategoryActive({
                                categoryId: category.id,
                                active: !category.active,
                                version: category.version,
                              }),
                            t("ui.categorySavedToast"),
                          )
                        }
                      >
                        {category.active ? t("ui.deactivate") : t("ui.activate")}
                      </Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={confirming !== null} onOpenChange={(open) => !open && setConfirming(null)}>
        <DialogContent>
          {confirming ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("ui.clinicalConfirmTitle")}</DialogTitle>
                <DialogDescription>
                  {t("ui.clinicalConfirmBody", {
                    count: confirming.documentCount ?? 0,
                    name: confirming.name,
                  })}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setConfirming(null)}>
                  {t("ui.cancel")}
                </Button>
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => update(confirming, { clinical: true })}
                >
                  {t("ui.clinicalConfirm")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
