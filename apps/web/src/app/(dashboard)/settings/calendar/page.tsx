'use client';
import { useState, useEffect } from 'react';
import { Plus, Trash2, CalendarDays, Clock, User2, UtensilsCrossed } from 'lucide-react';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { useModulePermission } from '@/hooks/use-module-permission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAbsences, useCreateAbsence, useDeleteAbsence } from '@/hooks/use-capacity';
import { useTechnicians } from '@/hooks/use-technicians';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import { useUpdateWorkshop } from '@/hooks/use-workshops';
import { formatDateDisplay } from '@/lib/utils';
import type { WeekDay, WeeklySchedule, DaySchedule } from '@/types';
import { DEFAULT_WEEKLY_SCHEDULE } from '@/types';

const HOUR_SLOTS = Array.from({ length: 20 }, (_, i) => {
  const totalMin = 8 * 60 + i * 30;
  const h = String(Math.floor(totalMin / 60)).padStart(2, '0');
  const m = String(totalMin % 60).padStart(2, '0');
  return `${h}:${m}`;
});

type Mode = 'holiday' | 'absence' | 'partial';

export default function CalendarSettingsPage() {
  useRequirePermission('settings');
  const { canEdit } = useModulePermission('settings');
  const { workshop } = useActiveWorkshop();
  const updateWS = useUpdateWorkshop();
  const createAbsence = useCreateAbsence();
  const deleteAbsence = useDeleteAbsence();
  const { data: technicians = [] } = useTechnicians();
  const { data: absences = [] } = useAbsences();
  const { isBodyshop } = useActiveWorkshop();

  const [mode, setMode] = useState<Mode>('holiday');
  const [submitError, setSubmitError] = useState('');

  // Feriado / cierre global
  const [hDate, setHDate] = useState('');
  const [hNote, setHNote] = useState('');

  // Ausencia individual (full / half)
  const [aTechIds, setATechIds] = useState<Set<string>>(new Set());
  const [aDate, setADate] = useState('');
  const [aType, setAType] = useState<'full' | 'half'>('full');
  const [aReason, setAReason] = useState('');

  // Caso especial (bloqueo parcial de horas)
  const [pTechIds, setPTechIds] = useState<Set<string>>(new Set());
  const [pDate, setPDate] = useState('');
  const [pFrom, setPFrom] = useState('08:00');
  const [pTo, setPTo] = useState('12:00');
  const [pReason, setPReason] = useState('');

  function toggleATech(id: string) {
    setATechIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAllA() {
    setATechIds(prev => prev.size === technicians.length ? new Set() : new Set(technicians.map(t => t.id)));
  }

  async function handleAddAbsence(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    if (aTechIds.size === 0 || !aDate) return;
    try {
      await Promise.all(
        Array.from(aTechIds).map(techId =>
          createAbsence.mutateAsync({ technicianId: techId, date: aDate, type: aType, reason: aReason || undefined })
        )
      );
      setATechIds(new Set());
      setADate('');
      setAType('full');
      setAReason('');
    } catch (err: any) {
      setSubmitError(err.message || 'Error al registrar ausencia');
    }
  }

  function toggleTech(id: string) {
    setPTechIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setPTechIds(prev => prev.size === technicians.length ? new Set() : new Set(technicians.map(t => t.id)));
  }

  async function handleAddHoliday(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    if (!hDate) return;
    try {
      await Promise.all(
        technicians.map(tech =>
          createAbsence.mutateAsync({ technicianId: tech.id, date: hDate, type: 'holiday', reason: hNote || undefined })
        )
      );
      setHDate('');
      setHNote('');
    } catch (err: any) {
      setSubmitError(err.message || 'Error al registrar feriado');
    }
  }

  async function handleAddPartial(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    if (pTechIds.size === 0 || !pDate || !pFrom || !pTo) return;
    if (pFrom >= pTo) {
      setSubmitError('La hora de inicio debe ser anterior a la hora de fin');
      return;
    }
    const [sh, sm] = pFrom.split(':').map(Number);
    const [eh, em] = pTo.split(':').map(Number);
    const hours = ((eh * 60 + em) - (sh * 60 + sm)) / 60;
    try {
      await Promise.all(
        Array.from(pTechIds).map(techId =>
          createAbsence.mutateAsync({
            technicianId: techId,
            date: pDate,
            type: 'partial',
            timeStart: pFrom,
            timeEnd: pTo,
            reason: pReason || `Bloqueo ${hours}h`,
          })
        )
      );
      setPTechIds(new Set());
      setPDate('');
      setPFrom('08:00');
      setPTo('12:00');
      setPReason('');
    } catch (err: any) {
      setSubmitError(err.message || 'Error al registrar caso especial');
    }
  }

  function absenceLabel(type: string) {
    if (type === 'full') return { label: 'Ausente', cls: 'bg-red-100 text-red-700' };
    if (type === 'half') return { label: 'Media jornada', cls: 'bg-yellow-100 text-yellow-700' };
    if (type === 'holiday') return { label: 'Feriado', cls: 'bg-blue-100 text-blue-700' };
    if (type === 'partial') return { label: 'Caso especial', cls: 'bg-violet-100 text-violet-700' };
    return { label: type, cls: 'bg-slate-100 text-slate-600' };
  }

  return (
    <div className="h-full overflow-y-auto">
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

      {/* ── Horario semanal ── */}
      <WeeklyScheduleSection
        schedule={workshop?.config?.weeklySchedule ?? DEFAULT_WEEKLY_SCHEDULE}
        canEdit={canEdit}
        onSave={schedule => {
          if (!workshop) return;
          updateWS.mutate({
            id: workshop.id,
            data: { config: { ...workshop.config, weeklySchedule: schedule } },
          });
        }}
        saving={updateWS.isPending}
      />

      {/* ── Horario de almuerzo ── */}
      <LunchBreakSection
        lunchBreak={workshop?.config?.lunchBreak ?? { enabled: false, start: '12:00', end: '13:00' }}
        canEdit={canEdit}
        onSave={lb => {
          if (!workshop) return;
          updateWS.mutate({
            id: workshop.id,
            data: { config: { ...workshop.config, lunchBreak: lb } },
          });
        }}
        saving={updateWS.isPending}
      />

      <div>
        <h1 className="text-xl font-semibold text-slate-900">Calendario y disponibilidad</h1>
        <p className="text-sm text-slate-500 mt-1">
          {isBodyshop
            ? 'Registrá días de cierre del taller de carrocería.'
            : 'Registrá feriados globales o bloqueos parciales por técnico.'
          }
        </p>
      </div>

      {/* Tabs — solo visibles si puede editar */}
      {canEdit && <div className="flex gap-1 bg-slate-100 rounded-lg p-1 mb-4 w-fit flex-wrap">
        <button
          type="button"
          onClick={() => { setMode('holiday'); setSubmitError(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            mode === 'holiday' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {isBodyshop ? 'Cierre de taller' : 'Feriado global'}
        </button>
        <button
          type="button"
          onClick={() => { setMode('absence'); setSubmitError(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            mode === 'absence' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <User2 className="h-3.5 w-3.5" />
          Ausencia
        </button>
        <button
          type="button"
          onClick={() => { setMode('partial'); setSubmitError(''); }}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
            mode === 'partial' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Clock className="h-3.5 w-3.5" />
          Caso especial
        </button>
      </div>}

      {/* Formulario feriado / cierre */}
      {canEdit && mode === 'holiday' && (
        <form onSubmit={handleAddHoliday} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6">
          <p className="text-xs text-slate-500 mb-3">
            {isBodyshop
              ? 'Marca un día como cerrado para todo el taller. La capacidad quedará en cero ese día.'
              : 'Aplica a todos los técnicos del taller. Reduce disponibilidad a 50%.'
            }
          </p>
          <div className="flex gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Fecha</label>
              <Input type="date" value={hDate} onChange={e => setHDate(e.target.value)} required />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Descripcion (opcional)</label>
              <Input value={hNote} onChange={e => setHNote(e.target.value)} placeholder="Ej: Día de la Independencia" />
            </div>
            <Button type="submit" size="sm" disabled={createAbsence.isPending}>
              <Plus className="h-4 w-4 mr-1" /> {createAbsence.isPending ? 'Guardando...' : 'Agregar'}
            </Button>
          </div>
        </form>
      )}

      {/* Formulario ausencia individual */}
      {canEdit && mode === 'absence' && (
        <form onSubmit={handleAddAbsence} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 space-y-4">
          <p className="text-xs text-slate-500">Registrá ausencia de uno o más técnicos: jornada completa o media jornada.</p>

          {/* Selector técnicos */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">
                Técnicos{aTechIds.size > 0 && <span className="ml-1 text-orange-600">({aTechIds.size} seleccionado{aTechIds.size > 1 ? 's' : ''})</span>}
              </label>
              <button type="button" onClick={toggleAllA} className="text-xs text-blue-600 hover:underline">
                {aTechIds.size === technicians.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 border border-slate-200 rounded-lg p-3 bg-white max-h-52 overflow-y-auto">
              {technicians.map(t => (
                <label key={t.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aTechIds.has(t.id)}
                    onChange={() => toggleATech(t.id)}
                    className="rounded border-slate-300 accent-orange-500 h-3.5 w-3.5"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 font-medium truncate">{t.name.split(' ')[0]} {t.name.split(' ')[1] ?? ''}</p>
                    {t.specialty && <p className="text-xs text-slate-400 truncate">{t.specialty}</p>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Fecha</label>
              <Input type="date" value={aDate} onChange={e => setADate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Tipo</label>
              <select
                value={aType}
                onChange={e => setAType(e.target.value as 'full' | 'half')}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-400"
              >
                <option value="full">Jornada completa</option>
                <option value="half">Media jornada</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Motivo (opcional)</label>
              <Input value={aReason} onChange={e => setAReason(e.target.value)} placeholder="Ej: Enfermedad, Médico..." />
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={createAbsence.isPending || aTechIds.size === 0 || !aDate}>
              <Plus className="h-4 w-4 mr-1" /> {createAbsence.isPending ? 'Guardando...' : 'Registrar ausencia'}
            </Button>
          </div>
        </form>
      )}

      {/* Formulario caso especial */}
      {canEdit && mode === 'partial' && (
        <form onSubmit={handleAddPartial} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 space-y-4">
          <p className="text-xs text-slate-500">Para cursos, reuniones u otras actividades que bloquean horas específicas de un técnico.</p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-700">
                Técnicos{pTechIds.size > 0 && <span className="ml-1 text-violet-600">({pTechIds.size} seleccionado{pTechIds.size > 1 ? 's' : ''})</span>}
              </label>
              <button type="button" onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
                {pTechIds.size === technicians.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 border border-slate-200 rounded-lg p-3 bg-white">
              {technicians.map(t => (
                <label key={t.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={pTechIds.has(t.id)}
                    onChange={() => toggleTech(t.id)}
                    className="rounded border-slate-300 accent-violet-600 h-3.5 w-3.5"
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800 font-medium truncate">{t.name.split(' ')[0]}</p>
                    {t.specialty && <p className="text-xs text-slate-400 truncate">{t.specialty}</p>}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Fecha</label>
            <Input type="date" value={pDate} onChange={e => setPDate(e.target.value)} required className="w-48" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Desde</label>
              <select
                value={pFrom}
                onChange={e => setPFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {HOUR_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Hasta</label>
              <select
                value={pTo}
                onChange={e => setPTo(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {HOUR_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 flex flex-col justify-end">
              {pFrom && pTo && pFrom < pTo && (
                <span className="text-xs text-violet-600 font-medium bg-violet-50 border border-violet-200 rounded px-2 py-1 text-center">
                  {(() => {
                    const [sh, sm] = pFrom.split(':').map(Number);
                    const [eh, em] = pTo.split(':').map(Number);
                    const mins = (eh * 60 + em) - (sh * 60 + sm);
                    return `${mins / 60}h bloqueadas`;
                  })()}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Motivo</label>
              <Input value={pReason} onChange={e => setPReason(e.target.value)} placeholder="Ej: Curso de capacitación, Reunión, etc." />
            </div>
            <Button type="submit" size="sm" disabled={createAbsence.isPending || pTechIds.size === 0 || !pDate || pFrom >= pTo}>
              <Plus className="h-4 w-4 mr-1" /> {createAbsence.isPending ? 'Guardando...' : 'Registrar'}
            </Button>
          </div>
        </form>
      )}

      {submitError && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{submitError}</p>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <p className="text-sm font-medium text-slate-700">Registros ({absences.length})</p>
        </div>
        {absences.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">No hay registros</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2 font-medium text-slate-600">Fecha</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Técnico</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Tipo</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Detalle</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {absences.map(ab => {
                const { label, cls } = absenceLabel(ab.type);
                const tech = technicians.find(t => t.id === ab.technicianId);
                return (
                  <tr key={ab.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2.5 text-slate-700">{formatDateDisplay(ab.date)}</td>
                    <td className="px-4 py-2.5 text-slate-700">{tech?.name ?? ab.technicianId}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 text-xs">
                      {ab.type === 'partial' && ab.timeStart && ab.timeEnd
                        ? <span className="font-medium text-violet-700">{ab.timeStart} – {ab.timeEnd}{ab.reason ? ` · ${ab.reason}` : ''}</span>
                        : ab.reason ?? '—'
                      }
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {canEdit && (
                        <button
                          onClick={() => deleteAbsence.mutate(ab.id)}
                          className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
    </div>
  );
}

// ── Horario de almuerzo ───────────────────────────────────────────────────────

interface LunchBreak { enabled: boolean; start: string; end: string }

function LunchBreakSection({
  lunchBreak,
  canEdit,
  onSave,
  saving,
}: {
  lunchBreak: LunchBreak;
  canEdit: boolean;
  onSave: (lb: LunchBreak) => void;
  saving: boolean;
}) {
  const [local, setLocal] = useState<LunchBreak>(lunchBreak);
  const [dirty, setDirty] = useState(false);

  useEffect(() => { setLocal(lunchBreak); setDirty(false); }, [lunchBreak]);

  function update(patch: Partial<LunchBreak>) {
    if (!canEdit) return;
    setLocal(prev => ({ ...prev, ...patch }));
    setDirty(true);
  }

  const durationMin = (() => {
    if (!local.start || !local.end || local.start >= local.end) return 0;
    const [sh, sm] = local.start.split(':').map(Number);
    const [eh, em] = local.end.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
  })();

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-slate-500" />
            Horario de almuerzo
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Bloquea un rango horario en las agendas de todos los técnicos. No se podrán crear turnos que se superpongan.
          </p>
        </div>
        {canEdit && dirty && (
          <Button
            size="sm"
            onClick={() => { onSave(local); setDirty(false); }}
            disabled={saving || (local.enabled && local.start >= local.end)}
          >
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
        {/* Toggle principal */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">Activar bloqueo de almuerzo</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {local.enabled
                ? `Activo: ${local.start} – ${local.end}${durationMin > 0 ? ` · ${durationMin / 60}h bloqueada` : ''}`
                : 'Sin bloqueo configurado'}
            </p>
          </div>
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => update({ enabled: !local.enabled })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              local.enabled ? 'bg-orange-500' : 'bg-slate-300'
            } ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              local.enabled ? 'translate-x-6' : 'translate-x-1'
            }`} />
          </button>
        </div>

        {/* Selectores de hora — solo cuando activo */}
        {local.enabled && (
          <div className="flex items-end gap-4 pt-1 border-t border-slate-100">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Inicio</label>
              <select
                value={local.start}
                onChange={e => update({ start: e.target.value })}
                disabled={!canEdit}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-60"
              >
                {HOUR_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="pb-2 text-slate-400 text-sm font-medium">→</div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">Fin</label>
              <select
                value={local.end}
                onChange={e => update({ end: e.target.value })}
                disabled={!canEdit}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-orange-400 disabled:opacity-60"
              >
                {HOUR_SLOTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="space-y-1.5 flex flex-col justify-end">
              {durationMin > 0 ? (
                <span className="text-xs font-semibold px-3 py-2 rounded-lg bg-orange-50 border border-orange-200 text-orange-700">
                  {durationMin / 60}h bloqueada{durationMin / 60 > 1 ? 's' : ''}
                </span>
              ) : local.start >= local.end ? (
                <span className="text-xs font-semibold px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-600">
                  Horario inválido
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Horario semanal ───────────────────────────────────────────────────────────

const DAY_META: { key: WeekDay; label: string; short: string }[] = [
  { key: 'mon', label: 'Lunes',     short: 'Lu' },
  { key: 'tue', label: 'Martes',    short: 'Ma' },
  { key: 'wed', label: 'Miércoles', short: 'Mi' },
  { key: 'thu', label: 'Jueves',    short: 'Ju' },
  { key: 'fri', label: 'Viernes',   short: 'Vi' },
  { key: 'sat', label: 'Sábado',    short: 'Sa' },
  { key: 'sun', label: 'Domingo',   short: 'Do' },
];

const PARTIAL_HOURS = [2, 3, 4, 5, 6, 7];

function WeeklyScheduleSection({
  schedule,
  canEdit,
  onSave,
  saving,
}: {
  schedule: WeeklySchedule;
  canEdit: boolean;
  onSave: (s: WeeklySchedule) => void;
  saving: boolean;
}) {
  const [local, setLocal] = useState<WeeklySchedule>(schedule);
  const [dirty, setDirty] = useState(false);

  // Sincronizar cuando llega el workshop actualizado desde la API
  useEffect(() => {
    setLocal(schedule);
    setDirty(false);
  }, [schedule]);

  function toggle(day: WeekDay) {
    if (!canEdit) return;
    setLocal(prev => ({
      ...prev,
      [day]: { working: !prev[day].working, hours: undefined },
    }));
    setDirty(true);
  }

  function setHours(day: WeekDay, hours: number | undefined) {
    if (!canEdit) return;
    setLocal(prev => ({ ...prev, [day]: { ...prev[day], hours } }));
    setDirty(true);
  }

  function handleSave() {
    onSave(local);
    setDirty(false);
  }

  function hoursLabel(day: DaySchedule) {
    if (!day.working) return 'No laborable';
    if (!day.hours) return 'Jornada completa';
    return `${day.hours}h (hasta las ${8 + day.hours}:00)`;
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Días laborables</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configura qué días trabaja el taller. Se aplica a todos los cálculos de capacidad.
          </p>
        </div>
        {canEdit && dirty && (
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {DAY_META.map(({ key, label, short }) => {
          const day = local[key];
          const isWeekend = key === 'sat' || key === 'sun';
          return (
            <div
              key={key}
              className={`rounded-xl border-2 p-3 flex flex-col gap-2 transition-all ${
                day.working
                  ? isWeekend
                    ? 'border-orange-200 bg-orange-50'
                    : 'border-emerald-200 bg-emerald-50'
                  : 'border-slate-200 bg-slate-50 opacity-70'
              }`}
            >
              {/* Nombre + toggle */}
              <div className="flex flex-col items-center gap-1">
                <span className={`text-[11px] font-bold uppercase tracking-wide ${
                  day.working ? (isWeekend ? 'text-orange-700' : 'text-emerald-700') : 'text-slate-400'
                }`}>
                  {short}
                </span>
                <span className="text-[10px] text-slate-400 hidden sm:block truncate">{label}</span>
                <button
                  onClick={() => toggle(key)}
                  disabled={!canEdit}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    day.working
                      ? isWeekend ? 'bg-orange-400' : 'bg-emerald-500'
                      : 'bg-slate-300'
                  } ${!canEdit ? 'cursor-default' : 'cursor-pointer'}`}
                  title={day.working ? 'Clic para marcar como no laborable' : 'Clic para activar'}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    day.working ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {/* Horas reducidas — solo si es laborable */}
              {day.working && (
                <div className="flex flex-col items-center gap-1 mt-1">
                  <span className="text-[10px] text-slate-500 font-medium">Horas</span>
                  <select
                    value={day.hours ?? ''}
                    onChange={e => setHours(key, e.target.value ? Number(e.target.value) : undefined)}
                    disabled={!canEdit}
                    className="w-full text-[11px] text-center rounded-md border border-slate-200 bg-white py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-400 disabled:opacity-60"
                  >
                    <option value="">Completa</option>
                    {PARTIAL_HOURS.map(h => (
                      <option key={h} value={h}>
                        {h}h (→{8 + h}:00)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Etiqueta resumen */}
              <span className={`text-[10px] text-center font-medium mt-auto ${
                day.working ? (isWeekend ? 'text-orange-600' : 'text-emerald-600') : 'text-slate-400'
              }`}>
                {hoursLabel(day)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-400 inline-block" />Laborable</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-orange-400 inline-block" />Laborable (especial)</span>
        <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-300 inline-block" />No laborable</span>
      </div>
    </section>
  );
}
