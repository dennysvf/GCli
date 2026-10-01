import type { ReactNode } from "react";

// Page header (design system 4.2, "record header"): serif title, optional breadcrumb and
// metadata, at most one primary action among the actions, and the double rule underneath.
export function PageHeader({
  title,
  titleAddon,
  meta,
  breadcrumb,
  actions,
}: {
  title: ReactNode;
  titleAddon?: ReactNode;
  meta?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="double-rule grid gap-1 pb-4">
      {breadcrumb ? (
        <nav aria-label="Trilha" className="text-muted-foreground text-xs">
          {breadcrumb}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title">{title}</h1>
          {titleAddon}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {meta ? <p className="text-muted-foreground text-xs">{meta}</p> : null}
    </header>
  );
}
