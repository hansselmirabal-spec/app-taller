'use client';
import { useState, useMemo, useCallback } from 'react';
import { KanbanSquare, Filter, X, Settings2, Clock, CalendarDays, User } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAppointmentsKanban, useKanbanUpdateAppointmentStatus } from '@/hooks/use-appointments';
import { useTechnicians } from '@/hooks/use-technicians';
import { ActivitiesPanel } from '@/components/kanban/activities-panel';
import {
  KanbanSettingsModal,
  type KanbanColConfig,
  type KanbanFieldConfig,
} from '@/components/kanban/settings-modal';
import { statusLabel, statusColor } from '@/lib/utils';
import { isAdmin } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { Appointment } from '@/types';

// ─── Config defaults ──────────────────────────────────────────────────────────

const DEFAULT_COLS: KanbanColConfig[] = [
  { status: 'scheduled',   label: 'Pendiente',  color: '#94a3b8', enabled: true },
  { status: 'in_progress', label: 'En proceso', color: '#f97316', enabled: true },
  { status: 'done',        label: 'Terminado',  color: '#22c55e', enabled: true },
  { status: 'cancelled',   label: 'Cancelado',  color: '#ef4444', enabled: true },
];

const DEFAULT_FIELDS: KanbanFieldConfig[] = [
  { id: 'service', label: 'Servicio',  visible: true },
  { id: 'tech',    label: 'Técnico',   visible: true },
  { id: 'time',    label: 'Horario',   visible: true },
  { id: 'date',    label: 'Fecha',     visible: true },
  { id: 'notes',   label: 'Indicador de notas', visible: true },
];

const STORAGE_KEY        = 'mechanic_kanban_config_v1';
const CUSTOM_STATUS_KEY  = 'mechanic_kanban_custom_status_v1';

function loadCustomStatuses(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try { return JSON.parse(localStorage.getItem(CUSTOM_STATUS_KEY) || '{}'); }
  catch { return {}; }
}

function saveCustomStatuses(map: Record<string, string>) {
  localStorage.setItem(CUSTOM_STATUS_KEY, JSON.stringify(map));
}

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

// ─── Date helpers ─────────────────────────────────────────────────────────────

function getWeekRange(offsetWeeks = 0): { from: string; to: string } {
  const today = new Date();
  const day = today.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(today);
  mon.setDate(today.getDate() + diffToMon + offsetWeeks * 7);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { from: fmt(mon), to: fmt(sun) };
}

function getMonthRange(): { from: string; to: string } {
  const t = new Date();
  return {
    from: new Date(t.getFullYear(), t.getMonth(), 1).toISOString().split('T')[0],
    to:   new Date(t.getFullYear(), t.getMonth() + 1, 0).toISOString().split('T')[0],
  };
}

function fmtDate(d: string) {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}

// ─── Card detail modal (2 columnas: info + actividades) ──────────────────────

const STATUS_FLOW: Record<string, { label: string; next: Appointment['status'] } | null> = {
  scheduled:   { label: 'Marcar en proceso', next: 'in_progress' },
  in_progress: { label: 'Marcar terminado',  next: 'done'        },
  done:        null,
  cancelled:   null,
};

function MechanicCardModal({
  appt,
  onClose,
  technicianNames,
}: {
  appt: Appointment;
  onClose: () => void;
  technicianNames: string[];
}) {
  const updateStatus = useKanbanUpdateAppointmentStatus();
  const admin        = isAdmin();

  function handleStatus(status: string) {
    updateStatus.mutate({ id: appt.id, status });
    onClose();
  }

  const flow = STATUS_FLOW[appt.status];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-slate-100 flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            {appt.customerName}
            <span className="font-mono text-slate-400 text-sm font-normal">{appt.plate}</span>
            <Badge className={`ml-auto ${statusColor(appt.status)}`}>{statusLabel(appt.status)}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-1 min-h-0">
          {/* ── Left: info ────────────────────────────────────────────── */}
          <div className="flex flex-col w-[55%] border-r border-slate-100 px-6 py-4 overflow-y-auto">
            {/* Service color bar */}
            <div
              className="h-1 w-full rounded-full mb-4"
              style={{ background: appt.serviceType.color }}
            />

            <div className="space-y-3 text-sm flex-1">
              {[
                { label: 'Servicio', val: appt.serviceType.name, color: appt.serviceType.color },
                { label: 'Técnico',  val: appt.technician.name },
                { label: 'Fecha',    val: appt.date },
                { label: 'Horario',  val: `${appt.timeStart} – ${appt.timeEnd}` },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between gap-3">
                  <span className="text-slate-500 flex-shrink-0">{r.label}</span>
                  {r.color ? (
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: r.color + '22', color: r.color }}
                    >
                      {r.val}
                    </span>
                  ) : (
                    <span className="text-slate-900 font-medium text-right">{r.val}</span>
                  )}
                </div>
              ))}

              {appt.serviceType.durationHours && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Duración</span>
                  <span className="text-slate-900 font-medium flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {appt.serviceType.durationHours}h
                  </span>
                </div>
              )}

              {appt.notes && (
                <div className="bg-slate-50 rounded-xl border border-slate-200 px-3 py-2.5 mt-2">
                  <p className="text-xs font-semibold text-slate-500 mb-1">Notas</p>
                  <p className="text-sm text-slate-700">{appt.notes}</p>
                </div>
              )}
            </div>

            {/* Status actions */}
            {admin && (
              <div className="flex flex-col gap-2 pt-4 mt-4 border-t border-slate-100">
                {flow && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleStatus(flow.next)}
                    disabled={updateStatus.isPending}
                  >
                    {flow.label}
                  </Button>
                )}
                {(appt.status === 'scheduled' || appt.status === 'in_progress') && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => { if (confirm('¿Cancelar este turno?')) handleStatus('cancelled'); }}
                    disabled={updateStatus.isPending}
                  >
                    Cancelar turno
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* ── Right: activities ────────────────────────────────────── */}
          <div className="flex flex-col flex-1 px-5 py-4 min-h-0 bg-slate-50/50">
            <ActivitiesPanel cardId={appt.id} users={technicianNames} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function AppointmentCard({
  appt,
  dragging,
  fields,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  appt: Appointment;
  dragging: boolean;
  fields: Record<string, boolean>;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        'bg-white rounded-xl border border-slate-200 p-3 cursor-grab select-none',
        'shadow-sm hover:shadow-md hover:border-slate-300 transition-all duration-150',
        dragging && 'opacity-40 scale-95 shadow-lg',
      )}
    >
      {/* Barra de color del servicio */}
      <div
        className="h-0.5 w-full rounded-full mb-2.5"
        style={{ background: appt.serviceType.color, opacity: 0.7 }}
      />

      {/* Cliente + patente */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div>
          <p className="font-semibold text-slate-900 text-sm leading-tight">{appt.customerName}</p>
          <p className="text-xs text-slate-400 font-mono mt-0.5">{appt.plate}</p>
        </div>
        {fields.service && (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: appt.serviceType.color + '22', color: appt.serviceType.color }}
          >
            {appt.serviceType.name}
          </span>
        )}
      </div>

      {/* Metadata */}
      {(fields.tech || fields.time || fields.date || fields.notes) && (
        <div className="flex items-center gap-2.5 text-xs text-slate-500 flex-wrap mt-1.5">
          {fields.tech && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              {appt.technician.name.split(' ')[0]}
            </span>
          )}
          {fields.time && <span>{appt.timeStart}</span>}
          {fields.date && <span className="font-mono text-slate-400">{fmtDate(appt.date)}</span>}
          {fields.notes && appt.notes && (
            <span className="ml-auto text-slate-300" title={appt.notes}>💬</span>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function KanbanColumn({
  col,
  cards,
  draggingId,
  isDropTarget,
  fieldsMap,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardClick,
}: {
  col: KanbanColConfig;
  cards: Appointment[];
  draggingId: string | null;
  isDropTarget: boolean;
  fieldsMap: Record<string, boolean>;
  onDragOver: (e: React.DragEvent, status: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, status: string) => void;
  onCardDragStart: (e: React.DragEvent, id: string) => void;
  onCardDragEnd: () => void;
  onCardClick: (appt: Appointment) => void;
}) {
  return (
    <div className="flex flex-col min-w-[260px] w-[260px]">
      {/* Header */}
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

      {/* Drop zone */}
      <div
        onDragOver={e => onDragOver(e, col.status)}
        onDragLeave={e => onDragLeave(e)}
        onDrop={e => onDrop(e, col.status)}
        className={cn(
          'flex-1 rounded-xl p-2 space-y-2 min-h-[120px] transition-all duration-150 border',
          isDropTarget ? 'scale-[1.01]' : '',
        )}
        style={{
          background: isDropTarget ? col.color + '14' : col.color + '08',
          borderColor: isDropTarget ? col.color : '#e2e8f0',
          outline: isDropTarget ? `2px solid ${col.color}40` : 'none',
          outlineOffset: isDropTarget ? 2 : 0,
        }}
      >
        {cards.map(appt => (
          <AppointmentCard
            key={appt.id}
            appt={appt}
            dragging={draggingId === appt.id}
            fields={fieldsMap}
            onDragStart={e => onCardDragStart(e, appt.id)}
            onDragEnd={onCardDragEnd}
            onClick={() => onCardClick(appt)}
          />
        ))}
        {cards.length === 0 && (
          <div className="flex items-center justify-center h-16 text-xs text-slate-300 italic">
            Sin turnos
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MechanicKanban() {
  const stored                        = useMemo(() => loadConfig(), []);
  const [cols, setCols]               = useState<KanbanColConfig[]>(stored.cols);
  const [fieldsCfg, setFieldsCfg]     = useState<KanbanFieldConfig[]>(stored.fields);
  const [range, setRange]             = useState(getWeekRange(0));
  const [techFilter, setTechFilter]   = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [draggingId, setDraggingId]   = useState<string | null>(null);
  const [dropTarget, setDropTarget]   = useState<string | null>(null);
  const [selected, setSelected]       = useState<Appointment | null>(null);
  const [customStatuses, setCustomStatuses] = useState<Record<string, string>>(() => loadCustomStatuses());

  const { data: allAppts = [] }   = useAppointmentsKanban(range.from, range.to);
  const { data: technicians = [] } = useTechnicians();
  const updateStatus               = useKanbanUpdateAppointmentStatus();

  const fieldsMap = useMemo(
    () => Object.fromEntries(fieldsCfg.map(f => [f.id, f.visible])),
    [fieldsCfg],
  );

  const activeCols = useMemo(() => cols.filter(c => c.enabled), [cols]);

  const filtered = useMemo(() =>
    techFilter === 'all' ? allAppts : allAppts.filter(a => a.technicianId === techFilter),
    [allAppts, techFilter],
  );

  const activeColSet = useMemo(() => new Set(activeCols.map(c => c.status)), [activeCols]);

  const byStatus = useMemo(() => {
    const map: Record<string, Appointment[]> = {};
    for (const a of filtered) {
      const custom = customStatuses[a.id];
      const effectiveStatus = (custom && activeColSet.has(custom)) ? custom : a.status;
      (map[effectiveStatus] ??= []).push(a);
    }
    return map;
  }, [filtered, customStatuses, activeColSet]);

  // ── DnD ── fix: use draggingId from state, NOT dataTransfer ──────────────
  const handleCardDragStart = useCallback((e: React.DragEvent, id: string) => {
    // setData as fallback for native drag image
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggingId(id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(status);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Element)) return;
    setDropTarget(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, status: string) => {
    e.preventDefault();
    if (!draggingId) { setDropTarget(null); return; }

    const targetCol = activeCols.find(c => c.status === status);
    const isCustomCol = targetCol?.custom === true;

    if (isCustomCol) {
      // Custom columns are frontend-only — persist in localStorage
      setCustomStatuses(prev => {
        const next = { ...prev, [draggingId]: status };
        saveCustomStatuses(next);
        return next;
      });
    } else {
      // Standard column — call API and clear any previous custom assignment
      const appt = allAppts.find(a => a.id === draggingId);
      if (appt) {
        updateStatus.mutate({ id: draggingId, status });
      }
      setCustomStatuses(prev => {
        if (!prev[draggingId]) return prev;
        const next = { ...prev };
        delete next[draggingId];
        saveCustomStatuses(next);
        return next;
      });
    }

    setDraggingId(null);
    setDropTarget(null);
  }, [draggingId, allAppts, activeCols, updateStatus]);

  const handleCardDragEnd = useCallback(() => {
    setDraggingId(null);
    setDropTarget(null);
  }, []);

  function saveConfig(newCols: KanbanColConfig[], newFields: KanbanFieldConfig[]) {
    setCols(newCols);
    setFieldsCfg(newFields);
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cols: newCols, fields: newFields }));
  }

  const activeTech = technicians.find(t => t.id === techFilter);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0 flex-wrap gap-y-2">
        <KanbanSquare className="h-5 w-5 text-blue-600 flex-shrink-0" />
        <h1 className="text-base font-bold text-slate-900">Seguimiento de Turnos</h1>

        <div className="flex items-center gap-1.5 ml-4 flex-wrap">
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5"
            onClick={() => setRange(getWeekRange(-1))}>← Semana ant.</Button>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5"
            onClick={() => setRange(getWeekRange(0))}>Esta semana</Button>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5"
            onClick={() => setRange(getWeekRange(1))}>Próx. semana →</Button>
          <Button size="sm" variant="outline" className="text-xs h-7 px-2.5"
            onClick={() => setRange(getMonthRange())}>Este mes</Button>
        </div>

        <span className="text-xs text-slate-400 font-mono">
          {fmtDate(range.from)} – {fmtDate(range.to)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">{filtered.length} turnos</span>

          <Button
            size="sm"
            variant="outline"
            className={cn('h-7 text-xs gap-1.5', showFilters && 'bg-blue-50 border-blue-200 text-blue-700')}
            onClick={() => setShowFilters(f => !f)}
          >
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {techFilter !== 'all' && (
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
          <span className="text-xs font-semibold text-slate-600">Técnico:</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {[{ id: 'all', name: 'Todos' }, ...technicians.map(t => ({ id: t.id, name: t.name.split(' ')[0] }))].map(opt => (
              <button
                key={opt.id}
                onClick={() => setTechFilter(opt.id)}
                className={cn(
                  'text-xs px-2.5 py-1 rounded-full border font-medium transition-all',
                  techFilter === opt.id
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300',
                )}
              >
                {opt.name}
              </button>
            ))}
          </div>
          {techFilter !== 'all' && (
            <button onClick={() => setTechFilter('all')} className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-red-500">
              <X className="h-3.5 w-3.5" /> Limpiar
            </button>
          )}
        </div>
      )}

      {/* Active filter chip */}
      {techFilter !== 'all' && !showFilters && activeTech && (
        <div className="flex items-center gap-2 px-6 py-2 bg-white border-b border-slate-100 flex-shrink-0">
          <span className="text-xs text-slate-500">Técnico:</span>
          <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            {activeTech.name}
            <button onClick={() => setTechFilter('all')} className="hover:text-blue-900 ml-0.5">
              <X className="h-3 w-3" />
            </button>
          </span>
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
      {selected && (
        <MechanicCardModal
          appt={selected}
          onClose={() => setSelected(null)}
          technicianNames={technicians.map(t => t.name)}
        />
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
