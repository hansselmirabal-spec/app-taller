import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBudgetAppointments, getBudgetAppointment, getBudgetAppointmentsByPlate,
  createBudgetAppointment, updateBudgetProcesses,
  cancelBudgetAppointment, approveBudgetAppointment,
  rejectBudgetAppointment,
} from '@/lib/api';
import type { BudgetProcess, BudgetPiece } from '@/types';

const KEY = 'budget-appointments';

export function useBudgetAppointments(workshopId: string | undefined, date: string) {
  return useQuery({
    queryKey: [KEY, workshopId, date],
    queryFn:  () => getBudgetAppointments(workshopId!, date),
    enabled:  !!workshopId && !!date,
    staleTime: 30_000,
  });
}

export function useBudgetAppointment(id: string | null) {
  return useQuery({
    queryKey: [KEY, id],
    queryFn:  () => getBudgetAppointment(id!),
    enabled:  !!id,
    staleTime: 30_000,
  });
}

export function useBudgetAppointmentsByPlate(workshopId: string | undefined, plate: string) {
  return useQuery({
    queryKey: [KEY, 'by-plate', workshopId, plate],
    queryFn:  () => getBudgetAppointmentsByPlate(workshopId!, plate),
    enabled:  !!workshopId && plate.trim().length >= 3,
    staleTime: 30_000,
  });
}

export function useCreateBudgetAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBudgetAppointment,
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useUpdateBudgetProcesses() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, processes, pieces }: { id: string; processes: BudgetProcess[]; pieces?: BudgetPiece[] }) =>
      updateBudgetProcesses(id, processes, pieces),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useCancelBudgetAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelBudgetAppointment(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useApproveBudgetAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, repairStartDate }: { id: string; repairStartDate?: string }) =>
      approveBudgetAppointment(id, repairStartDate),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] });
      qc.invalidateQueries({ queryKey: ['bodyshop-capacity'] });
    },
  });
}

export function useRejectBudgetAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectBudgetAppointment(id, reason),
    onSuccess:  () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
