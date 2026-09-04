'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Clock, LogOut, Search } from 'lucide-react';

export function TopChrome({
  context,
  userName = 'admin',
}: {
  context?: string;
  userName?: string;
}) {
  const pathname = usePathname();
  const crumb =
    context ??
    (pathname.startsWith('/applications')
      ? 'Applications'
      : pathname.startsWith('/policies')
        ? 'Policies'
        : pathname.startsWith('/models')
          ? 'Models'
          : pathname.startsWith('/audit')
            ? 'Audit'
            : pathname.startsWith('/system')
              ? 'System'
              : 'Console');

  return (
    <header className="topchrome">
      <div className="topchrome-left">
        <Link href="/" className="topchrome-brand">
          Enigma
        </Link>
        <span className="topchrome-sep">/</span>
        <span className="topchrome-ctx">{crumb}</span>
      </div>
      <div className="topchrome-right">
        <div className="global-search" role="search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </div>
        <button type="button" className="icon-btn" aria-label="History" title="History">
          <Clock size={18} strokeWidth={1.75} />
        </button>
        <span className="topchrome-user muted">{userName}</span>
        <form action="/api/auth/logout" method="POST">
          <button type="submit" className="icon-btn" aria-label="Sign out" title="Sign out">
            <LogOut size={18} strokeWidth={1.75} />
          </button>
        </form>
        <div className="avatar" title={userName} aria-label={userName} />
      </div>
    </header>
  );
}
