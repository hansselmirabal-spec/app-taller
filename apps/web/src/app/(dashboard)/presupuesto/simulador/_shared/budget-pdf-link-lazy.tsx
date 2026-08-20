'use client';

import { FileDown } from 'lucide-react';
import dynamic from 'next/dynamic';

// Shared by create-mode (simulador/page.tsx) and edit-mode
// (simulador/[id]/page.tsx) — both render the same disabled-PDF-button
// fallback while the PDF generator chunk loads.
export const LazyBudgetPdfLink = dynamic(
  () => import('@/components/budget/budget-pdf-link').then(m => m.BudgetPdfLink),
  { ssr: false, loading: () => (
    <button disabled className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-300 text-sm font-semibold cursor-not-allowed">
      <FileDown className="h-4 w-4" /> PDF
    </button>
  )},
);
