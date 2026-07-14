'use client';
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { LOADING_MESSAGES } from '@/lib/loading-messages';

export function MotivationalLoader({ className = 'h-40' }: { className?: string }) {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * LOADING_MESSAGES.length));

  useEffect(() => {
    const id = setInterval(() => setIndex(i => (i + 1) % LOADING_MESSAGES.length), 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`}>
      <Loader2 className="h-6 w-6 text-slate-400 animate-spin" />
      <p className="text-sm text-slate-400 text-center px-4">{LOADING_MESSAGES[index]}</p>
    </div>
  );
}
