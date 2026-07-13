'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { MODULE_HELP, type HelpKey } from '@/lib/module-help';

export function InfoButton({ helpKey }: { helpKey: HelpKey }) {
  const [open, setOpen] = useState(false);
  const help = MODULE_HELP[helpKey];
  if (!help) return null;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={`Información sobre ${help.title}`}
        aria-expanded={open}
        className="flex items-center justify-center h-5 w-5 rounded-full border border-slate-300 text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors"
      >
        <Info className="h-3 w-3" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-2 z-50 w-72 bg-white rounded-xl border border-slate-200 shadow-lg p-4 space-y-2.5">
            <p className="text-sm font-bold text-slate-900">{help.title}</p>
            <ul className="space-y-1.5">
              {help.points.map(point => (
                <li key={point} className="text-xs text-slate-600 leading-relaxed pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-indigo-400">
                  {point}
                </li>
              ))}
            </ul>
            <Link
              href="/documentacion"
              onClick={() => setOpen(false)}
              className="block text-xs font-semibold text-indigo-600 hover:text-indigo-700 pt-1"
            >
              Ver documentación completa →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
