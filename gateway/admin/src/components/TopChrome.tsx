'use client';

import { Search } from 'lucide-react';
import { ProfileMenu } from '@/components/ProfileMenu';

export function TopChrome({ userName = 'admin' }: { userName?: string }) {
  return (
    <header className="topchrome">
      <div className="topchrome-left">
        <a href="/" className="topchrome-brand" aria-label="Enigma home">
          <img
            src="/brand/enigma-logo.png"
            alt="Enigma"
            className="topchrome-logo topchrome-logo-on-dark"
          />
          <img
            src="/brand/enigma-logo-on-light.png"
            alt="Enigma"
            className="topchrome-logo topchrome-logo-on-light"
          />
        </a>
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
