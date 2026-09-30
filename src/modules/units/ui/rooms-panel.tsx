"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Badge } from "@/shared/ui/components/badge";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import type { RoomItem } from "../application/rooms";

type RoomAction = (input: Record<string, unknown>) => Promise<ActionResult<unknown>>;

export function RoomsPanel({
  unitId,
  rooms,
  readOnly = false,
  actions,
}: {
  unitId: string;
  rooms: RoomItem[];
  readOnly?: boolean;
  actions: { create: RoomAction; update: RoomAction; setActive: RoomAction };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [editing, setEditing] = useState<{ id: string; name: string; description: string } | null>(null);

  const run = (
    action: RoomAction,
    input: Record<string, unknown>,
    successMessage: string,
    after?: () => void,
  ) =>
    startTransition(async () => {
      setError(undefined);
      const result = await action(input);
      if (!result.ok && result.error.fields?.name) {
        setError(result.error.fields.name);
        return;
      }
      if (handleActionResult(result, { successMessage })) {
        after?.();
        router.refresh();
      }
    });

  return (
    <div className="grid max-w-3xl gap-4">
      {readOnly ? null : (
        <form
          className="flex flex-wrap items-start gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            run(actions.create, { unitId, name, description }, "Sala criada", () => {
              setName("");
              setDescription("");
            });
          }}
        >
          <HydratedFieldset>
            <div className="grid gap-1">
              <Input
                aria-label="Nome da sala"
                placeholder="Nome da sala"
                value={name}
                maxLength={50}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={!!error}
                className="w-48"
              />
              {error ? (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              ) : null}
            </div>
            <Input
              aria-label="Descrição da sala"
              placeholder="Descrição (opcional)"
              value={description}
              maxLength={200}
              onChange={(event) => setDescription(event.target.value)}
              className="w-64"
            />
            <Button type="submit" disabled={pending || !name.trim()}>
              Adicionar sala
            </Button>
          </HydratedFieldset>
        </form>
      )}
      {rooms.length === 0 ? (
        <p className="text-muted-foreground rounded-lg border p-6 text-center">Nenhuma sala cadastrada.</p>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Sala</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Status</TableHead>
                {readOnly ? null : <TableHead className="w-56" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) =>
                editing?.id === room.id ? (
                  <TableRow key={room.id}>
                    <TableCell>
                      <Input
                        aria-label="Novo nome da sala"
                        value={editing.name}
                        maxLength={50}
                        onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label="Nova descrição da sala"
                        value={editing.description}
                        maxLength={200}
                        onChange={(event) => setEditing({ ...editing, description: event.target.value })}
                      />
                    </TableCell>
                    <TableCell />
                    <TableCell className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          run(
                            actions.update,
                            { roomId: room.id, name: editing.name, description: editing.description },
                            "Sala alterada",
                            () => setEditing(null),
                          )
                        }
                      >
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancelar
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={room.id}>
                    <TableCell className="font-medium">{room.name}</TableCell>
                    <TableCell>{room.description ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={room.active ? "default" : "secondary"}>
                        {room.active ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    {readOnly ? null : (
                      <TableCell className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Editar ${room.name}`}
                          onClick={() =>
                            setEditing({ id: room.id, name: room.name, description: room.description ?? "" })
                          }
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          onClick={() =>
                            run(
                              actions.setActive,
                              { roomId: room.id, active: !room.active },
                              room.active ? "Sala desativada" : "Sala reativada",
                            )
                          }
                        >
                          {room.active ? "Desativar" : "Reativar"}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
