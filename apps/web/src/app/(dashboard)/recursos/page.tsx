'use client';

import { useRouter } from 'next/navigation';
import { Package, RefreshCw, PackageX, Clock, Loader2, AlertTriangle } from 'lucide-react';
import { useWorkshopId } from '@/context/workshop-context';
import { useResourceAgenda, useClearResource } from '@/hooks/use-tracking';
import { InfoButton } from '@/components/ui/info-button';

function timeAgo(isoStr: string | null): string {
  if (!isoStr) return '—';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins < 60)  return `Hace ${mins}m`;
  if (hours < 24) return `Hace ${hours}h`;
  return `Hace ${days}d`;
}

export default function RecursosPage() {
  const router     = useRouter();
  const workshopId = useWorkshopId();
  const { data: items = [], isLoading, refetch } = useResourceAgenda(workshopId ?? undefined);
  const clearMutation = useClearResource();

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Package className="h-5 w-5 text-yellow-500" />
            <h1 className="text-base font-semibold text-slate-900">Agenda de Recursos</h1>
            <InfoButton helpKey="recursos" />
            {items.length > 0 && (
              <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-semibold">
                {items.length} pendiente{items.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-slate-400">
            <Package className="h-10 w-10 opacity-30" />
            <p className="text-sm">Sin recursos pendientes</p>
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3">
            {items.map(item => (
              <div
                key={item.entryId}
                className="bg-white rounded-xl border border-yellow-200 border-l-4 border-l-yellow-400 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-base text-slate-900 tracking-wider">{item.plate}</span>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                        {item.currentProcessName}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{item.customerName}</p>
                    {item.resourceNote && (
                      <div className="flex items-start gap-1.5 mt-2 bg-yellow-50 rounded-lg px-3 py-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-yellow-800">{item.resourceNote}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
                      <Clock className="h-3 w-3" />
                      <span>{timeAgo(item.resourceBlockedAt)}</span>
                      <span>·</span>
                      <span>Entrada: {item.date}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={clearMutation.isPending}
                    onClick={() => clearMutation.mutate(item.entryId)}
                    className="flex-shrink-0 flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                  >
                    {clearMutation.isPending
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <PackageX className="h-3.5 w-3.5" />
                    }
                    Liberar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
