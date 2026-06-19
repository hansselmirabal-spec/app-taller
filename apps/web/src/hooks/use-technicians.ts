import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getTechnicians, createTechnician, updateTechnician } from '@/lib/api';
import { useWorkshopId } from '@/context/workshop-context';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';

export function useTechnicians() {
  const workshopId = useWorkshopId();
  const { workshop } = useActiveWorkshop();
  return useQuery({
    queryKey: ['technicians', workshopId],
    queryFn: () => getTechnicians(workshopId, workshop?.name),
    staleTime: 5 * 60_000,
    enabled: !!workshopId,
  });
}

export function useCreateTechnician() {
  const workshopId = useWorkshopId();
  const { workshop } = useActiveWorkshop();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; dailyHours?: number; specialty?: string | null; box?: string | null; dmsAdvisorCode?: string | null }) =>
      createTechnician(workshopId, data, workshop?.name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['technicians', workshopId] }),
  });
}

export function useUpdateTechnician() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateTechnician(workshopId, id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['technicians', workshopId] }),
  });
}
