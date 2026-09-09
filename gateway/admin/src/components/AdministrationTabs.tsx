'use client';

import { usePathname } from 'next/navigation';

const TABS: Array<{ href: string; label: string }> = [
  { href: '/administration/users', label: 'Users' },
  { href: '/administration/system', label: 'System' },
  { href: '/administration/credentials', label: 'Credentials' },
];

export function AdministrationTabs() {
  const pathname = usePathname();

  return (
    <div className="console-tabs-bar admin-tabs-bar">
      <div className="tabs" role="tablist" aria-label="Administration">
        {TABS.map((tab) => {
          const active =
            pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <a
              key={tab.href}
              href={tab.href}
              role="tab"
              aria-selected={active}
              className={`tab${active ? ' tab-active' : ''}`}
            >
              {tab.label}
            </a>
          );
        })}
      </div>
    </div>
  );
}
