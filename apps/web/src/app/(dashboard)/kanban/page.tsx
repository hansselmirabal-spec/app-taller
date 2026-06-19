'use client';
import dynamic from 'next/dynamic';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import { useRequirePermission } from '@/hooks/use-require-permission';
import MechanicKanban from './mechanic';

const TrackingKanban = dynamic(() => import('../seguimiento/kanban/page'), { ssr: false });

export default function KanbanPage() {
  useRequirePermission('kanban');
  const { isBodyshop } = useActiveWorkshop();
  return isBodyshop ? <TrackingKanban /> : <MechanicKanban />;
}
