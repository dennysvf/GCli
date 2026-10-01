import * as React from "react";
import { cn } from "cn";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input file:text-foreground placeholder:text-muted-foreground hover:border-ink-2 focus-visible:border-ring aria-invalid:border-destructive read-only:bg-muted disabled:bg-muted disabled:text-muted-foreground bg-card h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-semibold disabled:pointer-events-none disabled:cursor-not-allowed max-lg:h-11 md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
