"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/shared/ui/components/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/components/select";
import type { ServiceStatusFilter } from "../application/schemas";

const ALL = "all";
const SEARCH_DELAY_MS = 300;

const STATUS_LABELS: Record<ServiceStatusFilter, string> = {
  active: "Ativos",
  inactive: "Inativos",
  all: "Todos",
};

// Filters live in the URL so the list is a Server Component and links can be shared.
export function ServicesFilters({
  categories,
  search,
  categoryId,
  status,
}: {
  categories: { id: string; name: string }[];
  search?: string;
  categoryId?: string;
  status: ServiceStatusFilter;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [text, setText] = useState(search ?? "");
  const [pending, startTransition] = useTransition();
  const firstRender = useRef(true);

  function apply(changes: Record<string, string | undefined>) {
    const next = new URLSearchParams(params);
    next.delete("service");
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
      <div className="relative w-full sm:w-72">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
        <Input
          type="search"
          aria-label="Buscar serviço por nome"
          placeholder="Buscar por nome"
          className="pl-8"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </div>
      <Select
        value={categoryId ?? ALL}
        onValueChange={(value) => apply({ category: value === ALL ? undefined : value })}
      >
        <SelectTrigger className="w-48" aria-label="Categoria">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas as categorias</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={status}
        onValueChange={(value) => apply({ status: value === "active" ? undefined : value })}
      >
        <SelectTrigger className="w-36" aria-label="Status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(STATUS_LABELS) as ServiceStatusFilter[]).map((value) => (
            <SelectItem key={value} value={value}>
              {STATUS_LABELS[value]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
