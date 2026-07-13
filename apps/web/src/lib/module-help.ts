export type HelpKey =
  | 'dashboard'
  | 'capacity'
  | 'calendario'
  | 'appointments'
  | 'presupuesto'
  | 'recursos'
  | 'reportes'
  | 'kanban'
  | 'seguimiento';

export interface ModuleHelp {
  title: string;
  points: string[];
}

// Fuente única de contenido explicativo por pantalla — la misma base que
// alimenta /documentacion. Si cambia una regla de negocio, actualizar acá
// y en docs/flujo-negocio.md para que no queden desincronizados.
export const MODULE_HELP: Record<HelpKey, ModuleHelp> = {
  dashboard: {
    title: 'Panel de Control',
    points: [
      'Resumen rápido del día: vehículos en el taller, técnicos y alertas.',
      'Es solo lectura, no se edita nada desde acá.',
      'La vista cambia según el taller activo (mecánica o chapa y pintura).',
    ],
  },
  capacity: {
    title: 'Calendario de Capacidad',
    points: [
      'Muestra cuántas horas libres tiene cada técnico por día.',
      'Ausencia completa = 0h disponibles. Media jornada = 50%. Feriado = todo el taller en 0h.',
      'Sirve para saber si se puede prometer un turno antes de agendarlo.',
    ],
  },
  calendario: {
    title: 'Calendario',
    points: [
      'Agenda semanal de turnos de mecánica general.',
      'Un turno no puede solaparse con otro del mismo técnico, ni superar sus horas disponibles ese día.',
    ],
  },
  appointments: {
    title: 'Agenda',
    points: [
      'Acá se reserva el ingreso real del vehículo a chapería, preparación y pintura, con horas por proceso y técnico asignado.',
      'El sistema calcula solo la fecha estimada de salida antes de guardar.',
      'Requiere que el vehículo ya tenga un Presupuesto cargado.',
    ],
  },
  presupuesto: {
    title: 'Presupuestos',
    points: [
      'Es el primer paso del flujo: se carga la cita para un vehículo dañado, antes de que entre a reparar.',
      'Sin presupuesto no se puede agendar el ingreso real en Agenda.',
    ],
  },
  recursos: {
    title: 'Recursos',
    points: [
      'Cola de vehículos parados por falta de un repuesto.',
      'Cuando el repuesto llega, se libera desde acá y el vehículo vuelve al flujo normal de Seguimiento.',
      'Ordenados por antigüedad: los que esperan hace más tiempo aparecen primero.',
    ],
  },
  reportes: {
    title: 'Reportería',
    points: [
      'Números reales de OTs (abiertas, vencidas, montos) agrupados por sucursal y asesor.',
      'Los datos vienen del sistema externo de la empresa (DMS) y se actualizan solos cada 5-15 minutos.',
      'Si algo se ve desactualizado, no se edita acá — es un problema de sincronización, no de esta pantalla.',
    ],
  },
  kanban: {
    title: 'Seguimiento (Kanban)',
    points: [
      'Tablero en tiempo real del vehículo dentro del taller: Agendado → Chapería → Prep → Pintura → Entregado.',
      'El semáforo (verde/naranja/rojo) compara el tiempo real contra el estimado — no tiene relación con la disponibilidad de técnicos.',
      'Si un proceso se traba por falta de repuesto, se marca acá y el vehículo pasa a la cola de Recursos.',
    ],
  },
  seguimiento: {
    title: 'Seguimiento OTs',
    points: [
      'Lista todas las OTs abiertas del DMS y su estado actual.',
      'Es información de consulta — no se edita nada desde acá.',
    ],
  },
};
