'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench } from 'lucide-react';
import { login } from '@/lib/api';
import { storeAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('admin@taller.com');
  const [password, setPassword] = useState('admin1234');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { access_token, user } = await login(email, password);
      storeAuth(access_token, user);
      router.push('/appointments');
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

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Contrasena</label>
              <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            {error && <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </form>

          <div className="mt-6 p-3 bg-slate-50 rounded-md border border-slate-200">
            <p className="text-xs text-slate-500 font-medium mb-1">Cuentas de prueba</p>
            <p className="text-xs text-slate-600">admin@taller.com / admin1234</p>
            <p className="text-xs text-slate-600">recepcion@taller.com / recep1234</p>
          </div>
        </div>
      </div>
    </div>
  );
}
