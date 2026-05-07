import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";

interface TopBarProps {
  breadcrumbs: BreadcrumbItem[];
  children?: React.ReactNode;
  onMenuClick?: () => void;
}

export function TopBar({ breadcrumbs, children, onMenuClick }: TopBarProps) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-800 px-4">
      <div className="flex items-center gap-2">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 md:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        )}
        <Breadcrumbs items={breadcrumbs} />
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </header>
  );
}
