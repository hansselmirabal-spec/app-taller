/**
 * toVehicleData() — QA encontró un crash total de la app (pantalla en blanco de
 * Chrome, "Cannot read properties of undefined (reading 'trim')") en el Simulador
 * de Presupuesto al seleccionar una pieza después de buscar una patente real.
 *
 * Causa raíz: /api/vehicle-lookup devuelve { found, vehicle: {...}, customer: {...} }
 * (anidado — confirmado por vehicle-lookup.spec.ts), pero el hook esperaba un shape
 * plano { plate, chassis, model, customerName } y hacía `data as VehicleData` sin
 * validar nada. `data.customerName` era siempre undefined para cualquier patente con
 * match real en el DMS — una patente de prueba sin match nunca llegaba a este código,
 * por eso el bug no se veía probando con patentes inventadas.
 */

import { toVehicleData } from '../hooks/use-vehicle-lookup';

describe('toVehicleData', () => {
  it('aplana la respuesta anidada {vehicle, customer}', () => {
    const raw = {
      found: true,
      vehicle:  { plate: 'AAVR380', chassis: 'CH123', vehicleType: 'GLA 200 D' },
      customer: { customerName: 'PEREZ, JUAN', customerNumber: '12345' },
    };

    const data = toVehicleData(raw);

    expect(data.customerName).toBe('PEREZ, JUAN');
    expect(data.model).toBe('GLA 200 D');
    expect(data.plate).toBe('AAVR380');
  });

  it('nunca deja customerName undefined si el backend no manda el campo', () => {
    // Reproduce el caso real: el vehículo existe pero customer.customerName viene
    // vacío/ausente en la fuente materializada (dato más pobre que la legacy).
    const raw = {
      found: true,
      vehicle:  { plate: 'AAVR380', chassis: 'CH123', vehicleType: 'GLA 200 D' },
      customer: {},
    };

    const data = toVehicleData(raw);

    expect(data.customerName).toBe('');
    expect(typeof data.customerName).toBe('string');
    expect(() => data.customerName.trim()).not.toThrow();
  });

  it('no explota si vehicle/customer faltan por completo', () => {
    expect(() => toVehicleData({ found: true })).not.toThrow();
    const data = toVehicleData({ found: true });
    expect(data).toEqual({ plate: '', chassis: '', model: '', customerName: '' });
  });
});
