'use client';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import BodyshopDashboard from './bodyshop';
import MechanicDashboard from './mechanic';

export default function DashboardPage() {
  const { isBodyshop } = useActiveWorkshop();
  return isBodyshop ? <BodyshopDashboard /> : <MechanicDashboard />;
}
