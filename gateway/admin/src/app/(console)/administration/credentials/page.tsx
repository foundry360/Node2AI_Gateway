import { redirect } from 'next/navigation';

/** Credentials tab is hidden for V1; keep route as a redirect. */
export default function AdministrationCredentialsPage() {
  redirect('/administration/users');
}
