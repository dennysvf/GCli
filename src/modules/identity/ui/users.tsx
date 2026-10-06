"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { LOCALE_NAMES, SUPPORTED_LOCALES, type Locale } from "@/shared/i18n/locales";
import type { ActionResult } from "@/shared/kernel/action-result";
import type { Role } from "@/shared/kernel/roles";
import { Stamp, type StampVariant } from "@/shared/ui/components/stamp";
import { Button } from "@/shared/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/components/dropdown-menu";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/ui/components/table";
import { Field } from "@/shared/ui/forms/field";
import { handleActionResult } from "@/shared/ui/forms/handle-action-result";
import { HydratedFieldset } from "@/shared/ui/forms/hydrated-fieldset";
import { inviteUserSchema } from "../application/schemas";
import type { UserListItem } from "../application/users";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/shared/ui/i18n/use-formatters";

const ROLES: Role[] = ["ADMINISTRATOR", "MANAGER", "FRONT_DESK", "PROFESSIONAL"];

const STATUS_VARIANTS: Record<string, StampVariant> = {
  ACTIVE: "success",
  INACTIVE: "neutral",
  PENDING: "warning",
  EXPIRED: "danger",
};

type InviteValues = z.input<typeof inviteUserSchema>;

export function InviteUserDialog({
  action,
  defaultLocale,
}: {
  action: (input: InviteValues) => Promise<ActionResult<unknown>>;
  defaultLocale: Locale;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: { name: "", email: "", role: "FRONT_DESK", locale: defaultLocale },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit((values) =>
    startTransition(async () => {
      const result = await action(values);
      if (
        handleActionResult(result, { setError: form.setError, successMessage: t("identity.ui.inviteSent") })
      ) {
        setOpen(false);
        form.reset();
        router.refresh();
      }
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus />
          {t("identity.ui.inviteUser")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("identity.ui.inviteUser")}</DialogTitle>
          <DialogDescription>{t("identity.ui.inviteHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <HydratedFieldset>
            <Field id="invite-name" label={t("common.fullName")} error={errors.name?.message}>
              <Input id="invite-name" {...form.register("name")} />
            </Field>
            <Field id="invite-email" label={t("common.email")} error={errors.email?.message}>
              <Input id="invite-email" type="email" {...form.register("email")} />
            </Field>
            <Field id="invite-role" label={t("common.role")} error={errors.role?.message}>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="invite-role" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((value) => (
                        <SelectItem key={value} value={value}>
                          {t(`shell.roles.${value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <Field id="invite-locale" label={t("identity.ui.inviteLanguage")} error={errors.locale?.message}>
              <Controller
                control={form.control}
                name="locale"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="invite-locale" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_LOCALES.map((locale) => (
                        <SelectItem key={locale} value={locale}>
                          {LOCALE_NAMES[locale]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                {pending ? t("common.sending") : t("identity.ui.sendInvite")}
              </Button>
            </DialogFooter>
          </HydratedFieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

type RowAction = (input: Record<string, string>) => Promise<ActionResult<unknown>>;

export type UserActions = {
  changeRole: RowAction;
  deactivate: RowAction;
  reactivate: RowAction;
  resend: RowAction;
  revoke: RowAction;
};

function ChangeRoleDialog({
  user,
  action,
  onClose,
}: {
  user: Extract<UserListItem, { kind: "user" }>;
  action: RowAction;
  onClose: () => void;
}) {
  const t = useTranslations();
  const router = useRouter();
  const [role, setRole] = useState<Role>(user.role);
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("identity.ui.changeRole")}</DialogTitle>
          <DialogDescription>{user.name}</DialogDescription>
        </DialogHeader>
        <Select value={role} onValueChange={(value) => setRole(value as Role)}>
          <SelectTrigger className="w-full" aria-label={t("common.role")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`shell.roles.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await action({ userId: user.id, role });
                if (handleActionResult(result, { successMessage: t("identity.ui.roleChanged") })) {
                  onClose();
                  router.refresh();
                }
              })
            }
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UsersTable({
  items,
  canManage,
  currentUserId,
  actions,
}: {
  items: UserListItem[];
  canManage: boolean;
  currentUserId: string;
  actions: UserActions;
}) {
  const t = useTranslations();
  const format = useFormatters();
  const dateTime = (iso: string | null) => (iso ? format.dateTime(iso) : "—");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<Extract<UserListItem, { kind: "user" }> | null>(null);

  const run = (action: RowAction, input: Record<string, string>, successMessage: string) =>
    startTransition(async () => {
      if (handleActionResult(await action(input), { successMessage })) router.refresh();
    });

  if (items.length === 0) {
    return <p className="text-muted-foreground">{t("identity.ui.noUsers")}</p>;
  }

  return (
    <>
      <div className="border-y">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("common.name")}</TableHead>
              <TableHead>{t("common.email")}</TableHead>
              <TableHead>{t("common.role")}</TableHead>
              <TableHead>{t("identity.ui.linkedProfessional")}</TableHead>
              <TableHead>{t("common.status")}</TableHead>
              <TableHead>{t("identity.ui.lastAccess")}</TableHead>
              {canManage ? <TableHead className="w-12" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={`${item.kind}-${item.id}`}>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell>{item.email}</TableCell>
                <TableCell>{t(`shell.roles.${item.role}`)}</TableCell>
                <TableCell>
                  {item.kind === "user" && item.linkedProfessional ? (
                    <Link
                      className="text-primary hover:underline"
                      href={`/settings/professionals/${item.linkedProfessional.id}`}
                    >
                      {item.linkedProfessional.name}
                    </Link>
                  ) : item.kind === "user" ? (
                    "—"
                  ) : (
                    ""
                  )}
                </TableCell>
                <TableCell>
                  <Stamp variant={STATUS_VARIANTS[item.status] ?? "neutral"}>
                    {t(`identity.ui.userStatus.${item.status}`)}
                  </Stamp>
                </TableCell>
                <TableCell>
                  {item.kind === "user"
                    ? dateTime(item.lastLoginAt)
                    : t("identity.ui.expiresAt", { date: dateTime(item.expiresAt) })}
                </TableCell>
                {canManage ? (
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t("identity.ui.actionsFor", { name: item.name })}
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {item.kind === "invitation" ? (
                          <>
                            <DropdownMenuItem
                              onSelect={() =>
                                run(actions.resend, { invitationId: item.id }, t("identity.ui.inviteResent"))
                              }
                            >
                              {t("identity.ui.resendInvite")}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                run(actions.revoke, { invitationId: item.id }, t("identity.ui.inviteRevoked"))
                              }
                            >
                              {t("identity.ui.revokeInvite")}
                            </DropdownMenuItem>
                          </>
                        ) : (
                          <>
                            <DropdownMenuItem onSelect={() => setEditing(item)}>
                              {t("identity.ui.changeRole")}
                            </DropdownMenuItem>
                            {item.status === "ACTIVE" ? (
                              <DropdownMenuItem
                                disabled={item.id === currentUserId}
                                onSelect={() =>
                                  run(
                                    actions.deactivate,
                                    { userId: item.id },
                                    t("identity.ui.userDeactivated"),
                                  )
                                }
                              >
                                {t("common.deactivate")}
                              </DropdownMenuItem>
                            ) : (
                              <DropdownMenuItem
                                onSelect={() =>
                                  run(
                                    actions.reactivate,
                                    { userId: item.id },
                                    t("identity.ui.userReactivated"),
                                  )
                                }
                              >
                                {t("common.reactivate")}
                              </DropdownMenuItem>
                            )}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {editing ? (
        <ChangeRoleDialog user={editing} action={actions.changeRole} onClose={() => setEditing(null)} />
      ) : null}
    </>
  );
}
