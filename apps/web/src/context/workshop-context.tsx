'use client';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getActiveWorkshopId, setActiveWorkshopIdStorage } from '@/lib/workshop-store';
import { getWorkshops } from '@/lib/api';

interface WorkshopContextValue {
  workshopId: string;
  setWorkshopId: (id: string) => void;
}

const WorkshopContext = createContext<WorkshopContextValue>({
  workshopId: '',
  setWorkshopId: () => {},
});

export function WorkshopProvider({ children }: { children: React.ReactNode }) {
  const [workshopId, setWorkshopIdState] = useState<string>('');
  const qc = useQueryClient();

  // Usa TanStack Query para que el token esté disponible y haya retry automático
  const { data: workshops } = useQuery({
    queryKey: ['workshops'],
    queryFn: getWorkshops,
    staleTime: 60_000,
    retry: 2,
  });

  // Una vez que carguen los workshops, resuelve el ID activo
  useEffect(() => {
    if (!workshops?.length) return;
    const stored = getActiveWorkshopId();
    const valid = workshops.find(w => w.id === stored) ? stored : workshops[0].id;
    setActiveWorkshopIdStorage(valid);
    setWorkshopIdState(valid);
  }, [workshops]);

  const setWorkshopId = useCallback((id: string) => {
    setWorkshopIdState(id);
    setActiveWorkshopIdStorage(id);
    qc.invalidateQueries();
  }, [qc]);

  return (
    <WorkshopContext.Provider value={{ workshopId, setWorkshopId }}>
      {children}
    </WorkshopContext.Provider>
  );
}

export function useWorkshop() {
  return useContext(WorkshopContext);
}

export function useWorkshopId() {
  return useContext(WorkshopContext).workshopId;
}
