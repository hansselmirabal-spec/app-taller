import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getServiceTypes, createServiceType, updateServiceType } from '@/lib/api';
import { useWorkshopId } from '@/context/workshop-context';

export function useServiceTypes() {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['service-types', workshopId],
    queryFn: () => getServiceTypes(workshopId),
    staleTime: 5 * 60_000,
  });
}

export function useCreateServiceType() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => createServiceType(workshopId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-types', workshopId] }),
  });
}

export function useUpdateServiceType() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateServiceType(workshopId, id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-types', workshopId] }),
  });
}
