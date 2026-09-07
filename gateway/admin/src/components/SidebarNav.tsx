'use client';

import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  AppWindow,
  Boxes,
  Eye,
  FileText,
  Gavel,
  LayoutDashboard,
  Settings,
} from 'lucide-react';

const primary: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/applications', label: 'Applications', icon: AppWindow },
  { href: '/policies', label: 'Policies', icon: FileText },
  { href: '/decisions', label: 'Decisions', icon: Gavel },
  { href: '/models', label: 'Models', icon: Boxes },
  { href: '/audit', label: 'Observability', icon: Eye },
];

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/decisions') {
    return (
      pathname === '/decisions' ||
      pathname.startsWith('/decisions/') ||
      pathname.startsWith('/evaluations/')
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="nav">
        {primary.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`nav-link${active ? ' nav-link-active' : ''}`}
            >
              <span className="nav-icon" aria-hidden>
                <Icon size={20} strokeWidth={1.75} />
              </span>
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <a
          href="/system"
          className={`nav-link${pathname.startsWith('/system') ? ' nav-link-active' : ''}`}
        >
          <span className="nav-icon" aria-hidden>
            <Settings size={20} strokeWidth={1.75} />
          </span>
          System settings
        </a>
      </div>
    </>
  );
}
