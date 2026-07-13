'use client';

import { BookOpen } from 'lucide-react';
import { useRequirePermission } from '@/hooks/use-require-permission';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <h2 className="text-sm font-bold text-slate-900">{title}</h2>
      <div className="text-sm text-slate-600 space-y-3 leading-relaxed">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-slate-200">
            {head.map(h => (
              <th key={h} className="text-left px-3 py-2 font-semibold text-slate-700 text-xs uppercase tracking-wide">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-slate-100 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-slate-600 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DocumentacionPage() {
  useRequirePermission('documentation');

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <BookOpen className="h-5 w-5 text-indigo-500" />
          <div>
            <h1 className="text-base font-semibold text-slate-900">Documentación</h1>
            <p className="text-xs text-slate-400">Flujo del negocio y reglas del sistema</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto space-y-4">

          <Section title="1. Qué hace el sistema">
            <p>
              Reemplaza el Excel de gestión del taller. Cubre dos negocios distintos dentro de la misma app:
            </p>
            <Table
              head={['Taller', 'Qué gestiona']}
              rows={[
                ['Mecánica', 'Turnos de mantenimiento/reparación general, agendados por horas de técnico'],
                ['Chapa y Pintura (bodyshop)', 'Vehículos con proceso de reparación en 3 etapas: Chapería → Preparación → Pintura'],
              ]}
            />
            <p>Son flujos separados porque su lógica de horas y de agenda es distinta (ver sección 4).</p>
          </Section>

          <Section title="2. Flujo completo (bodyshop)">
            <ol className="list-decimal list-inside space-y-2">
              <li><b>Presupuesto</b> — se crea una cita/presupuesto para un vehículo dañado (patente, cliente, perito).</li>
              <li><b>Agenda</b> — se agenda el ingreso real: horas de chapería/prep/pintura, técnico asignado. El sistema simula la agenda antes de guardar y calcula la fecha estimada de salida.</li>
              <li><b>Seguimiento</b> — el vehículo entra al taller. Kanban por proceso: Agendado → Chapería → Prep → Pintura → Entregado. Cada proceso se marca "iniciado" y "completado" en tiempo real.</li>
              <li><b>Recursos</b> — si un proceso se traba por falta de repuesto, se marca "esperando recurso" y aparece en la cola de Recursos hasta que compras lo libera.</li>
              <li><b>Reportes</b> — una vez que las OTs existen en el DMS (sistema externo de la empresa), se agregan por sucursal y asesor para ver abiertas/vencidas/montos.</li>
            </ol>
            <p className="font-medium text-slate-700">Regla clave: no se puede saltar pasos. Sin presupuesto no hay agenda; sin agenda no hay seguimiento.</p>
          </Section>

          <Section title="3. Multi-sucursal y de dónde salen los datos">
            <ul className="list-disc list-inside space-y-2">
              <li>La app conoce sus propios talleres (<code>Workshop</code>) — ej. &quot;Taller Chapa y Pintura&quot;.</li>
              <li>Las OTs reales (las que ve el asesor, las de facturación) viven en el <b>DMS</b>, un sistema externo de Grupo Cóndor, no en esta app.</li>
              <li>Cada <code>Workshop</code> se puede mapear a una sucursal del DMS, pero hoy solo se usa como dato que se reenvía al crear una cita — no filtra ni agrega datos del DMS.</li>
              <li>El módulo de <b>Reportes</b> sí agrega OTs del DMS agrupadas por el nombre de sucursal que trae el DMS (ej. &quot;CONDOR NORTE - TALLER&quot;), no por el <code>Workshop</code> de la app.</li>
              <li>Los datos del DMS se sincronizan a una tabla propia cada 5-15 minutos. Si algo se ve &quot;viejo&quot;, lo primero a revisar es esa sincronización, no la sucursal en sí.</li>
            </ul>
            <p className="font-medium text-slate-700">
              Presupuesto/agenda y reportes usan la sucursal para cosas distintas — una es metadata de creación, la otra es agregación para analítica.
            </p>
          </Section>

          <Section title="4. Cómo se calculan las horas">
            <p>Hay tres modelos de horas distintos en el sistema. Mezclarlos es la fuente más común de confusión.</p>

            <div>
              <p className="font-semibold text-slate-800">4.1 Horas de capacidad / disponibilidad — ¿puedo agendar?</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>Mecánica: cada técnico tiene horas diarias (default 8h). Disponible = horas del día − horas ya asignadas.</li>
                <li>Bodyshop: horas libres por proceso (chapería, prep, pintura por separado) — un técnico de chapería no presta sus horas a pintura.</li>
                <li>Ausencia completa → 0h. Media jornada → 50%. Feriado → 0h para todo el taller.</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-800">4.2 Horas planificadas vs. horas reales — ¿cómo va el trabajo?</p>
              <ul className="list-disc list-inside space-y-1 mt-1">
                <li>Al crear la entrada se cargan horas estimadas de chapería/prep/pintura.</li>
                <li>Al iniciar y terminar cada proceso en el kanban, el sistema mide horas reales.</li>
                <li>Desviación = horas reales − horas planificadas. Semáforo: verde (a tiempo), naranja (desviación relevante), rojo (proceso activo ya atrasado).</li>
              </ul>
            </div>

            <div>
              <p className="font-semibold text-slate-800">4.3 Horas del turno/cita — ¿de qué hora a qué hora?</p>
              <p className="mt-1">Rango horario simple de la cita, sin relación directa con 4.1/4.2. Se usa solo para no solapar turnos en la agenda.</p>
            </div>

            <Table
              head={['Pregunta', 'Modelo', 'Dónde vive']}
              rows={[
                ['¿Tengo técnico libre para agendar?', 'Capacidad/disponibilidad', 'Capacidad'],
                ['¿Vamos atrasados con este auto?', 'Planificado vs. real', 'Seguimiento'],
                ['¿A qué hora es el turno?', 'Horario de la cita', 'Agenda/Presupuesto'],
              ]}
            />
          </Section>

          <Section title="5. Reglas de negocio fijas">
            <ul className="list-disc list-inside space-y-1.5">
              <li>Un técnico no puede tener más de una ausencia por día.</li>
              <li>Feriado bloquea todo el taller, no técnicos individuales.</li>
              <li>Un turno no puede solaparse con otro del mismo técnico.</li>
              <li>En bodyshop, cada proceso (chapería/prep/pintura) tiene su propio técnico — pueden coincidir o no.</li>
              <li>El horario del taller es de lunes a sábado; domingo no se agenda.</li>
              <li>Un vehículo bloqueado por falta de repuesto sale del flujo normal y aparece en Recursos hasta que se libera manualmente.</li>
            </ul>
          </Section>

          <Section title="6. Glosario rápido">
            <Table
              head={['Término', 'Significado']}
              rows={[
                ['Presupuesto', 'Cita inicial para un vehículo dañado, antes de que entre a reparar.'],
                ['Agenda / Cita', 'Reserva concreta con horas de chapería/prep/pintura y técnico.'],
                ['Seguimiento', 'Kanban en tiempo real del vehículo dentro del taller.'],
                ['Recursos', 'Cola de vehículos parados por falta de repuesto.'],
                ['Reportes', 'Analítica agregada de OTs reales del DMS por sucursal/asesor.'],
                ['DMS', 'Sistema externo de Grupo Cóndor, fuente de verdad de las OTs — la app lo consulta, no lo reemplaza.'],
              ]}
            />
          </Section>

        </div>
      </div>
    </div>
  );
}
