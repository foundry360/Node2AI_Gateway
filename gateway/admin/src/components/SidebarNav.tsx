'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  AppWindow,
  Boxes,
  FileText,
  LayoutDashboard,
  ScrollText,
  Settings,
} from 'lucide-react';

const primary: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/applications', label: 'Applications', icon: AppWindow },
  { href: '/policies', label: 'Policies', icon: FileText },
  { href: '/models', label: 'Models', icon: Boxes },
  { href: '/audit', label: 'Audit', icon: ScrollText },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <>
      <nav className="nav">
        {primary.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link${active ? ' nav-link-active' : ''}`}
            >
              <span className="nav-icon" aria-hidden>
                <Icon size={20} strokeWidth={1.75} />
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-footer">
        <Link
          href="/system"
          className={`nav-link${pathname.startsWith('/system') ? ' nav-link-active' : ''}`}
        >
          <span className="nav-icon" aria-hidden>
            <Settings size={20} strokeWidth={1.75} />
          </span>
          System settings
        </Link>
      </div>
    </>
  );
}
