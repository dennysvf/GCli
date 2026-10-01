import * as React from "react";
import { cn } from "cn";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground hover:border-ink-2 focus-visible:border-ring aria-invalid:border-destructive read-only:bg-muted disabled:bg-muted disabled:text-muted-foreground bg-card flex field-sizing-content min-h-16 w-full rounded-md border px-3 py-2 text-base transition-colors outline-none disabled:cursor-not-allowed md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
