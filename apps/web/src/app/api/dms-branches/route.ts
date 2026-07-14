import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const INTERNAL_API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value ?? '';

  const res = await fetch(`${INTERNAL_API}/api/v1/dms/branches`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'DMS unavailable' }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json({ data }, { headers: { 'Cache-Control': 'no-store' } });
}
