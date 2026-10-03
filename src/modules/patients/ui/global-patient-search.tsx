"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/shared/ui/components/input";
import { cn } from "@/shared/ui/utils";
import type { PatientSearchItem, PatientSearchResult } from "../application/search";
import { HEADER_SEARCH_LIMIT, SEARCH_MIN_LENGTH } from "../domain/limits";

const DEBOUNCE_MS = 250;

type State =
  | { kind: "idle" }
  | { kind: "short" }
  | { kind: "loading" }
  | { kind: "results"; items: PatientSearchItem[]; total: number }
  | { kind: "error" };

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    !!element && (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName))
  );
}

// Global patient search (design system 5.10, PRD F05 Experience): "/" focuses it from any screen.
export function GlobalPatientSearch({ canRegister }: { canRegister: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<State>({ kind: "idle" });
  const [active, setActive] = useState(0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "/" && !isTyping(event.target) && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const term = text.trim();
  const searchable = term.replace(/\s/g, "").length >= SEARCH_MIN_LENGTH;

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        const response = await fetch(
          `/api/patients/search?limit=${HEADER_SEARCH_LIMIT}&q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          setState({ kind: "error" });
          return;
        }
        const data = (await response.json()) as PatientSearchResult;
        setActive(0);
        setState({ kind: "results", items: data.items, total: data.total });
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") setState({ kind: "error" });
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, searchable]);

  // Empty and too-short terms are derived from the text; only real searches go through state.
  const view: State = !term ? { kind: "idle" } : !searchable ? { kind: "short" } : state;

  const items = view.kind === "results" ? view.items : [];
  const allHref = `/patients?q=${encodeURIComponent(term)}`;
  const go = (href: string) => {
    setOpen(false);
    setText("");
    router.push(href);
  };

  return (
    <div className="relative w-full max-w-[360px]">
      <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
      <Input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && view.kind !== "idle"}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label="Buscar paciente"
        placeholder="Buscar paciente (/)"
        className="pl-8"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setText("");
            inputRef.current?.blur();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, items.length));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter" && view.kind === "results") {
            event.preventDefault();
            const item = items[active];
            go(item ? `/patients/${item.id}` : allHref);
          }
        }}
      />
      {open && view.kind !== "idle" ? (
        <div
          id={listId}
          role="listbox"
          aria-label="Resultados da busca de pacientes"
          className="bg-popover shadow-floating absolute top-11 z-50 w-full rounded-lg border"
        >
          {view.kind === "short" ? (
            <p className="text-muted-foreground px-3 py-2 text-sm">Digite pelo menos 3 caracteres.</p>
          ) : view.kind === "loading" ? (
            <p className="text-muted-foreground px-3 py-2 text-sm">Buscando...</p>
          ) : view.kind === "error" ? (
            <p className="text-muted-foreground px-3 py-2 text-sm">
              Não foi possível buscar agora. Tente novamente.
            </p>
          ) : items.length === 0 ? (
            <div className="grid gap-1 px-3 py-2 text-sm">
              <p className="text-muted-foreground">
                Nenhum paciente encontrado para &quot;{text.trim()}&quot;.
              </p>
              {canRegister ? (
                <Link
                  href="/patients/new"
                  className="text-primary hover:underline"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  Cadastrar paciente
                </Link>
              ) : null}
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((item, index) => (
                <li key={item.id} role="option" aria-selected={index === active}>
                  <button
                    type="button"
                    className={cn(
                      "grid h-10 w-full content-center px-3 text-left",
                      index === active ? "bg-paper-2" : "hover:bg-paper-2",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => go(`/patients/${item.id}`)}
                  >
                    <span className="truncate text-sm font-semibold">{item.displayName}</span>
                    <span className="text-muted-foreground truncate text-xs">
                      {item.age} anos · {item.document?.display ?? `cel. final ${item.mobilePhone.slice(-4)}`}
                    </span>
                  </button>
                </li>
              ))}
              <li role="option" aria-selected={active === items.length}>
                <button
                  type="button"
                  className={cn(
                    "text-primary h-10 w-full px-3 text-left text-sm",
                    active === items.length ? "bg-paper-2" : "hover:bg-paper-2",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => go(allHref)}
                >
                  Ver todos os resultados ({view.kind === "results" ? view.total : 0})
                </button>
              </li>
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
