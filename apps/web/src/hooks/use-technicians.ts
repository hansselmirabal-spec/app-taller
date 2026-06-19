import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTechnicians, createTechnician, updateTechnician } from '@/lib/api';

export const technicianKeys = { all: ['technicians'] as const };

export function useTechnicians() {
  return useQuery({ queryKey: technicianKeys.all, queryFn: getTechnicians, staleTime: 5 * 60_000 });
}

export function useCreateTechnician() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createTechnician,
    onSuccess: () => qc.invalidateQueries({ queryKey: technicianKeys.all }),
  });
}

export function useUpdateTechnician() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateTechnician(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: technicianKeys.all }),
  });
}
