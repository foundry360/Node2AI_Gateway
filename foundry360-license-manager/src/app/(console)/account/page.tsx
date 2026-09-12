import { requirePageSession } from '@/lib/page-auth';
import { ChangePasswordForm } from '@/components/ChangePasswordForm';

export default async function AccountPage() {
  await requirePageSession();

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Account</h1>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
