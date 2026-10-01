"use client";

import * as React from "react";
import { cn } from "cn";
import { Tabs as TabsPrimitive } from "radix-ui";

// Design system 5.3: tabs are text with a 2 px ink-blue underline on the active one; no pills.
function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn("group/tabs flex gap-4 data-horizontal:flex-col", className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "text-muted-foreground flex w-full max-w-full items-center gap-6 overflow-x-auto border-b group-data-vertical/tabs:w-fit group-data-vertical/tabs:flex-col group-data-vertical/tabs:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "hover:text-foreground data-active:text-foreground relative inline-flex h-10 shrink-0 items-center gap-1.5 text-sm whitespace-nowrap transition-colors disabled:pointer-events-none disabled:opacity-50 data-active:font-semibold max-lg:h-11 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "after:bg-primary after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:opacity-0 data-active:after:opacity-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 text-sm", className)} {...props} />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
