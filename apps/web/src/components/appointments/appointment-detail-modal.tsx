'use client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useCancelAppointment, useUpdateAppointmentStatus } from '@/hooks/use-appointments';
import { statusLabel, statusColor } from '@/lib/utils';
import { isAdmin } from '@/lib/auth';
import type { Appointment } from '@/types';

interface Props {
  appointment: Appointment;
  onClose: () => void;
}

export function AppointmentDetailModal({ appointment: appt, onClose }: Props) {
  const cancel = useCancelAppointment();
  const updateStatus = useUpdateAppointmentStatus();
  const admin = isAdmin();

  async function handleCancel() {
    if (!confirm('¿Cancelar este turno?')) return;
    await cancel.mutateAsync({ id: appt.id, date: appt.date });
    onClose();
  }

  async function handleStatus(status: string) {
    await updateStatus.mutateAsync({ id: appt.id, status, date: appt.date });
    onClose();
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Detalle del turno</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Estado</span>
            <Badge className={statusColor(appt.status)}>{statusLabel(appt.status)}</Badge>
          </div>
          <Row label="Cliente" value={appt.customerName} />
          <Row label="Patente" value={appt.plate} />
          <Row label="Servicio" value={appt.serviceType.name} />
          <Row label="Tecnico" value={appt.technician.name} />
          <Row label="Horario" value={`${appt.timeStart} - ${appt.timeEnd}`} />
          <Row label="Fecha" value={appt.date} />
          {appt.notes && <Row label="Notas" value={appt.notes} />}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {admin && appt.status === 'scheduled' && (
            <Button size="sm" variant="outline" onClick={() => handleStatus('in_progress')}>
              Marcar en proceso
            </Button>
          )}
          {admin && appt.status === 'in_progress' && (
            <Button size="sm" variant="outline" onClick={() => handleStatus('done')}>
              Marcar terminado
            </Button>
          )}
          {appt.status !== 'cancelled' && appt.status !== 'done' && (
            <Button size="sm" variant="destructive" onClick={handleCancel} disabled={cancel.isPending}>
              Cancelar turno
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="text-slate-900 text-right">{value}</span>
    </div>
  );
}
