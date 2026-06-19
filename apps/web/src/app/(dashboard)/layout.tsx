'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { getStoredUser } from '@/lib/auth';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    if (!getStoredUser()) router.replace('/login');
  }, [router]);

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar />
      <main className="flex-1 overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
}
