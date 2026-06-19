'use client';
import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkshop } from '@/context/workshop-context';
import { useWorkshops } from '@/hooks/use-workshops';

export function WorkshopSwitcher() {
  const { workshopId, setWorkshopId } = useWorkshop();
  const { data: workshops = [] } = useWorkshops();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const active = workshops.find(w => w.id === workshopId);

  // Cierre al click fuera
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 transition-colors group"
      >
        <div className="h-7 w-7 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
          <Building2 className="h-3.5 w-3.5 text-white" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-bold text-slate-900 tracking-tight truncate leading-tight">
              {active?.name ?? 'Atelier Ops'}
            </p>
            {active?.type && (
              <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${
                active.type === 'BODYSHOP'
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {active.type === 'BODYSHOP' ? 'CARR' : 'MEC'}
              </span>
            )}
          </div>
          {active?.address && (
            <p className="text-[10px] text-slate-400 truncate leading-tight">{active.address}</p>
          )}
        </div>
        <ChevronDown className={cn(
          'h-3.5 w-3.5 text-slate-400 transition-transform flex-shrink-0',
          open && 'rotate-180'
        )} />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-lg py-1 overflow-hidden">
          {workshops.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">Sin talleres</p>
          ) : (
            workshops.map(w => (
              <button
                key={w.id}
                onClick={() => { setWorkshopId(w.id); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors',
                  w.id === workshopId && 'bg-blue-50'
                )}
              >
                <div className={cn(
                  'h-6 w-6 rounded-md flex items-center justify-center flex-shrink-0 text-xs font-bold',
                  w.id === workshopId ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'
                )}>
                  {w.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className={cn(
                      'text-sm font-medium truncate',
                      w.id === workshopId ? 'text-blue-700' : 'text-slate-800'
                    )}>{w.name}</p>
                    {w.type && (
                      <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${
                        w.type === 'BODYSHOP' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'
                      }`}>
                        {w.type === 'BODYSHOP' ? 'CARR' : 'MEC'}
                      </span>
                    )}
                  </div>
                  {w.address && (
                    <p className="text-[10px] text-slate-400 truncate">{w.address}</p>
                  )}
                </div>
                {w.id === workshopId && <Check className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
