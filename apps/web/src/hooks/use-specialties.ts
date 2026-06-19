import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSpecialties, createSpecialty, updateSpecialty, deleteSpecialty } from '@/lib/api';

export function useSpecialties() {
  return useQuery({ queryKey: ['specialties'], queryFn: getSpecialties });
}

export function useCreateSpecialty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSpecialty,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specialties'] }),
  });
}

export function useUpdateSpecialty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) => updateSpecialty(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specialties'] }),
  });
}

export function useDeleteSpecialty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSpecialty,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['specialties'] });
      qc.invalidateQueries({ queryKey: ['technicians'] });
    },
  });
}
