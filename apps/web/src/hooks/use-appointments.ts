import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAppointmentsByDate, getAppointmentsByRange, createAppointment, cancelAppointment, updateAppointmentStatus } from '@/lib/api';

export const appointmentKeys = {
  day: (date: string) => ['appointments', 'day', date] as const,
  range: (from: string, to: string) => ['appointments', 'range', from, to] as const,
};

export function useAppointmentsByDate(date: string) {
  return useQuery({
    queryKey: appointmentKeys.day(date),
    queryFn: () => getAppointmentsByDate(date),
    enabled: !!date,
  });
}

export function useAppointmentsByRange(from: string, to: string) {
  return useQuery({
    queryKey: appointmentKeys.range(from, to),
    queryFn: () => getAppointmentsByRange(from, to),
    enabled: !!from && !!to,
  });
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createAppointment,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: appointmentKeys.day(vars.date) });
      qc.invalidateQueries({ queryKey: ['capacity'] });
    },
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => cancelAppointment(id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: appointmentKeys.day(vars.date) });
      qc.invalidateQueries({ queryKey: ['capacity'] });
    },
  });
}

export function useUpdateAppointmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string; date: string }) =>
      updateAppointmentStatus(id, status),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: appointmentKeys.day(vars.date) });
    },
  });
}
