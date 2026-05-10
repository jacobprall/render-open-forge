import { Breadcrumbs, type BreadcrumbItem } from "./breadcrumbs";

interface TopBarProps {
  breadcrumbs: BreadcrumbItem[];
  children?: React.ReactNode;
  onMenuClick?: () => void;
}

export function TopBar({ breadcrumbs, children, onMenuClick }: TopBarProps) {
  void breadcrumbs;
  void children;

  if (!onMenuClick) return null;

  return (
    <header className="flex h-10 shrink-0 items-center px-(--of-space-md) md:hidden">
      <button
        onClick={onMenuClick}
        className="flex min-h-9 min-w-9 items-center justify-center text-text-secondary hover:bg-surface-2 hover:text-text-primary transition-colors duration-(--of-duration-instant)"
        aria-label="Open menu"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>
    </header>
  );
}
