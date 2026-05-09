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
            {i > 0 && <span className="text-text-tertiary">/</span>}
            {isLast || !item.href ? (
              <span className={isLast ? "text-text-primary" : "text-text-tertiary"}>
                {item.label}
              </span>
            ) : (
              <Link
                href={item.href}
                className="text-text-tertiary transition-colors duration-(--of-duration-instant) hover:text-text-primary"
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
