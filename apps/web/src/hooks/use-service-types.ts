import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getServiceTypes, createServiceType, updateServiceType } from '@/lib/api';

export const serviceTypeKeys = { all: ['service-types'] as const };

export function useServiceTypes() {
  return useQuery({ queryKey: serviceTypeKeys.all, queryFn: getServiceTypes, staleTime: 5 * 60_000 });
}

export function useCreateServiceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createServiceType,
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceTypeKeys.all }),
  });
}

export function useUpdateServiceType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateServiceType(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: serviceTypeKeys.all }),
  });
}
