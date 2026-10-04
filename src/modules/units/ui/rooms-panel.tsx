"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/shared/kernel/action-result";
import { Stamp } from "@/shared/ui/components/stamp";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import type { RoomItem } from "../application/rooms";
import { useTranslations } from "next-intl";

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
  const t = useTranslations();
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
                aria-label={t("units.ui.roomName")}
                placeholder={t("units.ui.roomName")}
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
              aria-label={t("units.ui.roomDescription")}
              placeholder={t("common.descriptionOptional")}
              value={description}
              maxLength={200}
              onChange={(event) => setDescription(event.target.value)}
              className="w-64"
            />
            <Button type="submit" disabled={pending || !name.trim()}>
              {t("units.ui.addRoom")}
            </Button>
          </HydratedFieldset>
        </form>
      )}
      {rooms.length === 0 ? (
        <p className="text-muted-foreground">{t("units.ui.noRooms")}</p>
      ) : (
        <div className="border-y">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("common.room")}</TableHead>
                <TableHead>{t("common.description")}</TableHead>
                <TableHead>{t("common.status")}</TableHead>
                {readOnly ? null : <TableHead className="w-56" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rooms.map((room) =>
                editing?.id === room.id ? (
                  <TableRow key={room.id}>
                    <TableCell>
                      <Input
                        aria-label={t("units.ui.newRoomName")}
                        value={editing.name}
                        maxLength={50}
                        onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={t("units.ui.newRoomDescription")}
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
                            t("units.ui.roomChanged"),
                            () => setEditing(null),
                          )
                        }
                      >
                        {t("common.save")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        {t("common.cancel")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  <TableRow key={room.id}>
                    <TableCell className="font-medium">{room.name}</TableCell>
                    <TableCell>{room.description ?? "—"}</TableCell>
                    <TableCell>
                      <Stamp variant={room.active ? "success" : "neutral"}>
                        {room.active ? t("common.activeFeminine") : t("common.inactiveFeminine")}
                      </Stamp>
                    </TableCell>
                    {readOnly ? null : (
                      <TableCell className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={t("common.editNamed", { name: room.name })}
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
                              room.active ? t("units.ui.roomDeactivated") : t("units.ui.roomReactivated"),
                            )
                          }
                        >
                          {room.active ? t("common.deactivate") : t("common.reactivate")}
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
