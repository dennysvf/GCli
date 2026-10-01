import type { PaletteColor } from "@/shared/kernel/palette";
import { PALETTE } from "@/shared/ui/palette/palette";
import { cn } from "@/shared/ui/utils";

// Design system 2.4 (F04): initials in ink on paper-2; the agenda color is only a 12 px dot
// next to the name, never a background behind text.
export function ProfessionalAvatar({ initials, className }: { initials: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "bg-paper-2 text-foreground inline-flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function ColorDot({ color, label }: { color: PaletteColor; label?: string }) {
  return (
    <span
      className={cn("inline-block size-3 shrink-0 rounded-full", PALETTE[color].swatch)}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}
