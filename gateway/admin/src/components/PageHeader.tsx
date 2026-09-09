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
  const hasSubrow = Boolean(lede || actions);

  return (
    <div className="page-header">
      <h1 className="page-title">{title}</h1>
      {hasSubrow ? (
        <div className="page-header-subrow">
          {lede ? (
            <p className={ledeClassName ? `page-lede ${ledeClassName}` : 'page-lede'}>
              {lede}
            </p>
          ) : (
            <span className="page-header-subrow-spacer" />
          )}
          {actions ? <div className="page-header-actions">{actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
