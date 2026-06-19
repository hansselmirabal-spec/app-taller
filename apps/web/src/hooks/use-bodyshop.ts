import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBodyshopDayCapacity, getBodyshopWeek,
  createBodyshopEntry, cancelBodyshopEntry,
  getBodyshopEntriesByRange, updateBodyshopEntryStatus,
  assignBodyshopTechnician, assignBodyshopProcessTechnician,
  getBodyshopMonthlyReport, getBodyshopTechAvailability,
  getBodyshopProcesses, getBodyshopGrades, getBodyshopPieceGroups,
  calculateBodyshopWorkHours, patchBodyshopEntryHours,
  getDmsBodyshopSucursales, getDmsBodyshopAsesores,
  getBodyshopSchedule,
} from '@/lib/api';
export type {
  BodyshopTechAvailability,
  BodyshopProcess, BodyshopGrade, BodyshopPieceGroup, BodyshopPiece,
  BodyshopScheduleSimulation, BodyshopHoursCalcResult,
  BodyshopSchedule, BodyshopScheduleEntry, BodyshopProcessWindow, BodyshopScheduleKpis,
} from '@/lib/api';
import { useWorkshopId } from '@/context/workshop-context';
import type { BodyshopEntry } from '@/types';
export type { TechMonthlyRow } from '@/lib/api';


export function useBodyshopTechAvailability(date: string) {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['bodyshop-tech-availability', workshopId, date],
    queryFn: () => getBodyshopTechAvailability(workshopId, date),
    enabled: !!date && !!workshopId,
    staleTime: 60_000,
  });
}

export function useBodyshopDayCapacity(date: string) {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['bodyshop-capacity', 'day', workshopId, date],
    queryFn: () => getBodyshopDayCapacity(workshopId, date),
    enabled: !!date && !!workshopId,
  });
}

export function useBodyshopWeekCapacity(from: string, to: string) {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['bodyshop-capacity', 'week', workshopId, from, to],
    queryFn: () => getBodyshopWeek(workshopId, from, to),
    enabled: !!(from && to && workshopId),
  });
}

export function useCreateBodyshopEntry() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Omit<BodyshopEntry, 'id' | 'workType'>) =>
      createBodyshopEntry(workshopId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bodyshop-capacity'] });
      qc.invalidateQueries({ queryKey: ['bodyshop-kanban'] });
      qc.invalidateQueries({ queryKey: ['bodyshop-tech-availability'] });
    },
  });
}

export function usePatchBodyshopEntryHours() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...dto }: { id: string; bodyworkHours?: number; prepHours?: number; paintHours?: number; stayDays?: number }) =>
      patchBodyshopEntryHours(workshopId, id, dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bodyshop-kanban'] });
      qc.invalidateQueries({ queryKey: ['bodyshop-capacity'] });
      qc.invalidateQueries({ queryKey: ['capacity'] });
    },
  });
}

export function useCancelBodyshopEntry() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelBodyshopEntry(workshopId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-capacity'] }),
  });
}

export function useBodyshopEntriesKanban(from: string, to: string) {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['bodyshop-kanban', workshopId, from, to],
    queryFn: () => getBodyshopEntriesByRange(workshopId, from, to),
    enabled: !!(from && to && workshopId),
  });
}

export function useAssignBodyshopTechnician() {
  const workshopId = useWorkshopId();
  const qc         = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, technicianId }: { entryId: string; technicianId: string | null }) =>
      assignBodyshopTechnician(workshopId, entryId, technicianId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bodyshop-capacity'] });
      qc.invalidateQueries({ queryKey: ['bodyshop-kanban'] });
    },
  });
}

export function useAssignBodyshopProcessTechnician() {
  const workshopId = useWorkshopId();
  const qc         = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, process, technicianId }: {
      entryId: string;
      process: 'BODYWORK' | 'PREP' | 'PAINT';
      technicianId: string | null;
    }) => assignBodyshopProcessTechnician(workshopId, entryId, process, technicianId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bodyshop-capacity'] });
      qc.invalidateQueries({ queryKey: ['bodyshop-kanban'] });
    },
  });
}

export function useBodyshopProcesses() {
  return useQuery({
    queryKey: ['bodyshop-v2-processes'],
    queryFn:  getBodyshopProcesses,
    staleTime: 10 * 60_000,
  });
}

export function useBodyshopGrades() {
  return useQuery({
    queryKey: ['bodyshop-v2-grades'],
    queryFn:  getBodyshopGrades,
    staleTime: 10 * 60_000,
  });
}

export function useBodyshopPieceGroups() {
  return useQuery({
    queryKey: ['bodyshop-v2-piece-groups'],
    queryFn:  getBodyshopPieceGroups,
    staleTime: 10 * 60_000,
  });
}

export function useCalculateBodyshopHours() {
  const workshopId = useWorkshopId();
  return useMutation({
    mutationFn: (items: Array<{ pieceId: string; processId: string; gradeId: string }>) =>
      calculateBodyshopWorkHours(items, workshopId),
  });
}

export function useMonthlyLoadReport(year: number, month: number) {
  const workshopId = useWorkshopId();
  return useQuery({
    queryKey: ['bodyshop-monthly-report', workshopId, year, month],
    queryFn:  () => getBodyshopMonthlyReport(workshopId, year, month),
    enabled:  !!(year && month),
  });
}

export function useUpdateBodyshopEntryStatus() {
  const workshopId = useWorkshopId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BodyshopEntry['status'] }) =>
      updateBodyshopEntryStatus(workshopId, id, status),

    // Optimistic update: mueve la card de inmediato
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ['bodyshop-kanban', workshopId] });
      const snapshots = qc.getQueriesData({ queryKey: ['bodyshop-kanban', workshopId] });
      qc.setQueriesData(
        { queryKey: ['bodyshop-kanban', workshopId] },
        (old: any) => old?.map((e: any) => e.id === id ? { ...e, status } : e),
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx: any) => {
      ctx?.snapshots?.forEach(([key, data]: any) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['bodyshop-kanban', workshopId] });
      qc.invalidateQueries({ queryKey: ['bodyshop-capacity'] });
    },
  });
}

export function useDmsBodyshopSucursales() {
  return useQuery({
    queryKey: ['bodyshop-dms-sucursales'],
    queryFn:  getDmsBodyshopSucursales,
    staleTime: 15 * 60_000,
    retry: false,
  });
}

export function useDmsBodyshopAsesores(sucursalId?: string | null) {
  return useQuery({
    queryKey: ['bodyshop-dms-asesores', sucursalId ?? '__all__'],
    queryFn:  () => getDmsBodyshopAsesores(sucursalId),
    staleTime: 15 * 60_000,
    retry: false,
  });
}

export function useBodyshopSchedule(workshopId: string, from: string, to: string) {
  return useQuery({
    queryKey: ['bodyshop-schedule', workshopId, from, to],
    queryFn:  () => getBodyshopSchedule(workshopId, from, to),
    enabled:  !!workshopId && !!from && !!to,
    staleTime: 2 * 60 * 1000,
  });
}
