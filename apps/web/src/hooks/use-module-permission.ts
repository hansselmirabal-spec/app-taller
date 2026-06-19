'use client';
import { useState, useEffect } from 'react';
import { getEffectivePermissions } from '@/lib/auth';
import type { ModuleId } from '@/types';

export function useModulePermission(moduleId: ModuleId) {
  const [perms, setPerms] = useState({ canView: false, canEdit: false });

  useEffect(() => {
    const p = getEffectivePermissions();
    const mod = p[moduleId];
    setPerms({
      canView: mod?.view ?? false,
      canEdit: mod?.edit ?? false,
    });
  }, [moduleId]);

  return perms;
}
