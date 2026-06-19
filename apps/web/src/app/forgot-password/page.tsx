'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { forgotPassword } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err: any) {
      setError(err.message || 'No se pudo procesar la solicitud.');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <MailCheck className="h-6 w-6 text-green-600" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Revisá tu correo</h1>
            <p className="text-sm text-slate-500 mt-2">
              Si <strong>{email}</strong> está registrado, te enviamos un enlace para restablecer tu contraseña.
              El enlace expira en 1 hora.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mt-6 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Volver al login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
          <div className="flex flex-col items-center mb-6">
            <div className="h-12 w-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center mb-4">
              <Mail className="h-6 w-6 text-slate-700" />
            </div>
            <h1 className="text-lg font-semibold text-slate-900">Restablecer contraseña</h1>
            <p className="text-sm text-slate-500 mt-1 text-center">
              Ingresá el email asociado a tu cuenta y te enviamos un enlace.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Email</label>
              <Input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="tu@email.com"
              />
            </div>

            {error && (
              <p className="text-sm text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Enviando...' : 'Enviar enlace'}
            </Button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> Volver al login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
