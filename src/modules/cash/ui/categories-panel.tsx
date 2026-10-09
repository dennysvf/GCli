"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/shared/ui/components/button";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { CategoryRecord } from "../application/ports";
import { CATEGORY_NAME_MAX_LENGTH } from "../domain/limits";
import type { FinanceActions } from "./cash-actions";

const NEW = "new" as const;
const KIND_KEYS = { EXPENSE: "kindExpense", REVENUE: "kindRevenue", TRANSFER: "kindTransfer" } as const;

// Configurações > Financeiro, "Categorias financeiras" (PRD F11): the categories of expenses and
// revenues. The system category for transfers cannot be renamed or turned off.
export function CategoriesPanel({
  categories,
  actions,
}: {
  categories: CategoryRecord[];
  actions: Pick<FinanceActions, "saveCategory" | "setCategoryActive">;
}) {
  const t = useTranslations("cash.ui");
  const router = useRouter();
  const [editing, setEditing] = useState<CategoryRecord | typeof NEW | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(category: CategoryRecord) {
    startTransition(async () => {
      const result = await actions.setCategoryActive({ categoryId: category.id, active: !category.active });
      if (handleActionResult(result)) router.refresh();
    });
  }

  return (
    <section className="grid gap-3" aria-label={t("categoriesTitle")}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="section-title">{t("categoriesTitle")}</h2>
        <Button type="button" variant="outline" onClick={() => setEditing(NEW)}>
          {t("newCategory")}
        </Button>
      </div>
      <div className="border-y">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name")}</TableHead>
              <TableHead>{t("kind")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id}>
                <TableCell className="font-semibold">{category.name}</TableCell>
                <TableCell>{t(KIND_KEYS[category.kind])}</TableCell>
                <TableCell>
                  <Stamp variant={category.active ? "success" : "neutral"}>
                    {category.active ? t("active") : t("inactive")}
                  </Stamp>
                </TableCell>
                <TableCell className="text-right">
                  {category.system ? (
                    <span className="text-muted-foreground text-xs">{t("systemCategory")}</span>
                  ) : (
                    <div className="flex justify-end gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(category)}>
                        {t("rename")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => toggle(category)}
                      >
                        {category.active ? t("deactivate") : t("activate")}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing ? (
        <CategoryForm
          category={editing === NEW ? null : editing}
          actions={actions}
          onSaved={() => router.refresh()}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

function CategoryForm({
  category,
  actions,
  onSaved,
  onClose,
}: {
  category: CategoryRecord | null;
  actions: Pick<FinanceActions, "saveCategory">;
  onSaved: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("cash.ui");
  const [name, setName] = useState(category?.name ?? "");
  const [kind, setKind] = useState<"EXPENSE" | "REVENUE">(
    category && category.kind !== "TRANSFER" ? category.kind : "EXPENSE",
  );
  const [pending, startTransition] = useTransition();

  function submit() {
    startTransition(async () => {
      const result = await actions.saveCategory({
        ...(category ? { categoryId: category.id } : {}),
        kind,
        name: name.trim(),
      });
      if (!handleActionResult(result, { successMessage: t("categorySavedToast") })) return;
      onSaved();
      onClose();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim() && !pending) submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{category ? t("rename") : t("newCategory")}</DialogTitle>
            <DialogDescription>{t("categoryHint")}</DialogDescription>
          </DialogHeader>
          {category ? null : (
            <div className="grid gap-1">
              <Label htmlFor="category-kind">{t("kind")}</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as "EXPENSE" | "REVENUE")}>
                <SelectTrigger id="category-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">{t("kindExpense")}</SelectItem>
                  <SelectItem value="REVENUE">{t("kindRevenue")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1">
            <Label htmlFor="category-name">{t("name")}</Label>
            <Input
              id="category-name"
              value={name}
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              {t("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
