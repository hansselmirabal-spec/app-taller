'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { changePassword } from '@/lib/api';
import { mustChangePassword, getStoredUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function PasswordInput({ value, onChange, placeholder, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        tabIndex={-1}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) { router.replace('/login'); return; }
    if (!mustChangePassword()) router.replace('/appointments');
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (next.length < 8) { setError('La nueva contraseña debe tener al menos 8 caracteres.'); return; }
    if (next !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    if (current === next) { setError('La nueva contraseña debe ser diferente a la actual.'); return; }

    setLoading(true);
    try {
      await changePassword(current, next);
      setSuccess(true);
      setTimeout(() => router.push('/appointments'), 1800);
    } catch (err: any) {
      setError(err.message || 'Error al cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center max-w-sm w-full">
          <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="h-6 w-6 text-green-600" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Contraseña actualizada</h2>
          <p className="text-sm text-slate-500 mt-1">Redirigiendo al sistema...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">

          <div className="flex flex-col items-center mb-6">
            <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
              <KeyRound className="h-6 w-6 text-amber-600" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Cambiar contraseña</h1>
            <p className="text-sm text-slate-500 mt-1 text-center">
              Por seguridad, debés cambiar tu contraseña antes de continuar.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Contraseña actual (temporal)</label>
              <PasswordInput value={current} onChange={setCurrent} placeholder="La contraseña que recibiste" autoFocus />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Nueva contraseña</label>
              <PasswordInput value={next} onChange={setNext} placeholder="Mínimo 8 caracteres" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Confirmar nueva contraseña</label>
              <PasswordInput value={confirm} onChange={setConfirm} placeholder="Repetí la nueva contraseña" />
            </div>

            {next.length > 0 && (
              <ul className="text-xs space-y-0.5">
                <li className={next.length >= 8 ? 'text-green-600' : 'text-slate-400'}>
                  {next.length >= 8 ? '✓' : '○'} Al menos 8 caracteres
                </li>
                <li className={/[A-Z]/.test(next) ? 'text-green-600' : 'text-slate-400'}>
                  {/[A-Z]/.test(next) ? '✓' : '○'} Una mayúscula
                </li>
                <li className={/\d/.test(next) ? 'text-green-600' : 'text-slate-400'}>
                  {/\d/.test(next) ? '✓' : '○'} Un número
                </li>
              </ul>
            )}

            {error && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Guardando...' : 'Establecer nueva contraseña'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
