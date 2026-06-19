'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { getStoredUser, mustChangePassword, clearAuth } from '@/lib/auth';
import { WorkshopProvider } from '@/context/workshop-context';

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.replace('/login'); return; }
    if (mustChangePassword()) { router.replace('/change-password'); return; }

    fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/me`, {
      credentials: 'include',
    }).then(res => {
      if (res.status === 401) {
        clearAuth().finally(() => router.replace('/login?expired=1'));
      }
    }).catch(() => {});
  }, [router]);

  return (
    <WorkshopProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50" suppressHydrationWarning>
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>
    </WorkshopProvider>
  );
}
