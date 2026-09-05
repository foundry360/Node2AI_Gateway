'use client';

import { usePathname } from 'next/navigation';
import { Search } from 'lucide-react';
import { ProfileMenu } from '@/components/ProfileMenu';

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
        <a href="/" className="topchrome-brand">
          Enigma
        </a>
        <span className="topchrome-sep">/</span>
        <span className="topchrome-ctx">{crumb}</span>
      </div>
      <div className="topchrome-right">
        <div className="global-search" role="search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <span>Search</span>
          <kbd>⌘K</kbd>
        </div>
        <ProfileMenu userName={userName} />
      </div>
    </header>
  );
}
