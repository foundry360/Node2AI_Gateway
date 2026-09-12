import { redirect } from 'next/navigation';
import { readSession } from './auth';

export async function requirePageSession() {
  const session = await readSession();
  if (!session) redirect('/login');
  return session;
}
