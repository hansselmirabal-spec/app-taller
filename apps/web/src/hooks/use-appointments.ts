import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAppointmentsByDate, getAppointmentsByRange, getAppointmentsKanban,
  createAppointment, cancelAppointment, updateAppointmentStatus, rescheduleAppointment, patchAppointment,
} from '@/lib/api';
import { useWorkshopId } from '@/context/workshop-context';

export function useAppointmentsByDate(date: string) {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['appointments', 'day', workshopId, date],
    queryFn: () => getAppointmentsByDate(workshopId, date),
    enabled: !!date && !!workshopId,
  });
}

export function useAppointmentsByRange(from: string, to: string) {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['appointments', 'range', workshopId, from, to],
    queryFn: () => getAppointmentsByRange(workshopId, from, to),
    enabled: !!from && !!to && !!workshopId,
  });
}

export function useCreateAppointment() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: any) => createAppointment(workshopId, vars),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['appointments', 'day', workshopId, vars.date] });
      qc.invalidateQueries({ queryKey: ['capacity'] });
      qc.invalidateQueries({ queryKey: ['appointments-kanban', workshopId] });
    },
  });
}

export function useCancelAppointment() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; date: string }) => cancelAppointment(workshopId, id),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['appointments', 'day', workshopId, vars.date] });
      qc.invalidateQueries({ queryKey: ['capacity'] });
    },
  });
}

export function useRescheduleAppointment() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, oldDate, ...data }: { id: string; oldDate: string; date: string; timeStart: string; technicianId: string }) =>
      rescheduleAppointment(workshopId, id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['appointments', 'day', workshopId, vars.oldDate] });
      qc.invalidateQueries({ queryKey: ['appointments', 'day', workshopId, vars.date] });
      qc.invalidateQueries({ queryKey: ['appointments', 'range'] });
      qc.invalidateQueries({ queryKey: ['capacity'] });
    },
  });
}

export function useAppointmentsKanban(from: string, to: string) {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['appointments-kanban', workshopId, from, to],
    queryFn: () => getAppointmentsKanban(workshopId, from, to),
    enabled: !!(from && to && workshopId),
  });
}

export function useKanbanUpdateAppointmentStatus() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      updateAppointmentStatus(workshopId, id, status),

    // Mueve la card INMEDIATAMENTE en cache — sin esperar el delay del mock/server
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['appointments-kanban', workshopId] });
      const snapshots = qc.getQueriesData({ queryKey: ['appointments-kanban', workshopId] });
      qc.setQueriesData(
        { queryKey: ['appointments-kanban', workshopId] },
        (old: any) => old?.map((a: any) => a.id === id ? { ...a, status } : a),
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['appointments-kanban', workshopId] });
      qc.invalidateQueries({ queryKey: ['appointments', 'day', workshopId] });
    },
  });
}

export function usePatchAppointment() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; date: string; timeEnd?: string; customerName?: string; plate?: string; notes?: string }) =>
      patchAppointment(workshopId, id, data),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['appointments', 'day', workshopId, vars.date] });
      qc.invalidateQueries({ queryKey: ['appointments-kanban', workshopId] });
      qc.invalidateQueries({ queryKey: ['capacity'] });
    },
  });
}

export function useUpdateAppointmentStatus() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string; date: string }) =>
      updateAppointmentStatus(workshopId, id, status),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['appointments', 'day', workshopId, vars.date] });
    },
  });
}
