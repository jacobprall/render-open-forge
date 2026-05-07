import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";

interface TopBarProps {
  breadcrumbs: BreadcrumbItem[];
  children?: React.ReactNode;
}

export function TopBar({ breadcrumbs, children }: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
      <Breadcrumbs items={breadcrumbs} />
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}
