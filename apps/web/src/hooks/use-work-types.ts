import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getWorkTypes, createWorkType, updateWorkType, deleteWorkType } from '@/lib/api';
import { useWorkshopId } from '@/context/workshop-context';
import type { WorkType } from '@/types';

export function useWorkTypes() {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['work-types', workshopId],
    queryFn: () => getWorkTypes(workshopId),
  });
}

export function useCreateWorkType() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<WorkType, 'id' | 'workshopId'>) => createWorkType(workshopId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-types', workshopId] }),
  });
}

export function useUpdateWorkType() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Omit<WorkType, 'id' | 'workshopId'>> }) =>
      updateWorkType(workshopId, id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-types', workshopId] }),
  });
}

export function useDeleteWorkType() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWorkType(workshopId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-types', workshopId] }),
  });
}
