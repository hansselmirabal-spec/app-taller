import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const INTERNAL_API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('plate')?.toUpperCase().trim();
  if (!raw || raw.length < 3) {
    return NextResponse.json({ error: 'plate required (min 3 chars)' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value ?? '';

  const res = await fetch(`${INTERNAL_API}/api/v1/dms/vehicle-lookup?plate=${encodeURIComponent(raw)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'DMS unavailable' }, { status: 500 });
  }

  const data = await res.json();

  if (!data.found) {
    return NextResponse.json({ found: false }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({
    found: true,
    vehicle: {
      plate:            data.vehicle.plate,
      chassis:          data.vehicle.chassis,
      vehicleType:      data.vehicle.vehicleType,
      engine:           '',
      mileage:          '',
      registrationDate: '',
      lastService:      '',
    },
    customer: {
      customerName:   data.customer.customerName,
      customerNumber: data.customer.customerNumber,
      cedula:         '',
      ruc:            '',
      telPrincipal:   '',
      telOficina:     '',
      celular:        '',
      address:        '',
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
