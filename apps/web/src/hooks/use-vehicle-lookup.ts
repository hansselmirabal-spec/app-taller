'use client';

import { useState, useCallback } from 'react';

export interface VehicleData {
  plate:        string;
  chassis:      string;
  model:        string;
  customerName: string;
}

// La respuesta real de /api/vehicle-lookup viene anidada como
// { found, vehicle: {...}, customer: {...} } — este hook la aplana acá,
// en el único punto donde entra el dato externo, con default '' para
// que nunca se filtre un campo undefined al estado del formulario.
export function toVehicleData(raw: any): VehicleData {
  return {
    plate:        raw?.vehicle?.plate ?? '',
    chassis:      raw?.vehicle?.chassis ?? '',
    model:        raw?.vehicle?.vehicleType ?? '',
    customerName: raw?.customer?.customerName ?? '',
  };
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
      const raw = await res.json();
      if (!raw.found) return null;
      const data = toVehicleData(raw);
      setVehicleData(data);
      return data;
    } catch {
      return null;
    } finally {
      setIsLooking(false);
    }
  }, []);

  const reset = useCallback(() => setVehicleData(null), []);

  return { lookup, isLooking, vehicleData, reset };
}
