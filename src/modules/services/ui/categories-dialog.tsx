"use client";

import { ArrowDown, ArrowUp, Tags, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/components/dialog";
import { Input } from "@/shared/ui/components/input";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { CategoryItem } from "../application/categories";
import { useTranslations } from "next-intl";

type CategoryActions = {
  create: (input: { name: string }) => Promise<ActionResult<unknown>>;
  rename: (input: { categoryId: string; name: string }) => Promise<ActionResult<unknown>>;
  move: (input: { categoryId: string; direction: "up" | "down" }) => Promise<ActionResult<unknown>>;
  remove: (input: { categoryId: string }) => Promise<ActionResult<unknown>>;
};

// Category management (spec F03): create, rename, reorder, and delete when no service uses it.
export function CategoriesDialog({
  categories,
  actions,
}: {
  categories: CategoryItem[];
  actions: CategoryActions;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [names, setNames] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  function run(
    key: string,
    call: () => Promise<ActionResult<unknown>>,
    successMessage?: string,
    after?: () => void,
  ) {
    startTransition(async () => {
      const result = await call();
      if (!result.ok && result.error.fields?.name) {
        setErrors((current) => ({ ...current, [key]: result.error.fields?.name ?? "" }));
        return;
      }
      if (handleActionResult(result, { successMessage })) {
        setErrors((current) => ({ ...current, [key]: "" }));
        after?.();
        router.refresh();
      }
    });
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Tags />
          {t("common.categories")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("services.ui.serviceCategories")}</DialogTitle>
          <DialogDescription>{t("services.ui.categoriesOrderHint")}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {categories.map((category, index) => {
            const name = names[category.id] ?? category.name;
            const changed = name.trim() !== category.name;
            return (
              <li key={category.id} className="grid gap-1">
                <div className="flex items-center gap-1">
                  <Input
                    aria-label={t("services.ui.categoryNameOf", { name: category.name })}
                    value={name}
                    maxLength={50}
                    onChange={(event) =>
                      setNames((current) => ({ ...current, [category.id]: event.target.value }))
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && changed) {
                        event.preventDefault();
                        run(
                          category.id,
                          () => actions.rename({ categoryId: category.id, name }),
                          t("services.ui.categoryRenamed"),
                        );
                      }
                    }}
                  />
                  {changed ? (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          category.id,
                          () => actions.rename({ categoryId: category.id, name }),
                          t("services.ui.categoryRenamed"),
                        )
                      }
                    >
                      {t("common.save")}
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("services.ui.moveUp", { name: category.name })}
                    disabled={pending || index === 0}
                    onClick={() =>
                      run(category.id, () => actions.move({ categoryId: category.id, direction: "up" }))
                    }
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("services.ui.moveDown", { name: category.name })}
                    disabled={pending || index === categories.length - 1}
                    onClick={() =>
                      run(category.id, () => actions.move({ categoryId: category.id, direction: "down" }))
                    }
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t("services.ui.deleteNamed", { name: category.name })}
                    title={
                      category.serviceCount > 0
                        ? t("services.ui.hasServices", { count: category.serviceCount })
                        : t("services.ui.deleteCategory")
                    }
                    disabled={pending || category.serviceCount > 0}
                    onClick={() =>
                      run(
                        category.id,
                        () => actions.remove({ categoryId: category.id }),
                        t("services.ui.categoryDeleted"),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
                {errors[category.id] ? (
                  <p role="alert" className="text-destructive text-sm">
                    {errors[category.id]}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        <form
          className="grid gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              "new",
              () => actions.create({ name: newName }),
              "Categoria criada",
              () => setNewName(""),
            );
          }}
        >
          <div className="flex gap-2">
            <Input
              aria-label={t("services.ui.newCategory")}
              placeholder={t("services.ui.newCategory")}
              maxLength={50}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
            />
            <Button type="submit" disabled={pending}>
              {t("common.add")}
            </Button>
          </div>
          {errors.new ? (
            <p role="alert" className="text-destructive text-sm">
              {errors.new}
            </p>
          ) : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
