import { useQuery } from '@tanstack/react-query';
import { getDmsAdvisorSlots, getDmsAdvisors } from '@/lib/api';

export function useDmsAdvisorSlots(
  date: string,
  sucursalIdis?: string | null,
  categoryId = 1,
) {
  return useQuery({
    queryKey: ['dms-advisor-slots', date, sucursalIdis ?? '__all__', categoryId],
    queryFn: () => getDmsAdvisorSlots(date, sucursalIdis, categoryId),
    enabled: !!date,
    staleTime: 5 * 60_000,
  });
}

// Sin sucursalIdis → devuelve todos los asesores del cache (para config de técnicos).
// Con sucursalIdis → filtra por sucursal (para consultas de disponibilidad).
export function useDmsAdvisors(sucursalIdis?: string | null) {
  return useQuery({
    queryKey: ['dms-advisors', sucursalIdis ?? '__all__'],
    queryFn: () => getDmsAdvisors(sucursalIdis),
    staleTime: 10 * 60_000,
  });
}
