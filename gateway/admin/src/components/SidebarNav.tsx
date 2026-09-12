'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  AppWindow,
  Boxes,
  Eye,
  FileText,
  Gavel,
  LayoutDashboard,
  Shield,
} from 'lucide-react';
import { useAdminCapabilities } from '@/hooks/useAdminCapabilities';

const SIDEBAR_MODE_KEY = 'enigma.admin.sidebarMode';

type SidebarMode = 'expanded' | 'collapsed' | 'hover';

const primary: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: '/', label: 'Console', icon: LayoutDashboard },
  { href: '/applications', label: 'Applications', icon: AppWindow },
  { href: '/policies', label: 'Policies', icon: FileText },
  { href: '/decisions', label: 'Decisions', icon: Gavel },
  { href: '/models', label: 'Models', icon: Boxes },
  { href: '/audit', label: 'Audit', icon: Eye },
];

const modeActions: Array<{ id: SidebarMode; label: string }> = [
  { id: 'expanded', label: 'Expanded' },
  { id: 'collapsed', label: 'Collapsed' },
  { id: 'hover', label: 'Expand on hover' },
];

function SidebarControlIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <path strokeDasharray="2.2 2.4" d="M9 5.5v13" />
    </svg>
  );
}

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

function readStoredMode(): SidebarMode {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_MODE_KEY);
    if (raw === 'collapsed' || raw === 'expanded' || raw === 'hover') return raw;
    if (window.localStorage.getItem('enigma.admin.sidebarCollapsed') === '1') {
      return 'collapsed';
    }
  } catch {
    /* ignore */
  }
  return 'expanded';
}

function persistMode(mode: SidebarMode) {
  try {
    window.localStorage.setItem(SIDEBAR_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function SidebarNav() {
  const pathname = usePathname();
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<SidebarMode>('expanded');
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const { canMutateAdmin } = useAdminCapabilities();
  const showAdministration = canMutateAdmin;

  useEffect(() => {
    setMode(readStoredMode());
  }, []);

  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const visuallyCollapsed =
    mode === 'collapsed' || (mode === 'hover' && !hoverExpanded && !menuOpen);

  function selectMode(next: SidebarMode) {
    setMode(next);
    persistMode(next);
    setMenuOpen(false);
    if (next !== 'hover') setHoverExpanded(false);
  }

  return (
    <aside
      className={`sidebar${visuallyCollapsed ? ' sidebar-collapsed' : ''}${
        mode === 'hover' ? ' sidebar-hover-mode' : ''
      }`}
      onMouseEnter={() => {
        if (mode === 'hover') setHoverExpanded(true);
      }}
      onMouseLeave={() => {
        if (mode === 'hover' && !menuOpen) setHoverExpanded(false);
      }}
    >
      <nav className="nav" aria-label="Primary">
        {primary.map((item) => {
          const active = isNavActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              className={`nav-link${active ? ' nav-link-active' : ''}`}
              title={visuallyCollapsed ? item.label : undefined}
            >
              <span className="nav-icon" aria-hidden>
                <Icon size={20} strokeWidth={1.75} />
              </span>
              <span className="nav-label">{item.label}</span>
            </a>
          );
        })}

        {showAdministration ? (
          <a
            href="/administration/users"
            className={`nav-link${
              pathname.startsWith('/administration') || pathname.startsWith('/system')
                ? ' nav-link-active'
                : ''
            }`}
            title={visuallyCollapsed ? 'Administration' : undefined}
          >
            <span className="nav-icon" aria-hidden>
              <Shield size={20} strokeWidth={1.75} />
            </span>
            <span className="nav-label">Administration</span>
          </a>
        ) : null}
      </nav>

      <div className="sidebar-collapse" ref={menuRef}>
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={() => setMenuOpen((open) => !open)}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label="Sidebar control"
          title="Sidebar control"
        >
          <SidebarControlIcon />
        </button>

        {menuOpen ? (
          <div
            className="sidebar-mode-menu"
            id={menuId}
            role="dialog"
            aria-label="Sidebar control"
          >
            <p className="sidebar-mode-title">Sidebar control</p>
            <div className="sidebar-mode-rule" aria-hidden />
            <div className="sidebar-mode-list" role="radiogroup" aria-label="Sidebar mode">
              {modeActions.map((action) => {
                const selected = mode === action.id;
                return (
                  <button
                    key={action.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`sidebar-mode-item${selected ? ' is-selected' : ''}`}
                    onClick={() => selectMode(action.id)}
                  >
                    <span className="sidebar-mode-radio" aria-hidden />
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
