import { useQuery } from '@tanstack/react-query';

export interface DmsBranch {
  name: string;
  total: number;
}

async function fetchDmsBranches(): Promise<DmsBranch[]> {
  const res = await fetch('/api/dms-branches');
  if (!res.ok) throw new Error('Error al cargar sucursales del DMS');
  const json = await res.json();
  return json.data ?? [];
}

export function useDmsBranches() {
  return useQuery({
    queryKey: ['dms-branches'] as const,
    queryFn: fetchDmsBranches,
    staleTime: 10 * 60_000,
  });
}
