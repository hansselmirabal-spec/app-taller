import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getTrackingBoard, startTrackingProcess, completeTrackingProcess,
  blockTrackingProcess, unblockTrackingProcess, setTrackingExitDate,
  setTrackingResource, clearTrackingResource, getResourceAgenda,
  type TrackingBoard, type ResourceAgendaItem,
} from '@/lib/api';

export function useTrackingBoard(date: string, workshopId: string | undefined) {
  return useQuery<TrackingBoard>({
    queryKey: ['tracking-board', date, workshopId],
    queryFn:  () => getTrackingBoard(date, workshopId!),
    enabled:  !!date && !!workshopId,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

export function useStartProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ logId, technicianId, technicianName }: {
      logId: string; technicianId?: string; technicianName?: string;
    }) => startTrackingProcess(logId, technicianId, technicianName),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-board'] }),
  });
}

export function useCompleteProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ logId, notes }: { logId: string; notes?: string }) =>
      completeTrackingProcess(logId, notes),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-board'] }),
  });
}

export function usePauseProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ logId, reason }: { logId: string; reason: string }) =>
      blockTrackingProcess(logId, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-board'] }),
  });
}

export function useUnblockProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (logId: string) => unblockTrackingProcess(logId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-board'] }),
  });
}

export function useSetExitDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sourceType, sourceId, date }: {
      sourceType: 'mechanic' | 'bodyshop';
      sourceId: string;
      date: string | null;
    }) => setTrackingExitDate(sourceType, sourceId, date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-board'] }),
  });
}

export function useSetResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, note }: { entryId: string; note: string }) =>
      setTrackingResource(entryId, note),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracking-board'] }),
  });
}

export function useClearResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => clearTrackingResource(entryId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tracking-board'] });
      qc.invalidateQueries({ queryKey: ['resource-agenda'] });
    },
  });
}

export function useResourceAgenda(workshopId: string | undefined) {
  return useQuery<ResourceAgendaItem[]>({
    queryKey: ['resource-agenda', workshopId],
    queryFn:  () => getResourceAgenda(workshopId!),
    enabled:  !!workshopId,
    staleTime: 30_000,
  });
}
