import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";

// Design system 5.1: primary (one per screen), secondary (outline), ghost, destructive, link.
// 36 px default height, 44 px below 1024 px for touch; 4 px radius; focus ring from globals.css.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-colors select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-ink-blue-hover",
        outline: "border-input bg-card text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary: "border-input bg-card text-foreground hover:bg-muted aria-expanded:bg-muted",
        ghost: "font-normal hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        destructive: "bg-destructive text-white hover:bg-destructive/90 dark:text-background",
        link: "h-auto px-0 font-normal text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-2 px-4 max-lg:h-11",
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 text-xs max-lg:h-11 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-11 gap-2 px-5",
        icon: "size-9 max-lg:size-11",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8 max-lg:size-11",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
