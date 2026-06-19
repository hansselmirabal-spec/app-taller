'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useCreateBudgetAppointment } from '@/hooks/use-budget-appointments';
import { useWorkshopId } from '@/context/workshop-context';
import { getStoredUser } from '@/lib/auth';
import { useUsers } from '@/hooks/use-users';

export default function NuevaCitaPresupuestoPage() {
  const router     = useRouter();
  const workshopId = useWorkshopId();
  const [isAdmin, setIsAdmin]             = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');
  const { data: allUsers = [] } = useUsers();

  useEffect(() => {
    const user = getStoredUser();
    setIsAdmin(user?.role === 'admin');
    setCurrentUserName(user?.name ?? '');
  }, []);

  const [date, setDate]             = useState(formatDate(new Date()));
  const [timeStart, setTimeStart]   = useState('09:00');
  const [timeEnd, setTimeEnd]       = useState('09:30');
  const [plate, setPlate]           = useState('');
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone]           = useState('');
  const [budgetNumber, setBudgetNumber] = useState('');
  const [notes, setNotes]           = useState('');
  const [selectedPeritoId, setSelectedPeritoId] = useState('');
  const [error, setError]           = useState('');

  const createMutation = useCreateBudgetAppointment();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workshopId) { setError('No hay taller seleccionado'); return; }
    if (!plate.trim())        { setError('La chapa es obligatoria'); return; }
    if (!customerName.trim()) { setError('El nombre del cliente es obligatorio'); return; }
    if (timeEnd <= timeStart)  { setError('La hora de fin debe ser posterior a la hora de inicio'); return; }

    setError('');
    try {
      const result = await createMutation.mutateAsync({
        workshopId,
        date,
        timeStart,
        timeEnd,
        plate: plate.toUpperCase().trim(),
        customerName: customerName.trim(),
        phone: phone.trim() || null,
        notes: notes.trim() || null,
        budgetNumber: budgetNumber.trim() || null,
        peritoId: isAdmin && selectedPeritoId ? selectedPeritoId : null,
      });
      router.push(`/presupuesto/${result.id}`);
    } catch (err: any) {
      setError(err.message ?? 'Error al crear el presupuesto');
    }
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <ArrowLeft className="h-4 w-4 text-slate-500" />
          </button>
          <FileText className="h-5 w-5 text-slate-400" />
          <h1 className="text-base font-semibold text-slate-900">Nuevo Presupuesto</h1>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-lg mx-auto space-y-5">

          {/* Fecha */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Horario */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Hora inicio</label>
              <input
                type="time"
                value={timeStart}
                onChange={e => setTimeStart(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Hora fin</label>
              <input
                type="time"
                value={timeEnd}
                onChange={e => setTimeEnd(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Vehículo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Chapa / Patente *</label>
              <input
                type="text"
                value={plate}
                onChange={e => setPlate(e.target.value.toUpperCase())}
                placeholder="ABC 123"
                required
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium uppercase outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">N° Presupuesto</label>
              <input
                type="text"
                value={budgetNumber}
                onChange={e => setBudgetNumber(e.target.value)}
                placeholder="Opcional"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nombre del cliente *</label>
            <input
              type="text"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Juan Pérez"
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Teléfono */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Teléfono</label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="0981 000 000"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Perito (solo admin) */}
          {isAdmin && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1.5">Perito asignado</label>
              <select
                value={selectedPeritoId}
                onChange={e => setSelectedPeritoId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Yo mismo ({currentUserName})</option>
                {allUsers
                  .filter(u => u.role === 'perito' && u.active)
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))
                }
              </select>
            </div>
          )}

          {/* Notas */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Notas</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Descripción del daño, información adicional..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 resize-none"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Acciones */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Creando...</>
              ) : (
                'Crear presupuesto'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
