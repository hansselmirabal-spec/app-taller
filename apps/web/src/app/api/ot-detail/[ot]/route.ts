import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const INTERNAL_API = process.env.INTERNAL_API_URL ?? 'http://api:3001';

export interface StatusHistoryEntry {
  estado: string;
  desde:  string;
  hasta:  string | null;
  dias:   number;
  horas:  number;
}

export interface OtDetail {
  ot:                     number;
  codCliente:             string;
  nombreCliente:          string;
  chasis:                 string;
  modelo:                 string;
  estadoOt:               string;
  estadoIdis:             string;
  estadoFinanciero:       string;
  asesor:                 string;
  sucursal:               string;
  tipoServicio:           string;
  montoTotal:             number;
  observaciones:          string;
  diasIngreso:            number;
  diasEnEstado:           number;
  tiempoEntrega:          string | null;
  fechaIngreso:           string | null;
  horaIngreso:            string | null;
  fechaCompromisoCliente: string | null;
  fechaCompromisoTaller:  string | null;
  fechaCompromisoIdis:    string | null;
  fechaFinTaller:         string | null;
  fechaFinalizado:        string | null;
  fechaSalida:            string | null;
  fechaRenegociacion:     string | null;
  fechaFactura:           string | null;
  statusHistory:          StatusHistoryEntry[];
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ot: string }> },
) {
  const { ot: otParam } = await params;
  const otNum = Number(otParam);
  if (!Number.isInteger(otNum) || otNum <= 0) {
    return NextResponse.json({ error: 'OT inválida' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  const res = await fetch(`${INTERNAL_API}/dms/ot-detail/${otNum}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: 'no-store',
  });

  if (res.status === 404) {
    return NextResponse.json({ error: 'OT no encontrada' }, { status: 404 });
  }
  if (!res.ok) {
    return NextResponse.json({ error: 'Error al obtener detalle de OT' }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
}
