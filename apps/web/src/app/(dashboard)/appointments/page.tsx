'use client';
import { Suspense, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import { useRequirePermission } from '@/hooks/use-require-permission';
import { AppointmentSearchModal } from '@/components/ui/appointment-search';
import MechanicAppointmentsPage from './mechanic';
import BodyshopAppointmentsPage from './bodyshop';

function AppointmentsContent() {
  useRequirePermission('appointments');
  const { isBodyshop } = useActiveWorkshop();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {isBodyshop ? <BodyshopAppointmentsPage /> : <MechanicAppointmentsPage />}

      {/* Botón flotante para abrir el buscador. Visible en mecánica y chapería. */}
      <button
        onClick={() => setSearchOpen(true)}
        title="Buscar cliente, chapa o id (Cmd+K)"
        className="fixed bottom-6 right-6 z-[80] flex items-center gap-2 px-4 py-3 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all print:hidden"
      >
        <Search className="h-4 w-4" />
        <span className="text-sm font-medium hidden sm:inline">Buscar cliente</span>
        <kbd className="hidden md:inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20 border border-white/30">⌘K</kbd>
      </button>

      <AppointmentSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}

export default function AppointmentsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400">Cargando...</div>}>
      <AppointmentsContent />
    </Suspense>
  );
}
