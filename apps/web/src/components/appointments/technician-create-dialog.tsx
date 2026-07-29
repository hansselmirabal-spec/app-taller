'use client';
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTechnicians, useCreateTechnician } from '@/hooks/use-technicians';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import type { Technician } from '@/types';

// Procesos del bodyshop (Chapería / Preparación / Pintura).
const BODYSHOP_SPECIALTIES: { value: string; label: string }[] = [
  { value: 'CHAPERIA',      label: 'Chapería' },
  { value: 'PREPARACION',   label: 'Preparación' },
  { value: 'PINTURA',       label: 'Pintura' },
  { value: 'POLISH',        label: 'Pulido' },
  { value: 'FINAL_CONTROL', label: 'Control Final' },
];

// Roles predefinidos para talleres de mecánica.
const MECHANIC_ROLES: { value: string; label: string }[] = [
  { value: 'ASESOR', label: 'Asesor de Recepción' },
];

const OTHER_ROLE = '__other__';
const NO_BOX     = '__none__';
const NO_SP      = '__nosp__';

export function TechnicianCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (technician: Technician) => void;
}) {
  const { isBodyshop } = useActiveWorkshop();
  const { data: technicians = [] } = useTechnicians();
  const create = useCreateTechnician();

  const [name,       setName]       = useState('');
  const [hours,      setHours]      = useState('8');
  const [roleSelect, setRoleSelect] = useState('');
  const [specialty,  setSpecialty]  = useState('');
  const [box,        setBox]        = useState('');

  const allBoxes = useMemo(() => {
    const set = new Set<string>();
    technicians.forEach(t => { if (t.box) set.add(t.box); });
    return Array.from(set).sort();
  }, [technicians]);

  const effectiveSpecialty = roleSelect && roleSelect !== OTHER_ROLE ? roleSelect : specialty;

  function reset() {
    setName(''); setHours('8'); setRoleSelect(''); setSpecialty(''); setBox('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const created = await create.mutateAsync({
      name: name.trim(),
      dailyHours: parseFloat(hours) || 8,
      specialty: effectiveSpecialty || null,
      box: box || null,
    });
    reset();
    onOpenChange(false);
    onCreated?.(created);
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nuevo técnico</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Nombre</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre completo" required autoFocus />
          </div>
          <div className="flex gap-3">
            <div className="w-24 space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Hs/día</label>
              <Input type="number" value={hours} onChange={e => setHours(e.target.value)} min="1" max="12" step="0.5" />
            </div>
            <div className="flex-1 space-y-1.5">
              <label className="text-xs font-medium text-slate-700">{isBodyshop ? 'Proceso' : 'Rol'}</label>
              <Select value={roleSelect || NO_SP} onValueChange={v => setRoleSelect(v === NO_SP ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SP}>Sin rol</SelectItem>
                  {MECHANIC_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                  {isBodyshop && BODYSHOP_SPECIALTIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  <SelectItem value={OTHER_ROLE}>Otro (texto libre)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {roleSelect === OTHER_ROLE && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Especialidad (texto libre)</label>
              <Input value={specialty} onChange={e => setSpecialty(e.target.value)} placeholder="Ej: Motor, Caja, Electricidad" autoFocus />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-700">Bahía</label>
            <Select value={box || NO_BOX} onValueChange={v => setBox(v === NO_BOX ? '' : v)}>
              <SelectTrigger><SelectValue placeholder="Sin bahía" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_BOX}>Sin bahía</SelectItem>
                {allBoxes.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" size="sm" disabled={create.isPending}>Guardar</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
