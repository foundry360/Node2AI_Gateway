'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AuditPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to requests page by default
    router.replace('/audit/requests');
  }, [router]);

  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600 dark:text-gray-400">
          Loading audit logs...
        </p>
      </div>
    </div>
  );
}
