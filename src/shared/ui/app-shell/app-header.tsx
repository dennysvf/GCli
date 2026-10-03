import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Separator } from "@/shared/ui/components/separator";
import { SidebarTrigger } from "@/shared/ui/components/sidebar";

// Header of the authenticated shell. `unitSelector` is the slot F02 fills with the unit picker.
export function AppHeader({
  unitSelector,
  search,
  userMenu,
}: {
  unitSelector?: ReactNode;
  search?: ReactNode;
  userMenu: ReactNode;
}) {
  const t = useTranslations("shell");
  return (
    <header className="bg-card sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" aria-label={t("toggleMenu")} />
      <Separator orientation="vertical" className="mr-2 h-4" />
      <div className="flex flex-1 items-center gap-2" data-slot="unit-selector">
        {unitSelector}
      </div>
      {search ? <div className="hidden flex-1 justify-end md:flex">{search}</div> : null}
      {userMenu}
    </header>
  );
}
