import Link from "next/link";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-zinc-600">/</span>}
            {isLast || !item.href ? (
              <span className={isLast ? "text-zinc-100" : "text-zinc-400"}>
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-zinc-400 transition-colors hover:text-zinc-100"
              >
                {item.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
