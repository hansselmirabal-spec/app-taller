'use client';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import { useRequirePermission } from '@/hooks/use-require-permission';
import MechanicReporteriaPage from './mechanic';
import BodyshopReporteriaPage from './bodyshop';

export default function ReporteriaPage() {
  useRequirePermission('reports');
  const { isBodyshop } = useActiveWorkshop();
  return isBodyshop ? <BodyshopReporteriaPage /> : <MechanicReporteriaPage />;
}
