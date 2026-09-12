import { redirect } from 'next/navigation';
import { requirePageSession } from '@/lib/page-auth';
import NewReleaseForm from './NewReleaseForm';

export default async function NewReleasePage() {
  const session = await requirePageSession();
  if (session.role !== 'ADMINISTRATOR') redirect('/releases');
  return <NewReleaseForm />;
}
