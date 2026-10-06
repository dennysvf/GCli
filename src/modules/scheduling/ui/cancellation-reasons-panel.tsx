"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Stamp } from "@/shared/ui/components/stamp";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import type { CancellationReasonItem } from "../application/cancellation-reasons";
import { REASON_NAME_MAX } from "../domain/limits";
import { useTranslations } from "next-intl";

// The configurable list of cancellation reasons (PRD F06), managed like the F05 lists: reasons are
// renamed or deactivated, never deleted, so cancelled appointments keep showing theirs.
export function CancellationReasonsPanel({
  items,
  actions,
}: {
  items: CancellationReasonItem[];
  actions: {
    create: (input: { name: string }) => Promise<ActionResult<CancellationReasonItem>>;
    rename: (input: { id: string; name: string }) => Promise<ActionResult<void>>;
    setActive: (input: { id: string; active: boolean }) => Promise<ActionResult<void>>;
  };
}) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

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

  return (
    <section aria-labelledby="reasons-title" className="grid gap-3">
      <h2 id="reasons-title" className="section-title">
        {t("scheduling.ui.cancellationReasons")}
      </h2>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => actions.create({ name }),
            "Motivo adicionado.",
            () => setName(""),
          );
        }}
      >
        <Field id="reason-name" label={t("scheduling.ui.newReason")} error={error}>
          <Input
            id="reason-name"
            className="w-72"
            maxLength={REASON_NAME_MAX}
            placeholder={t("scheduling.ui.reasonPlaceholder")}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
          {t("common.add")}
        </Button>
      </form>
      <div className="border-y">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.reason")}</TableHead>
              <TableHead className="w-24">{t("common.status")}</TableHead>
              <TableHead className="w-56" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className={item.active ? "" : "text-muted-foreground"}>
                  {editing?.id === item.id ? (
                    <Input
                      aria-label={t("common.newNameFor", { name: item.name })}
                      maxLength={REASON_NAME_MAX}
                      value={editing.name}
                      onChange={(event) => setEditing({ id: item.id, name: event.target.value })}
                    />
                  ) : (
                    item.name
                  )}
                </TableCell>
                <TableCell>
                  <Stamp variant={item.active ? "success" : "neutral"}>
                    {item.active ? "ATIVO" : "INATIVO"}
                  </Stamp>
                </TableCell>
                <TableCell className="text-right">
                  {editing?.id === item.id ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => actions.rename({ id: item.id, name: editing.name }),
                          t("scheduling.ui.reasonRenamed"),
                          () => setEditing(null),
                        )
                      }
                    >
                      {t("common.saveName")}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing({ id: item.id, name: item.name })}
                    >
                      {t("common.rename")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => actions.setActive({ id: item.id, active: !item.active }),
                        item.active
                          ? t("scheduling.ui.reasonDeactivated")
                          : t("scheduling.ui.reasonReactivated"),
                      )
                    }
                  >
                    {item.active ? t("common.deactivate") : t("common.reactivate")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
