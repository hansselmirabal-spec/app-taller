'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { KeyRound, ShieldCheck, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { resetPassword } from '@/lib/api';
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

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token  = params.get('token') ?? '';

  const [next, setNext]       = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) setError('Enlace inválido o incompleto. Solicitá uno nuevo desde "¿Olvidaste tu contraseña?".');
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!token) return;
    if (next.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    if (next !== confirm) { setError('Las contraseñas no coinciden.'); return; }

    setLoading(true);
    try {
      await resetPassword(token, next);
      setSuccess(true);
      setTimeout(() => router.push('/login'), 1800);
    } catch (err: any) {
      setError(err.message || 'No se pudo restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center max-w-sm w-full">
        <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <ShieldCheck className="h-6 w-6 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Contraseña restablecida</h2>
        <p className="text-sm text-slate-500 mt-1">Redirigiendo al login...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center max-w-sm w-full">
        <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="h-6 w-6 text-red-600" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Enlace inválido</h2>
        <p className="text-sm text-slate-500 mt-1">El enlace está incompleto o expiró.</p>
        <Link
          href="/forgot-password"
          className="inline-block mt-6 text-sm font-medium text-slate-900 hover:underline"
        >
          Solicitar nuevo enlace
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
        <div className="flex flex-col items-center mb-6">
          <div className="h-12 w-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
            <KeyRound className="h-6 w-6 text-amber-600" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">Crear nueva contraseña</h1>
          <p className="text-sm text-slate-500 mt-1 text-center">
            Elegí una contraseña segura. La vas a usar para entrar al sistema.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Nueva contraseña</label>
            <PasswordInput value={next} onChange={setNext} placeholder="Mínimo 8 caracteres" autoFocus />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Confirmar contraseña</label>
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
            {loading ? 'Guardando...' : 'Restablecer contraseña'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <Suspense fallback={<div className="text-sm text-slate-400">Cargando...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
