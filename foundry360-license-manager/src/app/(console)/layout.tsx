import { AppShell } from '@/components/AppShell';
import { readSession } from '@/lib/auth';

export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await readSession();
  return <AppShell user={session}>{children}</AppShell>;
}
