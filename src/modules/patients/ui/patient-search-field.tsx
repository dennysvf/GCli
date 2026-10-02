"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import type { PatientStatusFilter } from "../application/schemas";

const SEARCH_DELAY_MS = 300;

const STATUS_LABELS: Record<PatientStatusFilter, string> = {
  active: "Ativos",
  inactive: "Inativos",
  all: "Todos",
};

// Search and status filter bound to the URL, so the results page stays a Server Component.
export function PatientSearchField({ q, status }: { q: string; status: PatientStatusFilter }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(q);
  const [pending, startTransition] = useTransition();
  const firstRender = useRef(true);

  function apply(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    next.delete("page");
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    const query = next.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname));
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => apply({ q: text.trim() || undefined }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // Only the typed text schedules a search; apply reads the latest URL when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      <div className="relative w-full sm:w-96">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
        <Input
          type="search"
          aria-label="Buscar por nome, CPF ou telefone"
          placeholder="Nome, CPF ou telefone"
          className="pl-8"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <Select
        value={status}
        onValueChange={(value) => apply({ status: value === "active" ? undefined : value })}
      >
        <SelectTrigger className="w-36" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABELS) as PatientStatusFilter[]).map((value) => (
            <SelectItem key={value} value={value}>
              {STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
