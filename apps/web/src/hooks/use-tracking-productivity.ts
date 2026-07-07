import { useQuery } from '@tanstack/react-query';
import { getTrackingProductivity } from '@/lib/api';
import { useWorkshop } from '@/context/workshop-context';

export function useTrackingProductivity(from: string, to: string) {
  const { workshopId } = useWorkshop();
  return useQuery({
    queryKey: ['tracking-productivity', workshopId, from, to],
    queryFn: () => getTrackingProductivity(workshopId!, from, to),
    enabled: !!(workshopId && from && to),
    staleTime: 5 * 60_000,
  });
}
