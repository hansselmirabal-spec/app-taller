'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Wrench, Eye, EyeOff } from 'lucide-react';
import { login } from '@/lib/api';
import { storeAuth, mustChangePassword } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const expired = params.get('expired') === '1';

  useEffect(() => {
    localStorage.removeItem('user');
    localStorage.removeItem('permissions');
    localStorage.removeItem('activeWorkshopId');
  }, []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // El backend setea cookie httpOnly auth_token automáticamente; storeAuth
      // solo persiste el perfil para que la UI lo use sin re-fetch.
      const { user } = await login(email, password);
      storeAuth(user);
      router.push(mustChangePassword() ? '/change-password' : '/dashboard');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <div className="flex flex-col items-center mb-8">
            <div className="h-12 w-12 rounded-xl bg-slate-900 flex items-center justify-center mb-4">
              <Wrench className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-semibold text-slate-900">App Taller</h1>
            <p className="text-sm text-slate-500 mt-1">Gestion de turnos y capacidad</p>
          </div>

          {expired && (
            <div className="mb-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
              Tu sesion expiro. Ingresa nuevamente.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Contraseña</label>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  tabIndex={-1}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 rounded transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>

            <div className="text-center pt-2">
              <Link
                href="/forgot-password"
                className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
          </form>

        </div>
      </div>
    </div>
  );
}
