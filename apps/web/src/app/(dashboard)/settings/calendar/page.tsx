'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateAbsence, useDeleteAbsence } from '@/hooks/use-capacity';
import { useTechnicians } from '@/hooks/use-technicians';
import { MOCK_ABSENCES } from '@/lib/mock-data';
import { formatDateDisplay } from '@/lib/utils';

export default function CalendarSettingsPage() {
  const createAbsence = useCreateAbsence();
  const deleteAbsence = useDeleteAbsence();
  const { data: technicians = [] } = useTechnicians();
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [submitError, setSubmitError] = useState('');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError('');
    if (!date) return;
    try {
      // Feriado global: crear ausencia tipo 'holiday' para cada tecnico
      await Promise.all(
        technicians.map(tech =>
          createAbsence.mutateAsync({ technicianId: tech.id, date, type: 'holiday' })
        )
      );
      setDate('');
      setNote('');
    } catch (err: any) {
      setSubmitError(err.message || 'Error al registrar feriado');
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Calendario y feriados</h1>
        <p className="text-sm text-slate-500 mt-1">Configurar dias no laborables globales para todo el taller.</p>
      </div>

      <form onSubmit={handleAdd} className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-6 flex gap-3 items-end">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-700">Fecha del feriado</label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        <div className="flex-1 space-y-1.5">
          <label className="text-xs font-medium text-slate-700">Descripcion (opcional)</label>
          <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Ej: Feriado nacional" />
        </div>
        <Button type="submit" size="sm" disabled={createAbsence.isPending}>
          <Plus className="h-4 w-4 mr-1" /> {createAbsence.isPending ? 'Guardando...' : 'Agregar'}
        </Button>
      </form>
      {submitError && (
        <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{submitError}</p>
      )}

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <p className="text-sm font-medium text-slate-700">Ausencias registradas</p>
        </div>
        {MOCK_ABSENCES.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">No hay ausencias registradas</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-4 py-2 font-medium text-slate-600">Fecha</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Tecnico</th>
                <th className="text-left px-4 py-2 font-medium text-slate-600">Tipo</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {MOCK_ABSENCES.map(ab => (
                <tr key={ab.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-2.5 capitalize text-slate-700">{formatDateDisplay(ab.date)}</td>
                  <td className="px-4 py-2.5 text-slate-700">{technicians.find(t => t.id === ab.technicianId)?.name ?? ab.technicianId}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      ab.type === 'full' ? 'bg-red-100 text-red-700' :
                      ab.type === 'half' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {ab.type === 'full' ? 'Ausente' : ab.type === 'half' ? 'Media jornada' : 'Feriado'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => deleteAbsence.mutate(ab.id)} className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
