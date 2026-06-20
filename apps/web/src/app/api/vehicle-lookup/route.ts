import { NextResponse } from 'next/server';

// MySQL DMS routes pending migration — temporarily unavailable
export async function GET() {
  return NextResponse.json({ error: 'Service temporarily unavailable' }, { status: 503 });
}
