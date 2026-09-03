import Link from 'next/link';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-sans',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
});

export const metadata = {
  title: 'Node2AI Gateway Admin',
  description: 'Governance console for the Node2AI AI Governance Gateway',
};

const nav = [
  { href: '/', label: 'Overview' },
  { href: '/applications', label: 'Applications' },
  { href: '/policies', label: 'Policies' },
  { href: '/models', label: 'Models' },
  { href: '/audit', label: 'Audit' },
  { href: '/system', label: 'System' },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable}`}>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-name">Node2AI</div>
              <div className="brand-sub">Gateway Admin</div>
            </div>
            <nav className="nav">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="nav-link">
                  {item.label}
                </Link>
              ))}
            </nav>
            <p className="sidebar-note">
              Governance console only. AI execution is not available here.
            </p>
          </aside>
          <main className="main">{children}</main>
        </div>
      </body>
    </html>
  );
}
