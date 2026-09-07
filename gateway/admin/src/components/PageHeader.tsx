import type { ReactNode } from 'react';

export function PageHeader({
  title,
  lede,
  ledeClassName,
  actions,
}: {
  title: string;
  lede?: string;
  ledeClassName?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1 className="page-title">{title}</h1>
        {lede ? (
          <p className={ledeClassName ? `page-lede ${ledeClassName}` : 'page-lede'}>
            {lede}
          </p>
        ) : null}
      </div>
      {actions ? <div className="page-header-actions">{actions}</div> : null}
    </div>
  );
}
