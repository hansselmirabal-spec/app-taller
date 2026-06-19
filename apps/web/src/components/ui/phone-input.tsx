'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Country {
  code: string;
  iso: string;
  name: string;
  flag: string;
}

const LATAM_COUNTRIES: Country[] = [
  { code: '+54',  iso: 'AR', name: 'Argentina',       flag: '🇦🇷' },
  { code: '+591', iso: 'BO', name: 'Bolivia',         flag: '🇧🇴' },
  { code: '+55',  iso: 'BR', name: 'Brasil',          flag: '🇧🇷' },
  { code: '+56',  iso: 'CL', name: 'Chile',           flag: '🇨🇱' },
  { code: '+57',  iso: 'CO', name: 'Colombia',        flag: '🇨🇴' },
  { code: '+506', iso: 'CR', name: 'Costa Rica',      flag: '🇨🇷' },
  { code: '+53',  iso: 'CU', name: 'Cuba',            flag: '🇨🇺' },
  { code: '+1',   iso: 'DO', name: 'Rep. Dominicana', flag: '🇩🇴' },
  { code: '+593', iso: 'EC', name: 'Ecuador',         flag: '🇪🇨' },
  { code: '+503', iso: 'SV', name: 'El Salvador',     flag: '🇸🇻' },
  { code: '+502', iso: 'GT', name: 'Guatemala',       flag: '🇬🇹' },
  { code: '+509', iso: 'HT', name: 'Haiti',           flag: '🇭🇹' },
  { code: '+504', iso: 'HN', name: 'Honduras',        flag: '🇭🇳' },
  { code: '+52',  iso: 'MX', name: 'México',          flag: '🇲🇽' },
  { code: '+505', iso: 'NI', name: 'Nicaragua',       flag: '🇳🇮' },
  { code: '+507', iso: 'PA', name: 'Panamá',          flag: '🇵🇦' },
  { code: '+595', iso: 'PY', name: 'Paraguay',        flag: '🇵🇾' },
  { code: '+51',  iso: 'PE', name: 'Perú',            flag: '🇵🇪' },
  { code: '+1',   iso: 'PR', name: 'Puerto Rico',     flag: '🇵🇷' },
  { code: '+598', iso: 'UY', name: 'Uruguay',         flag: '🇺🇾' },
  { code: '+58',  iso: 'VE', name: 'Venezuela',       flag: '🇻🇪' },
];

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function PhoneInput({ value, onChange, className }: PhoneInputProps) {
  const [selected, setSelected] = useState<Country>(
    LATAM_COUNTRIES.find(c => c.iso === 'PY') ?? LATAM_COUNTRIES[0]
  );
  const [number, setNumber] = useState('');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setMounted(true); }, []);

  // Inicializar desde value externo (solo la primera vez)
  useEffect(() => {
    if (!value) return;
    const sorted = [...LATAM_COUNTRIES].sort((a, b) => b.code.length - a.code.length);
    for (const c of sorted) {
      if (value.startsWith(c.code)) {
        setSelected(c);
        setNumber(value.slice(c.code.length).trim());
        return;
      }
    }
    setNumber(value);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Emitir hacia afuera
  useEffect(() => {
    onChange(number.trim() ? `${selected.code} ${number.trim()}` : '');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, number]);

  // Calcular posición del dropdown basada en el botón trigger
  const openDropdown = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      width: 224,
      zIndex: 9999,
    });
    setOpen(true);
  }, []);

  // Cerrar al click fuera (sobre el portal)
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      // Si el click es en el trigger, el toggle lo maneja
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
      setSearch('');
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  // Focus en search al abrir
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open]);

  const filtered = LATAM_COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.includes(search) ||
    c.iso.toLowerCase().includes(search.toLowerCase())
  );

  function select(c: Country) {
    setSelected(c);
    setOpen(false);
    setSearch('');
  }

  const dropdown = mounted && open ? createPortal(
    <div
      style={dropdownStyle}
      className="bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden"
    >
      <div className="px-2 py-2 border-b border-slate-100">
        <input
          ref={searchRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar país..."
          className="w-full text-xs px-2 py-1.5 rounded border border-slate-200 outline-none focus:border-blue-400"
          onKeyDown={e => e.key === 'Escape' && setOpen(false)}
        />
      </div>
      <div className="max-h-52 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-3 text-xs text-slate-400 text-center">Sin resultados</p>
        ) : filtered.map(c => (
          <button
            key={c.iso}
            type="button"
            onMouseDown={e => { e.preventDefault(); select(c); }}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors',
              selected.iso === c.iso && 'bg-blue-50'
            )}
          >
            <span className="text-base leading-none w-5 text-center">{c.flag}</span>
            <span className={cn(
              'flex-1 text-xs truncate',
              selected.iso === c.iso ? 'font-semibold text-blue-700' : 'text-slate-700'
            )}>
              {c.name}
            </span>
            <span className="text-xs text-slate-400 tabular-nums flex-shrink-0">{c.code}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <div className={cn(
        'flex rounded-lg border border-slate-200 bg-white focus-within:ring-1 focus-within:ring-blue-400 focus-within:border-blue-400 transition-shadow',
        className
      )}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => open ? (setOpen(false), setSearch('')) : openDropdown()}
          className="flex items-center gap-1.5 px-3 py-2 border-r border-slate-200 hover:bg-slate-50 transition-colors rounded-l-lg flex-shrink-0"
        >
          <span className="text-base leading-none">{selected.flag}</span>
          <span className="text-xs font-semibold text-slate-600 tabular-nums">{selected.code}</span>
          <ChevronDown className={cn('h-3 w-3 text-slate-400 transition-transform', open && 'rotate-180')} />
        </button>

        <input
          type="tel"
          value={number}
          onChange={e => setNumber(e.target.value.replace(/[^\d\s\-().]/g, ''))}
          placeholder="11 0000-0000"
          className="flex-1 px-3 py-2 text-sm bg-transparent outline-none placeholder:text-slate-400 min-w-0 rounded-r-lg"
        />
      </div>

      {dropdown}
    </>
  );
}
