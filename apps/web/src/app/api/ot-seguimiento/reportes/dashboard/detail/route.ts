import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Re-export types so existing imports remain valid
export type {
  KpiKind,
  AntiguedadBucket,
  DetailRow,
  DetailPayload,
} from '@/types/dms-ot';

const INTERNAL_API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get('access_token')?.value ?? '';
  const qs = req.nextUrl.search;

  const res = await fetch(`${INTERNAL_API}/api/v1/dms/ot-seguimiento/reportes/dashboard/detail${qs}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
