import { useWorkshopId } from '@/context/workshop-context';
import { useWorkshops } from '@/hooks/use-workshops';
import type { WorkshopType } from '@/types';

export function useActiveWorkshop() {
  const workshopId = useWorkshopId();
  const { data: workshops = [] } = useWorkshops();
  const workshop = workshops.find(w => w.id === workshopId);
  const type: WorkshopType = workshop?.type ?? 'MECHANIC';
  return { workshop, type, isBodyshop: type === 'BODYSHOP', isMechanic: type === 'MECHANIC' };
}
