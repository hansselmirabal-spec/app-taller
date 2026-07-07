'use client';
import { useRequirePermission } from '@/hooks/use-require-permission';
import ProductividadPage from './productividad';

export default function Page() {
  useRequirePermission('reports');
  return <ProductividadPage />;
}
