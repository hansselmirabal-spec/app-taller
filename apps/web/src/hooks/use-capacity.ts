import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDailyCapacity, getWeekCapacity, getAbsences, createAbsence, deleteAbsence } from '@/lib/api';
import { useWorkshopId } from '@/context/workshop-context';

export function useDailyCapacity(date: string) {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['capacity', 'day', workshopId, date],
    queryFn: () => getDailyCapacity(workshopId, date),
    enabled: !!date && !!workshopId,
  });
}

export function useWeekCapacity(from: string, to: string) {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['capacity', 'week', workshopId, from, to],
    queryFn: () => getWeekCapacity(workshopId, from, to),
    enabled: !!(from && to && workshopId),
  });
}

export function useAbsences() {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['absences', workshopId],
    queryFn: () => getAbsences(workshopId),
  });
}

export function useCreateAbsence() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => createAbsence(workshopId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['capacity'] });
      qc.invalidateQueries({ queryKey: ['absences', workshopId] });
    },
  });
}

export function useDeleteAbsence() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAbsence(workshopId, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['capacity'] });
      qc.invalidateQueries({ queryKey: ['absences', workshopId] });
    },
  });
}
