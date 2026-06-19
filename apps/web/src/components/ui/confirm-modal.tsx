'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';

// Modal de confirmación reutilizable. Reemplaza al window.confirm() del navegador
// con una UI consistente con el resto de la app. Soporta texto plano (string)
// o contenido rich (ReactNode) para listas, badges, etc.

export type ConfirmTone = 'danger' | 'warning' | 'info';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  tone?: ConfirmTone;
  onConfirm: () => void;
  onCancel: () => void;
}

const toneConfig: Record<ConfirmTone, { icon: React.ComponentType<any>; iconCls: string; btnCls: string }> = {
  danger:  { icon: AlertOctagon,  iconCls: 'bg-red-100 text-red-600',     btnCls: 'bg-red-600 hover:bg-red-700' },
  warning: { icon: AlertTriangle, iconCls: 'bg-amber-100 text-amber-600', btnCls: 'bg-amber-600 hover:bg-amber-700' },
  info:    { icon: Info,          iconCls: 'bg-indigo-100 text-indigo-600', btnCls: 'bg-indigo-600 hover:bg-indigo-700' },
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmText = 'Confirmar',
  cancelText  = 'Cancelar',
  tone = 'warning',
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  useEffect(() => {
    if (!open) return;
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [open, onCancel]);

  if (!open || typeof document === 'undefined') return null;

  const cfg = toneConfig[tone];
  const Icon = cfg.icon;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 ${cfg.iconCls}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="confirm-title" className="text-sm font-bold text-slate-900">{title}</h2>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex-shrink-0"
            title="Cerrar (ESC)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        {description && (
          <div className="px-5 py-4 text-sm text-slate-700 leading-relaxed max-h-[60vh] overflow-y-auto">
            {description}
          </div>
        )}

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg transition-colors shadow-sm ${cfg.btnCls}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
