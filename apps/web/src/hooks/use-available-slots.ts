import { useQuery } from '@tanstack/react-query';
import { getAvailableSlots, type SlotsResponse } from '@/lib/api';
import { useWorkshopId } from '@/context/workshop-context';

interface UseAvailableSlotsParams {
  date: string;
  workshopType: 'MECHANIC' | 'BODYSHOP';
  enabled: boolean;
  findNext?: boolean;
  // MECHANIC
  durationMinutes?: number;
  serviceSpecialty?: string | null;
  // BODYSHOP
  bodyworkHours?: number;
  prepHours?: number;
  paintHours?: number;
}

export function useAvailableSlots(params: UseAvailableSlotsParams) {
  const workshopId = useWorkshopId();

  return useQuery<SlotsResponse>({
    queryKey: [
      'capacity', 'slots', workshopId, params.date, params.findNext,
      params.durationMinutes, params.serviceSpecialty,
      params.bodyworkHours, params.prepHours, params.paintHours,
    ],
    queryFn: () => getAvailableSlots({
      workshopId,
      date:             params.date,
      workshopType:     params.workshopType,
      findNext:         params.findNext,
      durationMinutes:  params.durationMinutes,
      serviceSpecialty: params.serviceSpecialty,
      bodyworkHours:    params.bodyworkHours,
      prepHours:        params.prepHours,
      paintHours:       params.paintHours,
    }),
    enabled: params.enabled && !!params.date && !!workshopId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
