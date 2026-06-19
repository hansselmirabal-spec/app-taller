import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getOperationalBlocks, createOperationalBlock,
  updateOperationalBlock, deleteOperationalBlock,
} from '@/lib/api';
import type { OperationalBlock } from '@/types';

const KEY = 'operational-blocks';

export function useOperationalBlocks(workshopId: string | undefined, date: string) {
  return useQuery<OperationalBlock[]>({
    queryKey: [KEY, workshopId, date],
    queryFn:  () => getOperationalBlocks(workshopId!, date),
    enabled:  !!workshopId && !!date,
    staleTime: 30_000,
  });
}

export function useCreateOperationalBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createOperationalBlock,
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateOperationalBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Partial<Pick<OperationalBlock, 'timeStart' | 'timeEnd' | 'type' | 'reason'>> }) =>
      updateOperationalBlock(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useDeleteOperationalBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOperationalBlock(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
