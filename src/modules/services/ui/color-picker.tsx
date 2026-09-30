"use client";

import { Check } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/shared/ui/utils";
import { SERVICE_COLORS, type ServiceColor } from "../domain/palette";
import { PALETTE } from "./palette";

// Radio group of the 16 palette swatches; arrow keys move the selection, as in native radios.
export function ColorPicker({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: ServiceColor;
  onChange: (color: ServiceColor) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step || disabled) return;
    event.preventDefault();
    const index = SERVICE_COLORS.indexOf(value);
    const next = SERVICE_COLORS[(index + step + SERVICE_COLORS.length) % SERVICE_COLORS.length] ?? value;
    onChange(next);
    refs.current[next]?.focus();
  }

  return (
    <div id={id} role="radiogroup" aria-label="Cor" className="grid grid-cols-8 gap-2" onKeyDown={onKeyDown}>
      {SERVICE_COLORS.map((color) => {
        const selected = color === value;
        return (
          <button
            key={color}
            ref={(element) => {
              refs.current[color] = element;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={PALETTE[color].label}
            title={PALETTE[color].label}
            tabIndex={selected ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(color)}
            className={cn(
              "focus-visible:ring-ring flex size-8 items-center justify-center rounded-full text-white outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-60",
              PALETTE[color].swatch,
              selected && "ring-foreground ring-2 ring-offset-2",
            )}
          >
            {selected ? <Check className="size-4" aria-hidden /> : null}
          </button>
        );
      })}
    </div>
  );
}
