'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Search, X, Wrench, Brush, Calendar, User, Loader2 } from 'lucide-react';
import { http } from '@/lib/api';

// Buscador de clientes/turnos agendados. Atajo `Cmd+K` o `Ctrl+K` lo abre.
// Busca en /appointments/search?q=… (mecánica + chapería) por chapa, nombre o id.

interface SearchResult {
  kind:         'appointment' | 'bodyshop';
  id:           string;
  date:         string;
  time:         string | null;
  customerName: string;
  plate:        string;
  status:       string;
  serviceType:  string | null;
  technician:   string | null;
  workshopId:   string | null;
}

interface SearchResponse {
  results: SearchResult[];
  total:   number;
  query:   string;
}

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  scheduled:   { label: 'Agendado',     cls: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'En proceso',   cls: 'bg-amber-100 text-amber-700' },
  done:        { label: 'Finalizado',   cls: 'bg-emerald-100 text-emerald-700' },
  cancelled:   { label: 'Cancelado',    cls: 'bg-slate-100 text-slate-500' },
};

function debounce<T extends (...args: any[]) => void>(fn: T, ms = 250) {
  let t: any = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AppointmentSearchModal({ open, onClose }: Props) {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearchRef = useRef(
    debounce(async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]); setLoading(false); setError(''); return;
      }
      setLoading(true);
      setError('');
      try {
        const json = await http<SearchResponse>(`/appointments/search?q=${encodeURIComponent(q)}`);
        setResults(json.results ?? []);
      } catch (e: any) {
        setError(e.message || 'Error al buscar');
      } finally {
        setLoading(false);
      }
    }, 250),
  );

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); setError(''); return; }
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onClose]);

  useEffect(() => {
    if (open) runSearchRef.current(query);
  }, [query, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[150] flex items-start justify-center bg-slate-900/50 backdrop-blur-sm pt-[10vh] px-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-150 max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-3">
          <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar por chapa, cliente o id (ej. AAA111, García, 5d8a...)"
            className="flex-1 outline-none text-sm placeholder-slate-400"
          />
          {loading && <Loader2 className="h-4 w-4 text-slate-400 animate-spin flex-shrink-0" />}
          <kbd className="hidden sm:inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">ESC</kbd>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {error ? (
            <div className="p-6 text-center text-sm text-red-500">{error}</div>
          ) : query.trim().length < 2 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Escribí al menos <strong>2 caracteres</strong> para buscar.
              <p className="text-[11px] mt-1 text-slate-400">Busca en turnos de mecánica y chapería agendados.</p>
            </div>
          ) : !loading && results.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400">
              Sin resultados para <strong>&quot;{query}&quot;</strong>.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {results.map(r => {
                const stat = STATUS_LABEL[r.status] ?? { label: r.status, cls: 'bg-slate-100 text-slate-500' };
                // Deep-link: incluye openId para que la vista destino abra automáticamente
                // el detalle del turno/ingreso al cargarse.
                const href = `/appointments?date=${r.date}&openId=${r.id}` +
                  (r.kind === 'bodyshop' ? '&view=bodyshop' : '');
                return (
                  <li key={`${r.kind}-${r.id}`}>
                    <Link
                      href={href}
                      onClick={onClose}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-indigo-50/50 transition-colors"
                    >
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        r.kind === 'appointment' ? 'bg-indigo-100 text-indigo-600' : 'bg-orange-100 text-orange-600'
                      }`}>
                        {r.kind === 'appointment' ? <Wrench className="h-4 w-4" /> : <Brush className="h-4 w-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900 truncate">{r.customerName || '—'}</span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 flex-shrink-0">{r.plate}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                          <Calendar className="h-3 w-3 flex-shrink-0" />
                          <span>{r.date}{r.time ? ` · ${r.time}` : ''}</span>
                          {r.serviceType && <><span className="text-slate-300">·</span><span className="truncate">{r.serviceType}</span></>}
                          {r.technician && <><span className="text-slate-300">·</span><User className="h-3 w-3 flex-shrink-0" /><span className="truncate">{r.technician}</span></>}
                        </div>
                      </div>

                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${stat.cls}`}>
                        {stat.label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 flex justify-between">
            <span>{results.length} resultado{results.length !== 1 ? 's' : ''}</span>
            <span>Mecánica + Chapería</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
