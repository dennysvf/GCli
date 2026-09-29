"use client";

import { LogOut } from "lucide-react";
import { Avatar, AvatarFallback } from "@/shared/ui/components/avatar";
import { Button } from "@/shared/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/components/dropdown-menu";

const ROLE_LABELS: Record<string, string> = {
  ADMINISTRATOR: "Administrador",
  MANAGER: "Gestor",
  FRONT_DESK: "Recepção",
  PROFESSIONAL: "Profissional",
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : ""}`.toUpperCase();
}

export function UserMenu({
  name,
  email,
  role,
  signOutAction,
}: {
  name: string;
  email: string;
  role: string;
  signOutAction: () => Promise<void>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 px-2" aria-label="Menu do usuário">
          <Avatar className="size-7">
            <AvatarFallback>{initials(name)}</AvatarFallback>
          </Avatar>
          <span className="hidden text-sm sm:inline">{name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="grid">
          <span className="truncate">{name}</span>
          <span className="text-muted-foreground truncate text-xs font-normal">{email}</span>
          <span className="text-muted-foreground text-xs font-normal">{ROLE_LABELS[role] ?? role}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full">
              <LogOut />
              Sair
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
