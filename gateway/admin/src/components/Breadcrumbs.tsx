import Link from 'next/link';

export function Breadcrumbs({
  items,
}: {
  items: Array<{ href?: string; label: string }>;
}) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${item.label}-${i}`} className="breadcrumb-item">
            {i > 0 ? <span className="breadcrumb-sep">/</span> : null}
            {item.href && !last ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span className={last ? 'breadcrumb-current' : undefined}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
