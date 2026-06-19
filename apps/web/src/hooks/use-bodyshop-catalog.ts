'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getBodyshopCatalogGroups,
  getBodyshopCatalogProcesses,
  getBodyshopCatalogGrades,
  createBodyshopCatalogGroup,  updateBodyshopCatalogGroup,  deleteBodyshopCatalogGroup,
  createBodyshopCatalogPiece,  updateBodyshopCatalogPiece,  deleteBodyshopCatalogPiece,
  createBodyshopCatalogProcess, updateBodyshopCatalogProcess, deleteBodyshopCatalogProcess,
  createBodyshopCatalogGrade,  updateBodyshopCatalogGrade,  deleteBodyshopCatalogGrade,
} from '@/lib/api';

const STALE = 10 * 60 * 1000;

// ── Queries ───────────────────────────────────────────────────────────────────

export function useBodyshopCatalogGroups() {
  return useQuery({ queryKey: ['bodyshop-catalog', 'groups'], queryFn: getBodyshopCatalogGroups, staleTime: STALE });
}

export function useBodyshopCatalogProcesses() {
  return useQuery({ queryKey: ['bodyshop-catalog', 'processes'], queryFn: getBodyshopCatalogProcesses, staleTime: STALE });
}

export function useBodyshopCatalogGrades() {
  return useQuery({ queryKey: ['bodyshop-catalog', 'grades'], queryFn: getBodyshopCatalogGrades, staleTime: STALE });
}

// ── Group mutations ───────────────────────────────────────────────────────────

export function useCreateBodyshopGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBodyshopCatalogGroup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'groups'] }),
  });
}

export function useUpdateBodyshopGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; code?: string; label?: string }) =>
      updateBodyshopCatalogGroup(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'groups'] }),
  });
}

export function useDeleteBodyshopGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteBodyshopCatalogGroup,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'groups'] }),
  });
}

// ── Piece mutations ───────────────────────────────────────────────────────────

export function useCreateBodyshopPiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBodyshopCatalogPiece,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'groups'] }),
  });
}

export function useUpdateBodyshopPiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; code?: string; label?: string; groupId?: string | null }) =>
      updateBodyshopCatalogPiece(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'groups'] }),
  });
}

export function useDeleteBodyshopPiece() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteBodyshopCatalogPiece,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'groups'] }),
  });
}

// ── Process mutations ─────────────────────────────────────────────────────────

export function useCreateBodyshopProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBodyshopCatalogProcess,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'processes'] }),
  });
}

export function useUpdateBodyshopProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; code?: string; label?: string; order?: number }) =>
      updateBodyshopCatalogProcess(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'processes'] }),
  });
}

export function useDeleteBodyshopProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteBodyshopCatalogProcess,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'processes'] }),
  });
}

// ── Grade mutations ───────────────────────────────────────────────────────────

export function useCreateBodyshopGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBodyshopCatalogGrade,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'grades'] }),
  });
}

export function useUpdateBodyshopGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; code?: string; label?: string; factor?: number | null }) =>
      updateBodyshopCatalogGrade(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'grades'] }),
  });
}

export function useDeleteBodyshopGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteBodyshopCatalogGrade,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bodyshop-catalog', 'grades'] }),
  });
}
