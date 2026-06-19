import { useState, useEffect } from 'react';
import { getEffectivePermissions } from '@/lib/auth';
import { can } from '@/lib/permissions';
import type { ModuleId, Permissions } from '@/types';

export function usePermissions() {
  const [permissions, setPermissions] = useState<Permissions | null>(null);

  useEffect(() => {
    setPermissions(getEffectivePermissions());
  }, []);

  return {
    permissions,
    can: (module: ModuleId, action: 'view' | 'edit') =>
      permissions ? can(permissions, module, action) : false,
  };
}
