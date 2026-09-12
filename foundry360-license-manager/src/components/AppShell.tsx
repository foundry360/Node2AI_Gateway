'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV = [
  { href: '/', label: 'Dashboard' },
  { href: '/customers', label: 'Customers' },
  { href: '/deployments', label: 'Deployments' },
  { href: '/licenses', label: 'Licenses' },
];

export function AppShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { username: string; role: string } | null;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth', { method: 'DELETE' });
    router.push('/login');
    router.refresh();
  }

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div>
            <div className="font-display text-xl font-bold tracking-tight text-brand">
              Foundry360 License Manager
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted">
            <span>
              {user.username}{' '}
              <span className="badge badge-neutral ml-1">{user.role}</span>
            </span>
            <Link
              href="/account"
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                pathname === '/account' || pathname.startsWith('/account/')
                  ? 'bg-action text-white'
                  : 'border border-line bg-white text-ink hover:bg-slate-50'
              }`}
            >
              Change password
            </Link>
            <button type="button" className="btn btn-secondary !py-1.5 !text-xs" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-6 pb-3">
          {NAV.map((item) => {
            const active =
              item.href === '/'
                ? pathname === '/'
                : pathname === item.href || pathname.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-action text-white'
                    : 'text-muted hover:bg-slate-100 hover:text-ink'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
