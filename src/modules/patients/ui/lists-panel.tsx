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
import type { ListItem } from "../application/lists";
import type { ListKind } from "../application/schemas";

// One configurable list (PRD F05): referral sources or tags. Items are renamed or deactivated,
// never deleted, so patients that use them keep showing them.
export function ListsPanel({
  list,
  title,
  placeholder,
  items,
  actions,
}: {
  list: ListKind;
  title: string;
  placeholder: string;
  items: ListItem[];
  actions: {
    create: (input: { list: ListKind; name: string }) => Promise<ActionResult<{ id: string }>>;
    rename: (input: { list: ListKind; id: string; name: string }) => Promise<ActionResult<{ id: string }>>;
    setActive: (input: {
      list: ListKind;
      id: string;
      active: boolean;
    }) => Promise<ActionResult<{ active: boolean }>>;
  };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const prefix = `list-${list}`;

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
    <section aria-labelledby={`${prefix}-title`} className="grid gap-3">
      <h2 id={`${prefix}-title`} className="section-title">
        {title}
      </h2>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          run(
            () => actions.create({ list, name }),
            "Item adicionado.",
            () => setName(""),
          );
        }}
      >
        <Field id={`${prefix}-name`} label="Novo item" error={error}>
          <Input
            id={`${prefix}-name`}
            className="w-64"
            maxLength={40}
            placeholder={placeholder}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Button type="submit" variant="outline" disabled={pending || !name.trim()}>
          Adicionar
        </Button>
      </form>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum item cadastrado.</p>
      ) : (
        <div className="border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-24">Status</TableHead>
                <TableHead className="w-48" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {editing?.id === item.id ? (
                      <Input
                        aria-label={`Novo nome para ${item.name}`}
                        maxLength={40}
                        value={editing.name}
                        onChange={(event) => setEditing({ id: item.id, name: event.target.value })}
                      />
                    ) : (
                      item.name
                    )}
                  </TableCell>
                  <TableCell>
                    <Stamp variant={item.active ? "success" : "neutral"}>
                      {item.active ? "Ativo" : "Inativo"}
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
                            () => actions.rename({ list, id: item.id, name: editing.name }),
                            "Item renomeado.",
                            () => setEditing(null),
                          )
                        }
                      >
                        Salvar nome
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing({ id: item.id, name: item.name })}
                      >
                        Renomear
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => actions.setActive({ list, id: item.id, active: !item.active }),
                          item.active ? "Item desativado." : "Item reativado.",
                        )
                      }
                    >
                      {item.active ? "Desativar" : "Reativar"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
