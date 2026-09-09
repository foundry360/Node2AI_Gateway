'use client';

import { useEffect } from 'react';
import { AdministrationTabs } from '@/components/AdministrationTabs';
import { useAdminCapabilities } from '@/hooks/useAdminCapabilities';

export default function AdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { role, canMutateAdmin } = useAdminCapabilities();

  useEffect(() => {
    if (role && !canMutateAdmin) {
      window.location.replace('/');
    }
  }, [role, canMutateAdmin]);

  if (role && !canMutateAdmin) {
    return (
      <div className="error" role="alert">
        You do not have permission to access Administration.
      </div>
    );
  }

  return (
    <div className="administration-page">
      <AdministrationTabs />
      {children}
    </div>
  );
}
