'use client';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import { useRequirePermission } from '@/hooks/use-require-permission';
import MechanicServiceTypesPage from './mechanic';
import BodyshopWorkTypesPage from './bodyshop';

export default function ServiceTypesPage() {
  useRequirePermission('settings');
  const { isBodyshop } = useActiveWorkshop();
  return isBodyshop ? <BodyshopWorkTypesPage /> : <MechanicServiceTypesPage />;
}
