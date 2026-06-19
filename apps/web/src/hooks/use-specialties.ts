import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSpecialties, createSpecialty, updateSpecialty, deleteSpecialty } from '@/lib/api';
import { useWorkshopId } from '@/context/workshop-context';

export function useSpecialties() {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['specialties', workshopId],
    queryFn: () => getSpecialties(workshopId),
  });
}

export function useCreateSpecialty() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string }) => createSpecialty(workshopId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specialties', workshopId] }),
  });
}

export function useUpdateSpecialty() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string } }) =>
      updateSpecialty(workshopId, id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['specialties', workshopId] }),
  });
}

export function useDeleteSpecialty() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSpecialty(workshopId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['specialties', workshopId] });
      qc.invalidateQueries({ queryKey: ['technicians', workshopId] });
    },
  });
}
