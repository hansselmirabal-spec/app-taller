'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateAbsence } from '@/hooks/use-capacity';
import { formatDateDisplay } from '@/lib/utils';

interface Props {
  technicianId: string;
  technicianName: string;
  date: string;
  onClose: () => void;
}

export function AbsenceModal({ technicianId, technicianName, date, onClose }: Props) {
  const [type, setType] = useState<'full' | 'half' | 'holiday'>('full');
  const create = useCreateAbsence();

  async function handleSave() {
    await create.mutateAsync({ technicianId, date, type });
    onClose();
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar ausencia</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-2 text-slate-600">
            <span className="text-slate-500">Tecnico</span><span className="font-medium text-slate-900">{technicianName}</span>
            <span className="text-slate-500">Fecha</span><span className="font-medium text-slate-900 capitalize">{formatDateDisplay(date)}</span>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Tipo de ausencia</label>
            <Select value={type} onValueChange={v => setType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">Ausencia completa (0h)</SelectItem>
                <SelectItem value="half">Media jornada (50%)</SelectItem>
                <SelectItem value="holiday">Feriado particular</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSave} disabled={create.isPending}>
            {create.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
