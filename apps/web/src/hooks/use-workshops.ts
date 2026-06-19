import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkshops, createWorkshop, updateWorkshop, deleteWorkshop } from '@/lib/api';

export const workshopKeys = { all: ['workshops'] as const };

export function useWorkshops() {
  return useQuery({ queryKey: workshopKeys.all, queryFn: getWorkshops, staleTime: 60_000 });
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
