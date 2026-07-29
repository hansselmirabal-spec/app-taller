'use client';
import { useRouter } from 'next/navigation';
import { FileText, Wrench, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function CitaTypeDialog({
  open,
  onOpenChange,
  date,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
}) {
  const router = useRouter();

  function goToPresupuesto() {
    onOpenChange(false);
    router.push('/presupuesto/nueva-cita');
  }

  function goToAgenda() {
    onOpenChange(false);
    router.push(`/appointments/new?date=${date}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>¿Qué tipo de cita querés crear?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={goToPresupuesto}
            className="w-full flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
              <FileText className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">Cita de Presupuesto</p>
              <p className="text-xs text-slate-500 mt-0.5">
                El perito inspecciona el vehículo y arma el presupuesto.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0 mt-1" />
          </button>

          <button
            type="button"
            onClick={goToAgenda}
            className="w-full flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-orange-300 hover:bg-orange-50/50 transition-colors"
          >
            <div className="h-9 w-9 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center flex-shrink-0">
              <Wrench className="h-4.5 w-4.5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800">Ingreso a Agenda</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Entra directo al taller — técnicos y procesos de Chapería, Preparación y Pintura.
              </p>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0 mt-1" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
