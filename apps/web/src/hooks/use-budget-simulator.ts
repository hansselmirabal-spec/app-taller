import { useQuery, useMutation } from '@tanstack/react-query';
import {
  getBudgetSimulatorPiezas,
  budgetSimulatorEstimate,
  type SimulatorEstimateItem,
} from '@/lib/api';

export function useBudgetSimulatorPiezas() {
  return useQuery({
    queryKey: ['budget-simulator-piezas'],
    queryFn:  getBudgetSimulatorPiezas,
    staleTime: Infinity,
  });
}

export function useBudgetSimulatorEstimate() {
  return useMutation({
    mutationFn: (items: SimulatorEstimateItem[]) => budgetSimulatorEstimate(items),
  });
}
