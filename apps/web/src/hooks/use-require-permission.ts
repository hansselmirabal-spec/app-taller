'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getEffectivePermissions } from '@/lib/auth';
import type { ModuleId } from '@/types';

export function useRequirePermission(moduleId: ModuleId, action: 'view' | 'edit' = 'view') {
  const router = useRouter();

  useEffect(() => {
    const perms = getEffectivePermissions();
    if (!perms[moduleId]?.[action]) {
      router.replace('/dashboard');
    }
  }, [moduleId, action, router]);
}
