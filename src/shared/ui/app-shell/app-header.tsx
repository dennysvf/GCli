import type { ReactNode } from "react";
import { Separator } from "@/shared/ui/components/separator";
import { SidebarTrigger } from "@/shared/ui/components/sidebar";

// Header of the authenticated shell. `unitSelector` is the slot F02 fills with the unit picker.
export function AppHeader({ unitSelector, userMenu }: { unitSelector?: ReactNode; userMenu: ReactNode }) {
  return (
    <header className="bg-background sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" aria-label="Alternar menu" />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex flex-1 items-center gap-2" data-slot="unit-selector">
        {unitSelector}
      </div>
      {userMenu}
    </header>
  );
}
