'use client';

import { useState, useCallback } from 'react';

export interface VehicleData {
  plate:        string;
  chassis:      string;
  model:        string;
  customerCode: string;
  customerName: string;
}

export function useVehicleLookup() {
  const [isLooking, setIsLooking]     = useState(false);
  const [vehicleData, setVehicleData] = useState<VehicleData | null>(null);

  const lookup = useCallback(async (plate: string): Promise<VehicleData | null> => {
    const normalized = plate.toUpperCase().trim();
    if (normalized.length < 3) return null;

    setIsLooking(true);
    setVehicleData(null);
    try {
      const res = await fetch(`/api/vehicle-lookup?plate=${encodeURIComponent(normalized)}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.found) return null;
      setVehicleData(data as VehicleData);
      return data as VehicleData;
    } catch {
      return null;
    } finally {
      setIsLooking(false);
    }
  }, []);

  const reset = useCallback(() => setVehicleData(null), []);

  return { lookup, isLooking, vehicleData, reset };
}
