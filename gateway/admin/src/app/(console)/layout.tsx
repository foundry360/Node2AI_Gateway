import { cookies } from 'next/headers';
import { SidebarNav } from '@/components/SidebarNav';
import { TopChrome } from '@/components/TopChrome';
import { readSessionToken, SESSION_COOKIE } from '@/lib/auth-session';

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const session = await readSessionToken(token);

  return (
    <div className="shell">
      <TopChrome userName={session?.name ?? 'admin'} />
      <div className="shell-body">
        <SidebarNav />
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
