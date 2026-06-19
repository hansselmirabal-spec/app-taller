import {
  Document, Page, Text, View, StyleSheet, Font,
} from '@react-pdf/renderer';
import type { SimulatorEstimateResult, DamageLevel } from '@/lib/api';

Font.register({
  family: 'Helvetica',
  fonts: [],
});

const COLOR = {
  orange:     '#ea580c',
  slate900:   '#0f172a',
  slate700:   '#334155',
  slate500:   '#64748b',
  slate200:   '#e2e8f0',
  slate50:    '#f8fafc',
  blue:       '#3b82f6',
  violet:     '#8b5cf6',
  emerald:    '#10b981',
  white:      '#ffffff',
};

const DAMAGE_LABEL: Record<DamageLevel, string> = {
  Leve:        'Leve',
  Medio:       'Medio',
  Grave:       'Grave',
  Sustitucion: 'Sustitución',
};

const DAMAGE_COLOR: Record<DamageLevel, string> = {
  Leve:        '#059669',
  Medio:       '#d97706',
  Grave:       '#ea580c',
  Sustitucion: '#dc2626',
};

const s = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: COLOR.slate900,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    backgroundColor: COLOR.white,
  },

  // Header
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 2,
    borderBottomColor: COLOR.orange,
  },
  headerLeft: { flex: 1 },
  brand: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: COLOR.orange, marginBottom: 2 },
  brandSub: { fontSize: 8, color: COLOR.slate500 },
  headerRight: { alignItems: 'flex-end' },
  presupTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: COLOR.slate900 },
  presupNum: { fontSize: 8, color: COLOR.slate500, marginTop: 2 },
  presupDate: { fontSize: 8, color: COLOR.slate500, marginTop: 1 },

  // Client card
  clientCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: COLOR.slate50,
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLOR.slate200,
  },
  clientBlock: { flex: 1 },
  clientLabel: { fontSize: 7, color: COLOR.slate500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  clientValue: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: COLOR.slate900 },
  clientValueSm: { fontSize: 9, color: COLOR.slate700 },
  plate: {
    fontSize: 13, fontFamily: 'Helvetica-Bold', color: COLOR.orange,
    backgroundColor: '#fff7ed', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: 1, borderColor: '#fed7aa', alignSelf: 'flex-start',
  },

  // Section title
  sectionTitle: {
    fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLOR.slate500,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: 6, marginTop: 14,
  },

  // Panel table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: COLOR.slate900,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 2,
  },
  tableHeaderText: { fontSize: 7, color: COLOR.white, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase' },

  panelRow: {
    marginBottom: 6,
    borderWidth: 1,
    borderColor: COLOR.slate200,
    borderRadius: 4,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.slate50,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.slate200,
  },
  panelName: { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLOR.slate900 },
  damageBadge: {
    fontSize: 7, fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 10, marginLeft: 6,
  },
  panelTotalHrs: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: COLOR.slate700, marginLeft: 8 },

  processRow: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  processRowAlt: { backgroundColor: '#f8fafc' },
  processCat: { width: 70, fontSize: 8 },
  processDesc: { flex: 1, fontSize: 8, color: COLOR.slate700 },
  processHrs: { width: 36, fontSize: 8, fontFamily: 'Helvetica-Bold', color: COLOR.slate900, textAlign: 'right' },

  catDot: {
    width: 6, height: 6, borderRadius: 3, marginRight: 4, marginTop: 1,
  },

  // Summary totals
  summaryGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    marginBottom: 8,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 6,
    padding: 10,
    alignItems: 'center',
  },
  summaryLabel: { fontSize: 7, color: COLOR.white, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  summaryValue: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: COLOR.white },
  summaryUnit: { fontSize: 7, color: COLOR.white, marginTop: 1 },

  totalBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLOR.orange,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 8,
  },
  totalLabel: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: COLOR.white },
  totalValue: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: COLOR.white },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLOR.slate200,
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: COLOR.slate500 },

  notes: {
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    borderRadius: 4,
    padding: 8,
    marginTop: 10,
  },
  notesLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: '#92400e', marginBottom: 3 },
  notesText: { fontSize: 8, color: '#78350f' },
});

interface Props {
  plate:        string;
  customerName: string;
  phone?:       string;
  budgetNumber?: string;
  notes?:       string;
  estimate:     SimulatorEstimateResult;
  date:         string;
}

const PROCESS_CATEGORY: Record<string, { label: string; color: string }> = {
  'Reparar':          { label: 'Chapería',     color: COLOR.blue },
  'Sustituir':        { label: 'Chapería',     color: COLOR.blue },
  'Desm/Mont':        { label: 'Chapería',     color: COLOR.blue },
  'Parcial desarmar': { label: 'Chapería',     color: COLOR.blue },
  'Renovar':          { label: 'Chapería',     color: COLOR.blue },
  'Preparacion':      { label: 'Preparación',  color: COLOR.violet },
  'Empapelado':       { label: 'Preparación',  color: COLOR.violet },
  'Pintar':           { label: 'Pintura',      color: COLOR.orange },
  'Pulir':            { label: 'Pintura',      color: COLOR.orange },
};

export function BudgetPdfDocument({ plate, customerName, phone, budgetNumber, notes, estimate, date }: Props) {
  const formattedDate = new Date(date + 'T12:00:00').toLocaleDateString('es-PY', {
    day: '2-digit', month: 'long', year: 'numeric',
  });

  return (
    <Document title={`Presupuesto ${plate || 'Sin patente'}`} author="App Taller">
      <Page size="A4" style={s.page}>

        {/* ── Header ──────────────────────────────────── */}
        <View style={s.headerBar}>
          <View style={s.headerLeft}>
            <Text style={s.brand}>TALLER CARROCERÍA</Text>
            <Text style={s.brandSub}>Chapería · Pintura · Preparación</Text>
          </View>
          <View style={s.headerRight}>
            <Text style={s.presupTitle}>PRESUPUESTO</Text>
            {budgetNumber ? <Text style={s.presupNum}>N° {budgetNumber}</Text> : null}
            <Text style={s.presupDate}>{formattedDate}</Text>
          </View>
        </View>

        {/* ── Cliente ─────────────────────────────────── */}
        <View style={s.clientCard}>
          <View style={s.clientBlock}>
            <Text style={s.clientLabel}>Cliente</Text>
            <Text style={s.clientValue}>{customerName || '—'}</Text>
            {phone ? <Text style={s.clientValueSm}>{phone}</Text> : null}
          </View>
          <View>
            <Text style={s.clientLabel}>Patente</Text>
            <Text style={s.plate}>{plate || '—'}</Text>
          </View>
        </View>

        {/* ── Detalle por panel ───────────────────────── */}
        <Text style={s.sectionTitle}>Detalle de trabajos</Text>

        {estimate.lines.map((line, li) => {
          const dmgColor = DAMAGE_COLOR[line.damageLevel] ?? COLOR.slate700;
          return (
            <View key={li} style={s.panelRow}>
              {/* Panel header */}
              <View style={s.panelHeader}>
                <Text style={s.panelName}>
                  {line.qty > 1 ? `${line.qty}× ` : ''}{line.pieza}
                </Text>
                <View style={[s.damageBadge, { backgroundColor: dmgColor + '20' }]}>
                  <Text style={{ fontSize: 7, fontFamily: 'Helvetica-Bold', color: dmgColor }}>
                    {DAMAGE_LABEL[line.damageLevel]}
                  </Text>
                </View>
                <Text style={s.panelTotalHrs}>{line.totalHoras}h</Text>
              </View>

              {/* Procesos */}
              {line.breakdown.map((proc, pi) => {
                const cat = PROCESS_CATEGORY[proc.proceso] ?? { label: proc.proceso, color: COLOR.slate500 };
                return (
                  <View key={pi} style={[s.processRow, pi % 2 === 1 ? s.processRowAlt : {}]}>
                    <View style={[s.processCat, { flexDirection: 'row', alignItems: 'center' }]}>
                      <View style={[s.catDot, { backgroundColor: cat.color }]} />
                      <Text style={{ fontSize: 7.5, color: cat.color, fontFamily: 'Helvetica-Bold' }}>{cat.label}</Text>
                    </View>
                    <Text style={s.processDesc}>{proc.descripcion}</Text>
                    <Text style={s.processHrs}>{proc.horas}h</Text>
                  </View>
                );
              })}
            </View>
          );
        })}

        {/* ── Totales por categoría ────────────────────── */}
        <View style={s.summaryGrid}>
          <View style={[s.summaryCard, { backgroundColor: COLOR.blue }]}>
            <Text style={s.summaryLabel}>Chapería</Text>
            <Text style={s.summaryValue}>{estimate.bodyworkHours}h</Text>
          </View>
          <View style={[s.summaryCard, { backgroundColor: COLOR.violet }]}>
            <Text style={s.summaryLabel}>Preparación</Text>
            <Text style={s.summaryValue}>{estimate.prepHours}h</Text>
          </View>
          <View style={[s.summaryCard, { backgroundColor: COLOR.orange }]}>
            <Text style={s.summaryLabel}>Pintura</Text>
            <Text style={s.summaryValue}>{estimate.paintHours}h</Text>
          </View>
          <View style={[s.summaryCard, { backgroundColor: COLOR.slate700 }]}>
            <Text style={s.summaryLabel}>Total horas</Text>
            <Text style={s.summaryValue}>{estimate.totalHoras}h</Text>
          </View>
        </View>

        {/* ── Total MO ───────────────────────────────── */}
        <View style={s.totalBar}>
          <View>
            <Text style={s.totalLabel}>Costo de mano de obra</Text>
            <Text style={{ fontSize: 7, color: '#fed7aa', marginTop: 1 }}>
              Tarifa: {estimate.tarifa.toLocaleString('es-PY')} {estimate.moneda}/h
            </Text>
          </View>
          <Text style={s.totalValue}>
            {estimate.moneda} {estimate.totalMdo.toLocaleString('es-PY')}
          </Text>
        </View>

        {/* ── Notas ──────────────────────────────────── */}
        {notes ? (
          <View style={s.notes}>
            <Text style={s.notesLabel}>Observaciones</Text>
            <Text style={s.notesText}>{notes}</Text>
          </View>
        ) : null}

        {/* ── Footer ─────────────────────────────────── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>Este presupuesto es válido por 30 días · Solo mano de obra, no incluye repuestos</Text>
          <Text style={s.footerText} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>

      </Page>
    </Document>
  );
}
