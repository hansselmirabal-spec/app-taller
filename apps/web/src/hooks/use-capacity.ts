import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDailyCapacity, getWeekCapacity, createAbsence, deleteAbsence } from '@/lib/api';

export const capacityKeys = {
  day: (date: string) => ['capacity', 'day', date] as const,
  week: (from: string, to: string) => ['capacity', 'week', from, to] as const,
};

export function useDailyCapacity(date: string) {
  return useQuery({ queryKey: capacityKeys.day(date), queryFn: () => getDailyCapacity(date), enabled: !!date });
}

export function useWeekCapacity(from: string, to: string) {
  return useQuery({ queryKey: capacityKeys.week(from, to), queryFn: () => getWeekCapacity(from, to), enabled: !!(from && to) });
}

export function useCreateAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAbsence,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capacity'] }),
  });
}

export function useDeleteAbsence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteAbsence,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capacity'] }),
  });
}
