'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, CalendarDays, ClipboardList, BookOpen,
  Settings, LogOut, ChevronRight, ChevronDown,
  Users, Wrench, CalendarOff, BarChart3, Building2, KanbanSquare, ShieldCheck, Layers, FileSearch,
  FileText, Package,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { clearAuth, getStoredUser, getEffectivePermissions } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { WorkshopSwitcher } from './workshop-switcher';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import type { ModuleId } from '@/types';

const NAV_MAIN: Array<{ href: string; label: string; icon: any; module: ModuleId | null; requireEdit?: boolean; bodyshopOnly?: boolean; mechanicOnly?: boolean }> = [
  { href: '/dashboard',    label: 'Panel de Control',        icon: LayoutDashboard, module: 'dashboard'    },
  { href: '/capacity',     label: 'Calendario de Capacidad', icon: CalendarDays,    module: 'capacity'     },
  { href: '/calendario',   label: 'Calendario',              icon: CalendarDays,    module: 'appointments', mechanicOnly: true },
  { href: '/appointments', label: 'Agenda',                  icon: ClipboardList,   module: 'appointments', bodyshopOnly: true },
  { href: '/presupuesto',  label: 'Presupuestos',            icon: FileText,        module: 'presupuesto',  bodyshopOnly: true },
  { href: '/recursos',     label: 'Recursos',                icon: Package,         module: null,           bodyshopOnly: true },
  { href: '/porteria',     label: 'Reportería',              icon: BarChart3,       module: 'reports'      },
  { href: '/kanban',       label: 'Kanban Operativo',        icon: KanbanSquare,    module: 'kanban'       },
  { href: '/seguimiento',  label: 'Seguimiento OTs',         icon: FileSearch,      module: null           },
  { href: '/documentacion', label: 'Documentación',          icon: BookOpen,        module: null           },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const inSettings = pathname.startsWith('/settings');
  const [settingsOpen, setSettingsOpen] = useState(inSettings);
  const { isBodyshop } = useActiveWorkshop();

  useEffect(() => { setMounted(true); }, []);

  const user = mounted ? getStoredUser() : null;
  if (!mounted || !user) return <div style={{ width: 'var(--sidebar-width)', minWidth: 'var(--sidebar-width)' }} />;

  const permissions = mounted ? getEffectivePermissions() : null;
  const isUserAdmin = user.role === 'admin';

  const navMain = NAV_MAIN.filter(item => {
    if (item.bodyshopOnly && !isBodyshop) return false;
    if (item.mechanicOnly && isBodyshop) return false;
    if (!item.module || !permissions) return true;
    if (item.requireEdit) return can(permissions, item.module, 'edit');
    return can(permissions, item.module, 'view');
  });

  const canSeeSettings = isUserAdmin || (permissions ? can(permissions, 'settings', 'view') : false);

  const navSettings = [
    { href: '/settings/technicians',   label: 'Técnicos',                                      icon: Users      },
    { href: '/settings/service-types', label: isBodyshop ? 'Tipos de Trabajo' : 'Tipos de Servicio', icon: Wrench },
    { href: '/settings/calendar',      label: 'Calendario',                                    icon: CalendarOff },
    { href: '/settings/workshops',     label: 'Talleres',                                      icon: Building2  },
    ...(isBodyshop ? [
      { href: '/settings/catalog', label: 'Catálogo Chapería', icon: Layers },
    ] : []),
    ...(isUserAdmin ? [
      { href: '/settings/users',  label: 'Usuarios y Permisos', icon: ShieldCheck },
      { href: '/settings/roles',  label: 'Roles',               icon: ShieldCheck },
    ] : []),
  ];

  async function handleLogout() {
    await clearAuth();
    router.push('/login');
  }

  function isActive(href: string) {
    if (href === '/appointments/new') return pathname === href;
    if (href === '/appointments') return pathname === '/appointments' || (pathname.startsWith('/appointments') && pathname !== '/appointments/new');
    return pathname.startsWith(href);
  }

  return (
    <aside className="flex h-screen flex-col bg-white border-r border-slate-200" style={{ width: 'var(--sidebar-width)', minWidth: 'var(--sidebar-width)' }}>
      {/* Workshop switcher */}
      <div className="px-3 pt-3 pb-2 border-b border-slate-100 flex-shrink-0">
        <WorkshopSwitcher />
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navMain.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-100',
                active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon className={cn('h-4 w-4 flex-shrink-0', active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600')} />
              <span className="flex-1 leading-none">{label}</span>
              {active && <ChevronRight className="h-3 w-3 text-blue-400" />}
            </Link>
          );
        })}

        {/* Configuraciones */}
        {canSeeSettings && <div className="pt-2">
          <button
            onClick={() => setSettingsOpen(o => !o)}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-100',
              inSettings ? 'text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
          >
            <Settings className={cn('h-4 w-4 flex-shrink-0', inSettings ? 'text-blue-600' : 'text-slate-400')} />
            <span className="flex-1 leading-none text-left">Configuraciones</span>
            {settingsOpen
              ? <ChevronDown className="h-3 w-3 text-slate-400" />
              : <ChevronRight className="h-3 w-3 text-slate-400" />
            }
          </button>

          {settingsOpen && (
            <div className="mt-0.5 ml-3 pl-4 border-l border-slate-200 space-y-0.5">
              {navSettings.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all',
                      active ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', active ? 'text-blue-500' : 'text-slate-400')} />
                    {label}
                  </Link>
                );
              })}
            </div>
          )}
        </div>}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="h-7 w-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">{user.name.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{user.name}</p>
            <p className="text-xs text-slate-400">
              {user.role === 'admin' ? 'Administrador' : user.role === 'perito' ? 'Perito' : 'Recepcion'}
            </p>
          </div>
          <button onClick={handleLogout} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Cerrar sesion">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}
