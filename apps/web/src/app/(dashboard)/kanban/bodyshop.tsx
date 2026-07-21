'use client';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { KanbanSquare, Filter, X, Settings2, ShieldCheck, Phone, Globe, Car, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useBodyshopEntriesKanban, useUpdateBodyshopEntryStatus } from '@/hooks/use-bodyshop';
import { useWorkTypes } from '@/hooks/use-work-types';
import { ActivitiesPanel } from '@/components/kanban/activities-panel';
import {
  KanbanSettingsModal,
  type KanbanColConfig,
  type KanbanFieldConfig,
} from '@/components/kanban/settings-modal';
import { cn, sumBodyshopHours } from '@/lib/utils';
import type { BodyshopEntry } from '@/types';

// ─── Config defaults ──────────────────────────────────────────────────────────

const DEFAULT_COLS: KanbanColConfig[] = [
  { status: 'scheduled',   label: 'Pendiente',  color: '#94a3b8', enabled: true },
  { status: 'in_progress', label: 'En proceso', color: '#f97316', enabled: true },
  { status: 'done',        label: 'Terminado',  color: '#22c55e', enabled: true },
  { status: 'cancelled',   label: 'Cancelado',  color: '#ef4444', enabled: true },
];

const DEFAULT_FIELDS: KanbanFieldConfig[] = [
  { id: 'work_type', label: 'Tipo de trabajo', visible: true },
  { id: 'severity',  label: 'Severidad',       visible: true },
  { id: 'channel',   label: 'Canal',           visible: true },
  { id: 'hours',     label: 'Horas totales',   visible: true },
  { id: 'stay_days', label: 'Permanencia',     visible: true },
  { id: 'date',      label: 'Fecha ingreso',   visible: true },
];

const STORAGE_KEY = 'bodyshop_kanban_config_v1';

function loadConfig() {
  if (typeof window === 'undefined') return { cols: DEFAULT_COLS, fields: DEFAULT_FIELDS };
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      const p = JSON.parse(s);
      return { cols: p.cols ?? DEFAULT_COLS, fields: p.fields ?? DEFAULT_FIELDS };
    }
  } catch { /* ignore */ }
  return { cols: DEFAULT_COLS, fields: DEFAULT_FIELDS };
}

// ─── Lookups ──────────────────────────────────────────────────────────────────

const SEVERITY_STYLE: Record<string, string> = {
  LIGHT:    'bg-green-100 text-green-700',
  MEDIUM:   'bg-amber-100 text-amber-700',
  HEAVY:    'bg-red-100 text-red-700',
  MULTIPLE: 'bg-violet-100 text-violet-700',
};
const SEVERITY_LABEL: Record<string, string> = {
  LIGHT: 'Leve', MEDIUM: 'Mediano', HEAVY: 'Grave', MULTIPLE: 'Múltiple',
};
const CHANNEL_LABEL: Record<string, string> = {
  walk_in: 'Presencial', phone: 'Teléfono', online: 'Online', insurance: 'Seguro',
};
const CHANNEL_ICON: Record<string, React.ReactNode> = {
  walk_in:   <Car className="h-3 w-3" />,
  phone:     <Phone className="h-3 w-3" />,
  online:    <Globe className="h-3 w-3" />,
  insurance: <ShieldCheck className="h-3 w-3" />,
};

function fmtDate(d: string) {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

function overdueDays(entry: BodyshopEntry, today: string | null): number | null {
  if (!today || !entry.estimatedFinishDate) return null;
  if (entry.status === 'done' || entry.status === 'cancelled') return null;
  if (entry.estimatedFinishDate >= today) return null;
  const diff = Math.floor(
    (new Date(today).getTime() - new Date(entry.estimatedFinishDate).getTime()) / 86_400_000
  );
  return diff > 0 ? diff : null;
}

function getMonthRange(): { from: string; to: string } {
  const t = new Date();
  return {
    from: new Date(t.getFullYear(), t.getMonth(), 1).toISOString().split('T')[0],
    to:   new Date(t.getFullYear(), t.getMonth() + 1, 0).toISOString().split('T')[0],
  };
}
function getLastMonthRange(): { from: string; to: string } {
  const t = new Date();
  return {
    from: new Date(t.getFullYear(), t.getMonth() - 1, 1).toISOString().split('T')[0],
    to:   new Date(t.getFullYear(), t.getMonth(), 0).toISOString().split('T')[0],
  };
}

// ─── Entry detail modal (2 columnas: info + actividades) ─────────────────────

function EntryDetailModal({ entry, onClose }: { entry: BodyshopEntry; onClose: () => void }) {
  const updateStatus = useUpdateBodyshopEntryStatus();
  const totalHours   = sumBodyshopHours(entry);

  async function handleStatus(status: BodyshopEntry['status']) {
    if (status === 'cancelled' && !confirm('¿Cancelar este ingreso?')) return;
    await updateStatus.mutateAsync({ id: entry.id, status });
    onClose();
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            {entry.customerName}
            <span className="font-mono text-slate-400 text-sm font-normal">{entry.plate}</span>
            <span
              className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: (entry.workType?.color ?? '#94a3b8') + '22', color: entry.workType?.color ?? '#94a3b8' }}
            >
              {entry.workType?.name}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* ── Left: info ────────────────────────────────────────────── */}
          <div className="flex flex-col w-[55%] border-r border-slate-100 px-6 py-4 overflow-y-auto">
            <div
              className="h-1 w-full rounded-full mb-4"
              style={{ background: entry.workType?.color ?? '#94a3b8' }}
            />

            <div className="space-y-3 text-sm flex-1">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Severidad</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEVERITY_STYLE[entry.workType?.severity ?? 'medium']}`}>
                  {SEVERITY_LABEL[entry.workType?.severity ?? 'medium']}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Canal</span>
                <span className="flex items-center gap-1.5 text-xs text-slate-700">
                  {CHANNEL_ICON[entry.channel]}
                  {CHANNEL_LABEL[entry.channel]}
                </span>
              </div>
              {[
                { label: 'Fecha ingreso', val: entry.date },
                { label: 'Permanencia',  val: `${entry.stayDays} días` },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-slate-500">{r.label}</span>
                  <span className="font-medium text-slate-900">{r.val}</span>
                </div>
              ))}
            </div>

            {/* Process hours */}
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2 mt-4">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Horas por proceso</p>
              {[
                { label: 'Chapería',    hours: entry.bodyworkHours, color: '#3b82f6' },
                { label: 'Preparación', hours: entry.prepHours,     color: '#8b5cf6' },
                { label: 'Pintura',     hours: entry.paintHours,    color: '#f97316' },
              ].map(p => (
                <div key={p.label} className="flex items-center gap-2">
                  <div className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: p.color }} />
                  <span className="text-xs text-slate-600 w-20">{p.label}</span>
                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${totalHours ? (p.hours / totalHours) * 100 : 0}%`, background: p.color }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-8 text-right">{p.hours}h</span>
                </div>
              ))}
            </div>

            {entry.notes && (
              <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                <p className="text-xs font-semibold text-slate-500 mb-1">Notas</p>
                <p className="text-sm text-slate-700">{entry.notes}</p>
              </div>
            )}

            {/* Status actions */}
            <div className="flex flex-col gap-2 pt-4 mt-4 border-t border-slate-100">
              {entry.status === 'scheduled' && (
                <Button size="sm" variant="outline" onClick={() => handleStatus('in_progress')} disabled={updateStatus.isPending}>
                  Marcar en proceso
                </Button>
              )}
              {entry.status === 'in_progress' && (
                <Button size="sm" variant="outline" onClick={() => handleStatus('done')} disabled={updateStatus.isPending}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Marcar terminado
                </Button>
              )}
              {(entry.status === 'scheduled' || entry.status === 'in_progress') && (
                <Button size="sm" variant="destructive" onClick={() => handleStatus('cancelled')} disabled={updateStatus.isPending}>
                  Cancelar ingreso
                </Button>
              )}
            </div>
          </div>

          {/* ── Right: activities ────────────────────────────────────── */}
          <div className="flex flex-col flex-1 px-5 py-4 min-h-0 bg-slate-50/50">
            <ActivitiesPanel cardId={entry.id} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function BodyshopCard({
  entry,
  dragging,
  fields,
  today,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  entry: BodyshopEntry;
  dragging: boolean;
  fields: Record<string, boolean>;
  today: string | null;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const totalHours = sumBodyshopHours(entry);
  const late = overdueDays(entry, today);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border p-3 cursor-grab select-none',
        'shadow-sm hover:shadow-md transition-all duration-150',
        late
          ? 'border-red-300 hover:border-red-400 ring-1 ring-red-200'
          : 'border-slate-200 hover:border-slate-300',
        dragging && 'opacity-40 scale-95 shadow-lg',
      )}
    >
      <div className="h-0.5 w-full rounded-full mb-2.5" style={{ background: entry.workType?.color ?? '#94a3b8', opacity: 0.6 }} />

      {late && (
        <div className="flex items-center gap-1 mb-2 px-1.5 py-0.5 rounded-md bg-red-50 border border-red-200 w-fit">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <span className="text-[11px] font-bold text-red-600">Vencida {late}d</span>
        </div>
      )}

      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div>
          <p className="font-semibold text-slate-900 text-sm leading-tight">{entry.customerName}</p>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{entry.plate}</p>
        </div>
        {fields.work_type && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: (entry.workType?.color ?? '#94a3b8') + '22', color: entry.workType?.color ?? '#94a3b8' }}
          >
            {entry.workType?.name}
          </span>
        )}
      </div>

      {(fields.severity || fields.channel) && (
        <div className="flex items-center gap-2 flex-wrap mb-1.5">
          {fields.severity && (
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${SEVERITY_STYLE[entry.workType?.severity ?? 'medium']}`}>
              {SEVERITY_LABEL[entry.workType?.severity ?? 'medium']}
            </span>
          )}
          {fields.channel && (
            <span className="flex items-center gap-1 text-xs text-slate-500">
              {CHANNEL_ICON[entry.channel]}
              {CHANNEL_LABEL[entry.channel]}
            </span>
          )}
        </div>
      )}

      {(fields.hours || fields.stay_days || fields.date) && (
        <div className="flex items-center gap-2.5 text-xs text-slate-400 flex-wrap mt-1.5">
          {fields.hours && <span>{totalHours}h</span>}
          {fields.stay_days && <span>{entry.stayDays}d</span>}
          {fields.date && <span className="ml-auto font-mono">{fmtDate(entry.date)}</span>}
        </div>
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  col, cards, draggingId, isDropTarget, fieldsMap, today,
  onDragOver, onDragLeave, onDrop, onCardDragStart, onCardDragEnd, onCardClick,
}: {
  col: KanbanColConfig;
  cards: BodyshopEntry[];
  draggingId: string | null;
  isDropTarget: boolean;
  fieldsMap: Record<string, boolean>;
  today: string | null;
  onDragOver: (e: React.DragEvent, status: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, status: string) => void;
  onCardDragStart: (e: React.DragEvent, id: string) => void;
  onCardDragEnd: () => void;
  onCardClick: (entry: BodyshopEntry) => void;
}) {
  return (
    <div className="flex flex-col min-w-[265px] w-[265px]">
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
        <span className="font-semibold text-slate-700 text-sm">{col.label}</span>
        <span
          className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: col.color + '22', color: col.color }}
        >
          {cards.length}
        </span>
      </div>

      <div
        onDragOver={e => onDragOver(e, col.status)}
        onDragLeave={onDragLeave}
        onDrop={e => onDrop(e, col.status)}
        className="flex-1 rounded-xl p-2 space-y-2 min-h-[120px] transition-all duration-150 border"
        style={{
          background: isDropTarget ? col.color + '14' : col.color + '08',
          borderColor: isDropTarget ? col.color : '#e2e8f0',
          outline: isDropTarget ? `2px solid ${col.color}40` : 'none',
          outlineOffset: isDropTarget ? 2 : 0,
        }}
      >
        {cards.map(entry => (
          <BodyshopCard
            key={entry.id}
            entry={entry}
            dragging={draggingId === entry.id}
            fields={fieldsMap}
            today={today}
            onDragStart={e => onCardDragStart(e, entry.id)}
            onDragEnd={onCardDragEnd}
            onClick={() => onCardClick(entry)}
          />
        ))}
        {cards.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-slate-300 italic">
            Sin ingresos
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BodyshopKanban() {
  const stored                            = useMemo(() => loadConfig(), []);
  const [cols, setCols]                   = useState<KanbanColConfig[]>(stored.cols);
  const [fieldsCfg, setFieldsCfg]         = useState<KanbanFieldConfig[]>(stored.fields);
  const [range, setRange]                 = useState(getMonthRange());
  const [wtFilter, setWtFilter]           = useState<string>('all');
  const [showFilters, setShowFilters]     = useState(false);
  const [showSettings, setShowSettings]   = useState(false);
  const [draggingId, setDraggingId]       = useState<string | null>(null);
  const [dropTarget, setDropTarget]       = useState<string | null>(null);
  const [selected, setSelected]           = useState<BodyshopEntry | null>(null);
  const [today, setToday]                 = useState<string | null>(null);

  useEffect(() => {
    setToday(new Date().toISOString().split('T')[0]);
  }, []);

  const { data: allEntries = [] } = useBodyshopEntriesKanban(range.from, range.to);
  const { data: workTypes = [] }  = useWorkTypes();
  const updateStatus              = useUpdateBodyshopEntryStatus();

  const fieldsMap  = useMemo(() => Object.fromEntries(fieldsCfg.map(f => [f.id, f.visible])), [fieldsCfg]);
  const activeCols = useMemo(() => cols.filter(c => c.enabled), [cols]);

  const filtered = useMemo(() =>
    wtFilter === 'all' ? allEntries : allEntries.filter(e => e.workTypeId === wtFilter),
    [allEntries, wtFilter],
  );

  const byStatus = useMemo(() => {
    const map: Record<string, BodyshopEntry[]> = {};
    for (const e of filtered) (map[e.status] ??= []).push(e);
    return map;
  }, [filtered]);

  // ── DnD (fixed: state-based, no dataTransfer dependency) ─────────────────
  const handleCardDragStart = useCallback((e: React.DragEvent, id: string) => {
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(status);
  }, []);

  const handleDragLeave = useCallback(() => setDropTarget(null), []);

  const handleDrop = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (!draggingId) { setDropTarget(null); return; }
    const entry = allEntries.find(en => en.id === draggingId);
    if (entry && entry.status !== status) {
      updateStatus.mutate({ id: draggingId, status: status as BodyshopEntry['status'] });
    }
    setDraggingId(null);
    setDropTarget(null);
  }, [draggingId, allEntries, updateStatus]);

  const handleCardDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  function saveConfig(newCols: KanbanColConfig[], newFields: KanbanFieldConfig[]) {
    setCols(newCols);
    setFieldsCfg(newFields);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cols: newCols, fields: newFields }));
  }

  const freshSelected = selected ? (allEntries.find(e => e.id === selected.id) ?? selected) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap gap-y-2">
        <KanbanSquare className="h-5 w-5 text-orange-500 flex-shrink-0" />
        <h1 className="text-base font-bold text-slate-900">Seguimiento de Ingresos</h1>
        <span className="text-xs bg-orange-100 text-orange-700 font-semibold px-2 py-0.5 rounded-full">
          Chapería
        </span>

        <div className="flex items-center gap-1.5 ml-4 flex-wrap">
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5"
            onClick={() => setRange(getLastMonthRange())}>← Mes ant.</Button>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5"
            onClick={() => setRange(getMonthRange())}>Este mes</Button>
          <input
            type="date" value={range.from}
            onChange={e => setRange(r => ({ ...r, from: e.target.value }))}
            className="text-xs border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <span className="text-slate-400 text-xs">–</span>
          <input
            type="date" value={range.to}
            onChange={e => setRange(r => ({ ...r, to: e.target.value }))}
            className="text-xs border border-slate-200 rounded-lg px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">{filtered.length} ingresos</span>

          <Button
            size="sm"
            variant="outline"
            className={cn('h-7 text-xs gap-1.5', showFilters && 'bg-blue-50 border-blue-200 text-blue-700')}
            onClick={() => setShowFilters(f => !f)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {wtFilter !== 'all' && (
              <span className="h-4 w-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold leading-none">1</span>
            )}
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            onClick={() => setShowSettings(true)}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Config
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      {showFilters && (
        <div className="flex items-center gap-3 px-6 py-2.5 bg-blue-50 border-b border-blue-100 flex-shrink-0 flex-wrap">
          <span className="text-xs font-semibold text-slate-600">Tipo de trabajo:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setWtFilter('all')}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border font-medium transition-all',
                wtFilter === 'all'
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300',
              )}
            >
              Todos
            </button>
            {workTypes.map(wt => (
              <button
                key={wt.id}
                onClick={() => setWtFilter(wt.id)}
                className="text-xs px-2.5 py-1 rounded-full border font-medium transition-all"
                style={
                  wtFilter === wt.id
                    ? { background: wt.color, borderColor: wt.color, color: 'white' }
                    : { background: 'white', borderColor: '#e2e8f0', color: '#475569' }
                }
              >
                {wt.name}
              </button>
            ))}
          </div>
          {wtFilter !== 'all' && (
            <button onClick={() => setWtFilter('all')} className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-red-500">
              <X className="h-3.5 w-3.5" /> Limpiar
            </button>
          )}
        </div>
      )}

      {/* Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex gap-4 h-full min-w-max pb-2">
          {activeCols.map(col => (
            <KanbanColumn
              key={col.status}
              col={col}
              cards={byStatus[col.status] ?? []}
              draggingId={draggingId}
              isDropTarget={dropTarget === col.status}
              fieldsMap={fieldsMap}
              today={today}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onCardDragStart={handleCardDragStart}
              onCardDragEnd={handleCardDragEnd}
              onCardClick={setSelected}
            />
          ))}
        </div>
      </div>

      {/* Modals */}
      {freshSelected && (
        <EntryDetailModal entry={freshSelected} onClose={() => setSelected(null)} />
      )}

      {showSettings && (
        <KanbanSettingsModal
          columns={cols}
          fields={fieldsCfg}
          onSave={saveConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
