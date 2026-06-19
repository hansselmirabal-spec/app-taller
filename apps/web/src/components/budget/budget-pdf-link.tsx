'use client';

import { useState, useEffect } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { BudgetPdfDocument } from './budget-pdf';
import { FileDown, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { SimulatorEstimateResult } from '@/lib/api';

interface Props {
  plate:         string;
  customerName:  string;
  phone?:        string;
  budgetNumber?: string;
  notes?:        string;
  estimate:      SimulatorEstimateResult;
}

export function BudgetPdfLink({ plate, customerName, phone, budgetNumber, notes, estimate }: Props) {
  // Fecha inicializada en el cliente para evitar hydration mismatch
  const [today, setToday] = useState('');
  useEffect(() => { setToday(formatDate(new Date())); }, []);

  // No renderizar hasta que el cliente inicialice la fecha
  if (!today) return null;

  return (
    <PDFDownloadLink
      document={
        <BudgetPdfDocument
          plate={plate}
          customerName={customerName}
          phone={phone}
          budgetNumber={budgetNumber}
          notes={notes}
          estimate={estimate}
          date={today}
        />
      }
      fileName={`presupuesto-${plate || 'sin-patente'}-${today}.pdf`}
      className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
    >
      {({ loading }: { loading: boolean }) =>
        loading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <><FileDown className="h-4 w-4" /> PDF</>
      }
    </PDFDownloadLink>
  );
}
