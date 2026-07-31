import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkshops, createWorkshop, updateWorkshop, deleteWorkshop } from '@/lib/api';
import { getCachedWorkshops, setCachedWorkshops } from '@/lib/workshop-store';
import type { Workshop } from '@/types';

export const workshopKeys = { all: ['workshops'] as const };

export function useWorkshops() {
  const query = useQuery({
    queryKey: workshopKeys.all,
    queryFn: getWorkshops,
    staleTime: 60_000,
    // Evita que un F5 arranque con workshops=[] mientras la red resuelve —
    // ver comentario en workshop-store.ts. Puede estar desactualizado por un
    // instante; se reemplaza apenas la query real responde (abajo).
    initialData: () => getCachedWorkshops<Workshop>(),
  });

  useEffect(() => {
    if (query.data && query.data.length > 0) setCachedWorkshops(query.data);
  }, [query.data]);

  return query;
}

export function useCreateWorkshop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createWorkshop,
    onSuccess: () => qc.invalidateQueries({ queryKey: workshopKeys.all }),
  });
}

export function useUpdateWorkshop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; address?: string; type?: 'MECHANIC' | 'BODYSHOP'; dmsBranch?: string | null; alertAtrasoDays?: number; alertCriticoDays?: number; config?: object } }) =>
      updateWorkshop(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: workshopKeys.all }),
  });
}

export function useDeleteWorkshop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkshop,
    onSuccess: () => qc.invalidateQueries({ queryKey: workshopKeys.all }),
  });
}
