"use client";

import { Search, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/shared/ui/components/button";
import { Input } from "@/shared/ui/components/input";

type Result = { id: string; displayName: string; age: number; mobilePhone: string };

const MIN_LENGTH = 3;

// Patient search of the booking panel (design system 10.2 step 2): name, CPF or phone; each result
// shows the age and the last 4 phone digits to tell namesakes apart without exposing data.
export function PatientPicker({
  id,
  value,
  onChange,
  onNewPatient,
  canRegister,
  error,
}: {
  id: string;
  value: { id: string; displayName: string } | null;
  onChange: (patient: { id: string; displayName: string } | null) => void;
  onNewPatient: () => void;
  canRegister: boolean;
  error?: string;
}) {
  const listId = useId();
  const [text, setText] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [active, setActive] = useState(0);
  const term = text.trim();
  const searchable = term.replace(/\s/g, "").length >= MIN_LENGTH;

  useEffect(() => {
    if (!searchable) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/patients/search?limit=8&q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) return setResults([]);
        const data = (await response.json()) as { items: Result[] };
        setActive(0);
        setResults(data.items);
      } catch {
        // Aborted by the next keystroke.
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, searchable]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
        <span className="text-sm font-semibold">{value.displayName}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(null)}
          aria-label="Trocar paciente"
        >
          <X />
          Trocar
        </Button>
      </div>
    );
  }

  const items = searchable ? (results ?? []) : [];
  return (
    <div className="grid gap-2">
      <div className="relative">
        <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" aria-hidden />
        <Input
          id={id}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          placeholder="Nome, CPF ou telefone"
          className="pl-8"
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActive((index) => Math.min(index + 1, items.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActive((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && items[active]) {
              event.preventDefault();
              const item = items[active];
              onChange({ id: item.id, displayName: item.displayName });
            }
          }}
        />
      </div>
      {searchable ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Pacientes encontrados"
          className="divide-y rounded-md border"
        >
          {items.length === 0 ? (
            <li className="text-muted-foreground px-3 py-2 text-sm">
              {results === null ? "Buscando..." : `Nenhum paciente encontrado para "${term}".`}
            </li>
          ) : (
            items.map((item, index) => (
              <li
                key={item.id}
                role="option"
                aria-selected={index === active}
                className="hover:bg-muted aria-selected:bg-ink-blue-soft cursor-pointer px-3 py-2"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange({ id: item.id, displayName: item.displayName });
                }}
              >
                <span className="block text-sm font-semibold">{item.displayName}</span>
                <span className="text-muted-foreground text-xs">
                  {item.age} anos · final {item.mobilePhone.slice(-4)}
                </span>
              </li>
            ))
          )}
        </ul>
      ) : (
        <p className="text-muted-foreground text-xs">Digite pelo menos 3 caracteres.</p>
      )}
      {canRegister ? (
        <Button type="button" variant="link" className="justify-self-start" onClick={onNewPatient}>
          Novo paciente
        </Button>
      ) : null}
    </div>
  );
}
