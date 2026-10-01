import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

// Status stamp ("carimbo", design system 5.5): rectangular, 1 px border, 2 px radius, uppercase
// 12 px text in the tones of its semantic function. Never an icon, a pill or a click target.
const stampVariants = cva(
  "column-label inline-flex h-5 w-fit font-sans shrink-0 items-center rounded-xs border px-1.5 whitespace-nowrap",
  {
    variants: {
      variant: {
        neutral: "border-input bg-card text-muted-foreground",
        strong: "border-input bg-card text-foreground",
        cancelled: "border-input bg-card text-muted-foreground line-through",
        success: "border-success-border bg-success-bg text-success",
        warning: "border-warning-border bg-warning-bg text-warning",
        danger: "border-danger-border bg-danger-bg text-danger",
        info: "border-info-border bg-info-bg text-info",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

type StampVariant = NonNullable<VariantProps<typeof stampVariants>["variant"]>;

function Stamp({
  className,
  variant = "neutral",
  ...props
}: React.ComponentProps<"span"> & { variant?: StampVariant }) {
  return (
    <span
      data-slot="stamp"
      data-variant={variant}
      className={cn(stampVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Stamp, stampVariants, type StampVariant };
