'use client';
import { useState, Suspense, useMemo, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, AlertTriangle, Clock, User, Car, Wrench,
  CalendarDays, CheckCircle2, Layers, UserCheck, Hash,
} from 'lucide-react';
import { useTechnicians } from '@/hooks/use-technicians';
import { useServiceTypes } from '@/hooks/use-service-types';
import { useDailyCapacity } from '@/hooks/use-capacity';
import { useCreateAppointment, useAppointmentsByDate } from '@/hooks/use-appointments';
import { useWorkTypes } from '@/hooks/use-work-types';
import {
  useCreateBodyshopEntry, useBodyshopDayCapacity, useBodyshopTechAvailability,
  useDmsBodyshopSucursales, useDmsBodyshopAsesores,
} from '@/hooks/use-bodyshop';
import type { BodyshopScheduleSimulation } from '@/hooks/use-bodyshop';
import { useActiveWorkshop } from '@/hooks/use-active-workshop';
import { useWorkshopId } from '@/context/workshop-context';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmModal } from '@/components/ui/confirm-modal';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatDate, minutesToTime, timeToMinutes, formatDateDisplay } from '@/lib/utils';
import type { Appointment, BodyshopChannel, WorkType } from '@/types';
import { BookingConfirmModal, type BookingConfirmData } from '@/components/ui/booking-confirm-modal';
import { AlternativeDatesPanel } from '@/components/ui/alternative-dates-panel';
import { useAvailableSlots } from '@/hooks/use-available-slots';
import { useDmsAdvisorSlots } from '@/hooks/use-dms-advisors';
import type { AvailableSlot, DmsAdvisor } from '@/lib/api';
import { simulateBodyshopSchedule, getBodyshopEntriesByRange } from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const SLOT_INTERVAL = 30;
const HOUR_START = 8;
const HOUR_END = 18;

// Chapas y chasis siempre incluyen letras. Un valor solo numérico suele ser
// un número de OT o de cliente ingresado por error en este campo.
function looksLikePlateOrChassis(value: string): boolean {
  return /[A-Z]/i.test(value);
}


function generateTimeSlots() {
  const slots: string[] = [];
  for (let min = HOUR_START * 60; min < HOUR_END * 60; min += SLOT_INTERVAL) {
    slots.push(minutesToTime(min));
  }
  return slots;
}

function checkOverlap(
  slotStart: string,
  durationHours: number,
  existingAppointments: Appointment[],
  technicianId: string,
): Appointment | null {
  const newStart = timeToMinutes(slotStart);
  const newEnd = newStart + durationHours * 60;
  return existingAppointments.find(appt =>
    appt.technicianId === technicianId &&
    appt.status !== 'cancelled' &&
    timeToMinutes(appt.timeStart) < newEnd &&
    timeToMinutes(appt.timeEnd) > newStart
  ) ?? null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

function FormRouter() {
  const { isBodyshop } = useActiveWorkshop();
  return isBodyshop ? <BodyshopNewForm /> : <MechanicNewForm />;
}

// ─── MECHANIC form ────────────────────────────────────────────────────────────

function MechanicNewForm() {
  const router = useRouter();
  const params = useSearchParams();
  const create = useCreateAppointment();

  const [date, setDate] = useState(params.get('date') || formatDate(new Date()));
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [technicianId, setTechnicianId] = useState(params.get('tech') || '');
  const [timeStart, setTimeStart] = useState(params.get('time') || '');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [confirmOverload,     setConfirmOverload]     = useState(false);
  const [confirmSpecialty,    setConfirmSpecialty]    = useState(false);
  const [showSpecialtyDialog, setShowSpecialtyDialog] = useState(false);
  const [pendingTechId,       setPendingTechId]       = useState('');
  const [confirmData,         setConfirmData]         = useState<BookingConfirmData | null>(null);

  // Vehicle search input (acepta chapa o chasis)
  const [searchValue, setSearchValue] = useState(params.get('plate') || '');
  const [searching,   setSearching]   = useState(false);
  const [searchError, setSearchError] = useState('');

  // Vehicle data
  const [plate,            setPlate]            = useState('');
  const [chassis,          setChassis]          = useState('');
  const [vehicleType,      setVehicleType]      = useState('');
  const [modelYear,        setModelYear]        = useState('');
  const [engine,           setEngine]           = useState('');
  const [mileage,          setMileage]          = useState('');
  const [registrationDate, setRegistrationDate] = useState('');
  const [lastService,      setLastService]      = useState('');

  // Customer data
  const [customerName,   setCustomerName]   = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [cedula,         setCedula]         = useState('');
  const [ruc,            setRuc]            = useState('');
  const [address,        setAddress]        = useState('');
  const [telOficina,     setTelOficina]     = useState('');
  const [telPrincipal,   setTelPrincipal]   = useState('');
  const [celular,        setCelular]        = useState('');
  const [email,          setEmail]          = useState('');

  async function handleVehicleLookup() {
    const value = searchValue.trim().toUpperCase();
    if (!value) return;
    if (!looksLikePlateOrChassis(value)) {
      setSearchError('Eso no parece una chapa ni un chasis (¿será un número de OT o de cliente?). La chapa lleva letras, ej: AACA898.');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const res  = await fetch(`/api/vehicle-lookup?plate=${encodeURIComponent(value)}`);
      if (res.status === 404) { setSearchError('Vehículo no encontrado en DMS'); return; }
      if (!res.ok)            { setSearchError('Error al conectar con DMS'); return; }
      const data = await res.json();
      if (data.found) {
        setPlate(data.vehicle.plate);
        setChassis(data.vehicle.chassis);
        setVehicleType(data.vehicle.vehicleType);
        setEngine(data.vehicle.engine);
        setMileage(data.vehicle.mileage);
        setRegistrationDate(data.vehicle.registrationDate);
        setLastService(data.vehicle.lastService);
        setCustomerName(data.customer.customerName);
        setCustomerNumber(data.customer.customerNumber);
        setCedula(data.customer.cedula);
        setRuc(data.customer.ruc);
        setTelPrincipal(data.customer.telPrincipal);
        setTelOficina(data.customer.telOficina);
        setCelular(data.customer.celular);
        setAddress(data.customer.address);
      }
    } catch {
      setSearchError('Error de conexión');
    } finally {
      setSearching(false);
    }
  }

  const { workshop } = useActiveWorkshop();
  const dmsBranch = workshop?.dmsBranch ?? null;
  const { data: technicians = [] } = useTechnicians();
  const { data: serviceTypes = [] } = useServiceTypes();
  const { data: capacity = [] } = useDailyCapacity(date);
  const { data: existingAppointments = [] } = useAppointmentsByDate(date);

  // Asesor DMS seleccionado (código + nombre + sucursal)
  const [advisorCode,       setAdvisorCode]       = useState('');
  const [advisorName,       setAdvisorName]       = useState('');
  const [advisorSucursalId, setAdvisorSucursalId] = useState('');
  const [dmsToast, setDmsToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (!dmsToast) return;
    const t = setTimeout(() => setDmsToast(null), 6_000);
    return () => clearTimeout(t);
  }, [dmsToast]);

  // Slots DMS para la fecha — todos los asesores sin filtro de sucursal
  const { data: advisorSlots = [], isLoading: advisorSlotsLoading } = useDmsAdvisorSlots(date);

  const lunchBreak = workshop?.config?.lunchBreak;

  const selectedService = serviceTypes.find(s => s.id === serviceTypeId);
  const selectedTech    = technicians.find(t => t.id === technicianId);

  const { data: slotsData, isLoading: slotsLoading } = useAvailableSlots({
    date,
    workshopType:    'MECHANIC',
    durationMinutes: selectedService ? Math.round(Number(selectedService.durationHours) * 60) : undefined,
    serviceSpecialty: selectedService?.specialtyName ?? null,
    enabled:         !!serviceTypeId && !!date,
  });
  const hasNoCapacity = slotsData?.available === false;

  // Buscador proactivo de días — "¿En qué día te ayudo?"
  const [showDayFinder, setShowDayFinder] = useState(false);
  const dayFinderDate = format(new Date(), 'yyyy-MM-dd');
  const { data: dayFinderData, isLoading: dayFinderLoading, isError: dayFinderError } = useAvailableSlots({
    date:             dayFinderDate,
    workshopType:     'MECHANIC',
    findNext:         true,
    durationMinutes:  selectedService ? Math.round(Number(selectedService.durationHours) * 60) : undefined,
    serviceSpecialty: selectedService?.specialtyName ?? null,
    enabled:          showDayFinder && !!serviceTypeId,
  });

  function handleSelectAlternative(altDate: string, slot: AvailableSlot) {
    setDate(altDate);
    if (slot.technicianId) setTechnicianId(slot.technicianId);
    setTimeStart(slot.time);
    setConfirmOverload(false);
    setConfirmSpecialty(false);
  }

  function handleDayFinderSelect(altDate: string, slot: AvailableSlot) {
    setDate(altDate);
    if (slot.technicianId) setTechnicianId(slot.technicianId);
    setTimeStart(slot.time);
    setConfirmOverload(false);
    setConfirmSpecialty(false);
    setShowDayFinder(false);
  }

  const techCapacity    = capacity.find(c => c.technicianId === technicianId);
  const projectedUsed   = (techCapacity?.usedHours ?? 0) + (selectedService?.durationHours ?? 0);
  const availableHours  = techCapacity?.availableHours ?? 0;
  const isOverloaded    = !!(technicianId && selectedService && availableHours > 0 && projectedUsed > availableHours);
  const isNearCapacity  = !!(technicianId && selectedService && availableHours > 0 && !isOverloaded && projectedUsed >= availableHours * 0.85);
  const horasRestantes  = availableHours - (techCapacity?.usedHours ?? 0);

  const specialtyMismatch = !!(
    selectedTech?.specialty &&
    selectedService?.specialtyName &&
    selectedTech.specialty !== selectedService.specialtyName
  );
  const pendingTech = technicians.find(t => t.id === pendingTechId);

  const availableTechnicians = technicians.filter(tech => {
    const cap = capacity.find(c => c.technicianId === tech.id);
    if (tech.id === technicianId) return true;
    return cap && cap.availableHours > 0;
  });

  const _now = new Date();
  const _todayStr = formatDate(_now);
  const _nowMinutes = _now.getHours() * 60 + _now.getMinutes();

  const timeSlots = generateTimeSlots().map(slot => {
    const conflict = technicianId && selectedService
      ? checkOverlap(slot, selectedService.durationHours, existingAppointments, technicianId)
      : null;
    const blocked = techCapacity?.absenceType === 'partial' &&
      techCapacity.blockedFrom && techCapacity.blockedTo &&
      timeToMinutes(slot) >= timeToMinutes(techCapacity.blockedFrom) &&
      timeToMinutes(slot) < timeToMinutes(techCapacity.blockedTo);
    const slotMin = timeToMinutes(slot);
    const slotEndMin = slotMin + (selectedService?.durationHours ?? 0) * 60;
    const lunchBlocked = !!(lunchBreak?.enabled &&
      lunchBreak.start && lunchBreak.end &&
      slotMin < timeToMinutes(lunchBreak.end) &&
      slotEndMin > timeToMinutes(lunchBreak.start)
    );
    const isPast = date === _todayStr && slotMin <= _nowMinutes;
    return { slot, conflict, blocked: blocked || false, lunchBlocked, isPast };
  });

  const currentConflict = timeStart && selectedService && technicianId
    ? checkOverlap(timeStart, selectedService.durationHours, existingAppointments, technicianId)
    : null;

  const timeEnd = timeStart && selectedService
    ? minutesToTime(timeToMinutes(timeStart) + selectedService.durationHours * 60)
    : null;

  const isFormComplete = !!(customerName && plate && serviceTypeId && technicianId && timeStart && !currentConflict && (!isOverloaded || confirmOverload) && (!specialtyMismatch || confirmSpecialty));

  // Campos requeridos vacíos (para marcar en rojo tras el primer intento)
  const missingFields = {
    customerName: !customerName.trim(),
    plate:        !plate.trim(),
    serviceType:  !serviceTypeId,
    technician:   !technicianId,
    timeStart:    !timeStart,
  };
  const hasMissing = Object.values(missingFields).some(Boolean);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    setError('');
    if (hasMissing || !isFormComplete) {
      setError('Completá los campos obligatorios marcados en rojo');
      return;
    }
    try {
      const result = await create.mutateAsync({
        date, timeStart, technicianId, serviceTypeId,
        customerName, plate: plate.toUpperCase(), notes,
        advisorCode:        advisorCode        || undefined,
        advisorName:        advisorName        || undefined,
        advisorSucursalId:  advisorSucursalId  || undefined,
        phone:              (telPrincipal || celular || '').trim() || undefined,
        vehicleDescription: (vehicleType || modelYear || '').trim() || undefined,
        chasis:             chassis || undefined,
      });
      const dmsResult = (result as any)?.dmsSync as { success: boolean; dmsId?: string; error?: string } | null | undefined;
      setConfirmData({
        type: 'mechanic',
        workshopName: workshop?.name,
        date,
        customerName,
        plate: plate.toUpperCase(),
        chassis,
        vehicleType,
        cedula,
        ruc,
        telPrincipal,
        celular,
        telOficina,
        address,
        timeStart,
        timeEnd: timeEnd ?? undefined,
        serviceName: selectedService?.name,
        techName: selectedTech?.name,
        techSpecialty: selectedTech?.specialty ?? undefined,
        notes: notes || undefined,
        dmsAdvisorCode: advisorCode || undefined,
        dmsAdvisorName: advisorName || undefined,
        dmsSync: dmsResult ?? null,
      });
    } catch (err: any) {
      setError(err.message || 'Error al crear el turno');
    }
  }

  return (
    <>
    <BookingConfirmModal
      data={confirmData}
      onClose={() => setConfirmData(null)}
      onViewSchedule={() => router.push(`/appointments?date=${date}`)}
      onNewBooking={() => { setConfirmData(null); router.push('/appointments/new'); }}
    />
    {dmsToast && (
      <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
        dmsToast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
      }`}>
        <span>{dmsToast.msg}</span>
        <button onClick={() => setDmsToast(null)} className="ml-2 opacity-70 hover:opacity-100 text-lg leading-none">&times;</button>
      </div>
    )}
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
          <ArrowLeft className="h-4 w-4 text-slate-500" />
        </button>
        <div>
          <h1 className="text-lg font-bold text-slate-900">Confirmar Turno</h1>
          <p className="text-xs text-slate-500">Finalizá y detallá el taller para el turno de servicio premium</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="flex gap-6 p-6 min-h-full">
          <div className="flex-1 space-y-5 min-w-0">

            {/* Búsqueda de vehículo */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
                    Chapa o Chasis
                  </label>
                  <p className="text-xs text-slate-400">Ingresá la chapa (ej: AACA898) o el número de chasis (ej: WDD2120361A988316)</p>
                  <div className="flex gap-2">
                    <Input
                      value={searchValue}
                      onChange={e => setSearchValue(e.target.value.toUpperCase())}
                      onKeyDown={e => e.key === 'Enter' && handleVehicleLookup()}
                      placeholder="AACA898 · WDD2120361A988316"
                      className="uppercase"
                    />
                    <button type="button"
                      onClick={() => handleVehicleLookup()}
                      disabled={searching || !searchValue.trim()}
                      className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0 hover:bg-blue-700 transition-colors">
                      {searching ? '...' : 'Buscar'}
                    </button>
                  </div>
                </div>
              </div>
              {searchError && (
                <div className="px-5 pb-4 text-sm text-red-600 font-medium">{searchError}</div>
              )}
            </div>

            {/* Datos del Vehículo */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-blue-700 px-5 py-3">
                <span className="text-sm font-semibold text-white flex items-center gap-2">
                  <Car className="h-4 w-4" /> Datos del Vehículo
                </span>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <Field label="Chapa" error={submitted && missingFields.plate} required>
                    <Input value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="AACA898" className={`uppercase ${errCls(submitted && missingFields.plate)}`} />
                  </Field>
                  <Field label="Chasis">
                    <Input value={chassis} onChange={e => setChassis(e.target.value.toUpperCase())} placeholder="WDC..." className="uppercase" />
                  </Field>
                  <Field label="Tipo Vehículo">
                    <Input value={vehicleType} onChange={e => setVehicleType(e.target.value)} placeholder="GLC 200 COUPE" />
                  </Field>
                  <Field label="Modelo / Año">
                    <Input value={modelYear} onChange={e => setModelYear(e.target.value)} placeholder="Toyota Corolla 2022" />
                  </Field>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <Field label="Motor">
                    <Input value={engine} onChange={e => setEngine(e.target.value)} placeholder="N° Motor" />
                  </Field>
                  <Field label="Kilometraje">
                    <Input value={mileage} onChange={e => setMileage(e.target.value)} placeholder="36795" type="number" />
                  </Field>
                  <Field label="Fecha Matrícula">
                    <Input value={registrationDate} onChange={e => setRegistrationDate(e.target.value)} placeholder="03/12/2019" />
                  </Field>
                  <Field label="Último Servicio">
                    <Input value={lastService} onChange={e => setLastService(e.target.value)} placeholder="16/01/2026" />
                  </Field>
                </div>
              </div>
            </div>

            {/* Datos del Cliente */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-blue-700 px-5 py-3">
                <span className="text-sm font-semibold text-white flex items-center gap-2">
                  <User className="h-4 w-4" /> Datos del Cliente
                </span>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <Field label="Nombre" error={submitted && missingFields.customerName} required>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Juan Perez" className={errCls(submitted && missingFields.customerName)} />
                  </Field>
                  <Field label="N° Cliente">
                    <Input value={customerNumber} onChange={e => setCustomerNumber(e.target.value)} placeholder="68110" />
                  </Field>
                  <Field label="Cédula/Ident.">
                    <Input value={cedula} onChange={e => setCedula(e.target.value)} placeholder="5548838" />
                  </Field>
                  <Field label="RUC">
                    <Input value={ruc} onChange={e => setRuc(e.target.value)} placeholder="5548838-1" />
                  </Field>
                </div>
                <div className="grid grid-cols-5 gap-4">
                  <Field label="Dirección">
                    <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Washington 793" />
                  </Field>
                  <Field label="Tel. Oficina">
                    <Input value={telOficina} onChange={e => setTelOficina(e.target.value)} placeholder="+595 21..." />
                  </Field>
                  <Field label="Tel. Principal">
                    <Input value={telPrincipal} onChange={e => setTelPrincipal(e.target.value)} placeholder="+595 21..." />
                  </Field>
                  <Field label="Celular">
                    <Input value={celular} onChange={e => setCelular(e.target.value)} placeholder="+595 981..." />
                  </Field>
                  <Field label="Email">
                    <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@email.com" type="email" />
                  </Field>
                </div>
              </div>
            </div>

            {/* Servicio */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
                <div className="h-6 w-6 rounded-md bg-emerald-50 flex items-center justify-center">
                  <Wrench className="h-3.5 w-3.5 text-emerald-600" />
                </div>
                <span className="text-sm font-semibold text-slate-900">Selección de Servicio</span>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Tipo de servicio" error={submitted && missingFields.serviceType} required>
                    <Select value={serviceTypeId} onValueChange={v => { setServiceTypeId(v); setTimeStart(''); setConfirmOverload(false); setConfirmSpecialty(false); }}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                      <SelectContent>
                        {serviceTypes.map(st => (
                          <SelectItem key={st.id} value={st.id}>
                            <span className="flex items-center gap-2">
                              <span className="h-2 w-2 rounded-full inline-block" style={{ background: st.color }} />
                              {st.name} ({st.durationHours}h)
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Fecha</label>
                    <div className="flex gap-2">
                      <Input
                        type="date"
                        value={date}
                        onChange={e => { setDate(e.target.value); setTimeStart(''); setConfirmOverload(false); setShowDayFinder(false); }}
                        className="flex-1"
                      />
                      {serviceTypeId && (
                        <button
                          type="button"
                          onClick={() => setShowDayFinder(v => !v)}
                          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-semibold transition-colors
                            ${showDayFinder
                              ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                              : 'bg-white border-slate-200 text-blue-600 hover:bg-blue-50 hover:border-blue-300'}`}
                          title="Buscar próximas fechas disponibles"
                        >
                          <CalendarDays className="h-3.5 w-3.5" />
                          ¿En qué día te ayudo?
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Buscador proactivo de días */}
                {showDayFinder && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-blue-800 flex items-center gap-2">
                        <CalendarDays className="h-4 w-4" />
                        Próximas fechas con disponibilidad
                      </p>
                      <button type="button" onClick={() => setShowDayFinder(false)} className="text-blue-400 hover:text-blue-700 text-lg leading-none">×</button>
                    </div>
                    {dayFinderLoading ? (
                      <div className="flex items-center gap-2 text-xs text-blue-500 py-2">
                        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Buscando disponibilidad...
                      </div>
                    ) : dayFinderError ? (
                      <div className="text-xs text-red-600 py-2 flex items-center gap-1.5">
                        <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                        Error al consultar disponibilidad. Reiniciá el servidor y probá de nuevo.
                      </div>
                    ) : dayFinderData?.available === false ? (
                      <AlternativeDatesPanel alternatives={dayFinderData.alternatives} onSelect={handleDayFinderSelect} />
                    ) : dayFinderData ? (
                      <div className="text-xs text-slate-500 py-2">No se encontraron fechas disponibles en los próximos 30 días.</div>
                    ) : null}
                  </div>
                )}

                {/* Indicador de disponibilidad de la fecha seleccionada */}
                {serviceTypeId && date && slotsLoading && !showDayFinder && (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verificando disponibilidad...
                  </div>
                )}

                {/* Picker de Asesor de Recepción — siempre visible si hay datos DMS */}
                {(advisorSlots.length > 0 || advisorSlotsLoading) && (
                  <AdvisorReceptionPicker
                    dmsSlots={advisorSlots}
                    dmsLoading={advisorSlotsLoading}
                    selectedAdvisorCode={advisorCode}
                    onAdvisorSelect={(code, name, sucId) => { setAdvisorCode(code); setAdvisorName(name); setAdvisorSucursalId(sucId); }}
                    selectedSlot={timeStart}
                    onSlotSelect={t => setTimeStart(t)}
                    date={date}
                  />
                )}

                <div className="space-y-4">
                  <TechnicianPicker
                    technicians={availableTechnicians}
                    selectedId={technicianId}
                    capacity={capacity}
                    serviceHours={selectedService?.durationHours ?? 0}
                    onSelect={v => {
                      const newTech = technicians.find(t => t.id === v);
                      const mismatch = !!(newTech?.specialty && selectedService?.specialtyName && newTech.specialty !== selectedService.specialtyName);
                      if (mismatch) {
                        setPendingTechId(v);
                        setShowSpecialtyDialog(true);
                      } else {
                        setTechnicianId(v);
                        setTimeStart('');
                        setConfirmOverload(false);
                        setConfirmSpecialty(false);
                      }
                    }}
                    serviceSpecialty={selectedService?.specialtyName ?? null}
                    hasError={submitted && missingFields.technician}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div /> {/* spacer */}
                  <Field label="Hora de inicio" error={submitted && missingFields.timeStart} required>
                    <Select value={timeStart} onValueChange={setTimeStart} disabled={!technicianId}>
                      <SelectTrigger className={currentConflict ? 'border-amber-400' : submitted && missingFields.timeStart ? 'border-red-400 bg-red-50' : ''}>
                        <SelectValue placeholder="Seleccionar horario..." />
                      </SelectTrigger>
                      <SelectContent>
                        {timeSlots.map(({ slot, conflict, blocked, lunchBlocked, isPast }) => (
                          <SelectItem
                            key={slot}
                            value={slot}
                            disabled={!!conflict || blocked || lunchBlocked || isPast}
                            className={conflict || blocked || lunchBlocked || isPast ? 'opacity-40 line-through' : ''}
                          >
                            {conflict ? `${slot} — ocupado`
                              : lunchBlocked ? `${slot} — Almuerzo`
                              : blocked ? `${slot} — bloqueado`
                              : isPast ? `${slot} — pasado`
                              : slot}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                {hasNoCapacity && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
                      <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-500 flex-shrink-0" />
                      <div className="text-xs text-amber-800">
                        <p className="font-semibold">Sin disponibilidad para esta fecha</p>
                        <p className="mt-0.5">No hay cupos para <strong>{selectedService?.name}</strong> el {date}. Elegí una fecha alternativa:</p>
                      </div>
                    </div>
                    <AlternativeDatesPanel
                      alternatives={(slotsData as any)?.alternatives ?? []}
                      onSelect={handleSelectAlternative}
                    />
                  </div>
                )}

                {currentConflict && (
                  <Alert variant="warning">
                    <p className="font-semibold">Horario ocupado</p>
                    <p>{selectedTech?.name} tiene turno de <strong>{currentConflict.timeStart}</strong> a <strong>{currentConflict.timeEnd}</strong> ({currentConflict.customerName})</p>
                  </Alert>
                )}

                {isOverloaded && (
                  <Alert variant="danger">
                    <p className="font-semibold">Técnico sobrecargado</p>
                    <p>{selectedTech?.name} solo tiene <strong>{horasRestantes.toFixed(1)}h disponibles</strong> y este servicio requiere <strong>{selectedService?.durationHours}h</strong>.</p>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                      <input type="checkbox" checked={confirmOverload} onChange={e => setConfirmOverload(e.target.checked)} className="rounded border-red-400 accent-red-600" />
                      <span className="font-medium">Entiendo el riesgo, confirmar igual</span>
                    </label>
                  </Alert>
                )}

                {isNearCapacity && (
                  <Alert variant="warning">
                    <p className="font-semibold">Capacidad casi completa</p>
                    <p>{selectedTech?.name} quedará con <strong>{(availableHours - projectedUsed).toFixed(1)}h libres</strong> después de este turno.</p>
                  </Alert>
                )}

                {specialtyMismatch && (
                  <Alert variant="orange">
                    <p className="font-semibold">Especialidad diferente confirmada</p>
                    <p>
                      <strong>{selectedTech?.name}</strong> ({selectedTech?.specialty}) asignado a servicio de{' '}
                      <strong>{selectedService?.specialtyName}</strong>. Cambio de técnico para revertir.
                    </p>
                  </Alert>
                )}

                <Field label="Notas (opcional)">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Observaciones, historial del vehículo..."
                    className="flex min-h-[72px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 resize-none"
                  />
                </Field>
              </div>
            </div>

            {error && (
              <Alert variant="danger"><p>{error}</p></Alert>
            )}
          </div>

          {/* Summary panel */}
          <div className="w-72 flex-shrink-0 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-900 px-4 py-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Horario Seleccionado</p>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <CalendarDays className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 capitalize">
                      {date ? format(parseISO(date + 'T12:00:00'), "EEE d 'de' MMMM", { locale: es }) : '—'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {timeStart ? `${timeStart}${timeEnd ? ` → ${timeEnd}` : ''}` : 'Sin hora seleccionada'}
                    </p>
                  </div>
                </div>
                {selectedTech && (
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-white">
                          {selectedTech.name.split(' ').slice(0,2).map((n: string) => n[0]).join('')}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{selectedTech.name}</p>
                        {selectedTech.specialty && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 border border-violet-200">
                            <Wrench className="h-2.5 w-2.5" />{selectedTech.specialty}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Barra de horas reales restantes */}
                    {techCapacity && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-semibold">
                          <span className="text-slate-500">Horas del día</span>
                          <span className={horasRestantes <= 1 ? 'text-red-600' : horasRestantes <= 2 ? 'text-amber-600' : 'text-emerald-600'}>
                            {(techCapacity.usedHours ?? 0).toFixed(1)}h / {techCapacity.availableHours}h
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              horasRestantes <= 1 ? 'bg-red-500' :
                              horasRestantes <= 2 ? 'bg-amber-400' :
                              'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.max(0, Math.min(100, ((techCapacity.usedHours ?? 0) / (techCapacity.availableHours || 1)) * 100))}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-400">
                          {horasRestantes.toFixed(1)}h libres para nuevos turnos
                        </p>
                      </div>
                    )}
                  </div>
                )}
                {selectedService && (
                  <div className="flex items-center gap-2 border-t border-slate-100 pt-3">
                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: selectedService.color }} />
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{selectedService.name}</p>
                      <p className="text-xs text-slate-500">{selectedService.durationHours}h de duración</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={create.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl transition-colors shadow-sm flex items-center justify-center gap-2"
            >
              {create.isPending ? 'Guardando...' : <><CheckCircle2 className="h-4 w-4" /> Confirmar Reserva</>}
            </button>

            <button type="button" onClick={() => router.back()} className="w-full text-sm text-slate-500 hover:text-slate-800 py-2 text-center transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      </div>

      {/* Dialog modal: especialidad no coincide */}
      <Dialog open={showSpecialtyDialog} onOpenChange={open => { if (!open) { setPendingTechId(''); setShowSpecialtyDialog(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Especialidad diferente
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p>
              El servicio <strong className="text-slate-900">{selectedService?.name}</strong> requiere
              un técnico de <strong className="text-slate-900">{selectedService?.specialtyName}</strong>.
            </p>
            <p>
              <strong className="text-slate-900">{pendingTech?.name}</strong> es de especialidad{' '}
              <strong className="text-orange-600">{pendingTech?.specialty}</strong>.
            </p>
            <p className="text-slate-500 text-xs">
              Asignar este técnico puede afectar la calidad del servicio.
            </p>
          </div>
          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={() => { setPendingTechId(''); setShowSpecialtyDialog(false); }}
              className="flex-1 py-2 text-sm font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                setTechnicianId(pendingTechId);
                setConfirmSpecialty(true);
                setTimeStart('');
                setConfirmOverload(false);
                setPendingTechId('');
                setShowSpecialtyDialog(false);
              }}
              className="flex-1 py-2 text-sm font-semibold rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors"
            >
              Asignar igual
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </>
  );
}

// ─── BODYSHOP form ────────────────────────────────────────────────────────────

const CHANNEL_OPTIONS: { value: BodyshopChannel; label: string }[] = [
  { value: 'phone',     label: 'Teléfono' },
  { value: 'walk_in',   label: 'Walk-in' },
  { value: 'online',    label: 'Online' },
  { value: 'insurance', label: 'Seguro' },
];

// ─── BODYSHOP form (v2 — multi-step) ────────────────────────────────────────

interface WorkItemDraftProcess {
  processId: string;
  processCode: string;
  processName: string;
  suggestedHours: number;
}

interface WorkItemDraft {
  localId: string;
  pieceId: string;
  pieceName: string;
  gradeId: string;
  gradeName: string;
  processes: WorkItemDraftProcess[];
}

function BodyshopNewForm() {
  const router     = useRouter();
  const params     = useSearchParams();
  const workshopId = useWorkshopId();
  const { workshop } = useActiveWorkshop();
  const create     = useCreateBodyshopEntry();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [error, setError] = useState('');
  const [confirmData, setConfirmData] = useState<BookingConfirmData | null>(null);

  // ── Step 1: vehicle + customer ──────────────────────────────────────────────
  const [searchValue, setSearchValue] = useState(params.get('plate') || '');
  const [searching,   setSearching]   = useState(false);
  const [searchError, setSearchError] = useState('');
  const [plate,            setPlate]            = useState('');
  const [chassis,          setChassis]          = useState('');
  const [vehicleType,      setVehicleType]      = useState('');
  const [modelYear,        setModelYear]        = useState('');
  const [engine,           setEngine]           = useState('');
  const [mileage,          setMileage]          = useState('');
  const [registrationDate, setRegistrationDate] = useState('');
  const [lastService,      setLastService]      = useState('');
  const [customerName,   setCustomerName]   = useState('');
  const [customerNumber, setCustomerNumber] = useState('');
  const [cedula,         setCedula]         = useState('');
  const [ruc,            setRuc]            = useState('');
  const [address,        setAddress]        = useState('');
  const [telOficina,     setTelOficina]     = useState('');
  const [telPrincipal,   setTelPrincipal]   = useState('');
  const [celular,        setCelular]        = useState('');
  const [email,          setEmail]          = useState('');

  // ── Step 2: horas del presupuesto (input directo) ───────────────────────────
  const [directBodyworkHours, setDirectBodyworkHours] = useState('');
  const [directPrepHours,     setDirectPrepHours]     = useState('');
  const [directPaintHours,    setDirectPaintHours]    = useState('');
  const [budgetNumber,        setBudgetNumber]        = useState('');

  // ── Step 3: schedule + confirm ──────────────────────────────────────────────
  const [date,        setDate]        = useState(params.get('date') || formatDate(new Date()));
  const [channel,     setChannel]     = useState<BodyshopChannel>('phone');
  const [notes,       setNotes]       = useState('');
  const [advisorCode,       setAdvisorCode]       = useState('');
  const [advisorName,       setAdvisorName]       = useState('');
  const [advisorSucursalId, setAdvisorSucursalId] = useState('');
  const [timeStart,         setTimeStart]         = useState('');
  const [simulation,        setSimulation]        = useState<BodyshopScheduleSimulation | null>(null);
  const [simulating,  setSimulating]  = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // DMS integration
  const [dmsSucursalId,   setDmsSucursalId]   = useState<string | null>(null);
  const [dmsAdvisorCode,  setDmsAdvisorCode]  = useState('');
  const [dmsAdvisorName,  setDmsAdvisorName]  = useState('');
  const [dmsToast,        setDmsToast]        = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const { data: dmsSucursales = [] }                      = useDmsBodyshopSucursales();
  const { data: dmsAsesores   = [], isLoading: dmsAsesoresLoading } = useDmsBodyshopAsesores(dmsSucursalId);

  // Auto-dismiss DMS toast
  useEffect(() => {
    if (!dmsToast) return;
    const t = setTimeout(() => setDmsToast(null), 6_000);
    return () => clearTimeout(t);
  }, [dmsToast]);

  // Pre-select workshop's DMS sucursal once workshop data loads
  const preselectDone = useRef(false);
  useEffect(() => {
    if (preselectDone.current) return;
    const preselect = workshop?.config?.dmsIntegration?.dmsSucursalId;
    if (preselect) {
      setDmsSucursalId(preselect);
      preselectDone.current = true;
    }
  }, [workshop]);

  const { data: advisorSlots = [], isLoading: advisorSlotsLoading } = useDmsAdvisorSlots(date);

  const bodyworkH = parseFloat(directBodyworkHours) || 0;
  const prepH     = parseFloat(directPrepHours)     || 0;
  const paintH    = parseFloat(directPaintHours)    || 0;
  const totalH    = bodyworkH + prepH + paintH;

  async function handleSimulate() {
    if (totalH === 0) { setError('Ingresá horas en al menos un proceso antes de simular.'); return; }
    setSimulating(true);
    setSimulation(null);
    setError('');
    try {
      const sim = await simulateBodyshopSchedule({
        bodyworkHours: bodyworkH,
        prepHours:     prepH,
        paintHours:    paintH,
        workshopId,
        startDate:     date,
        startTime:     timeStart ? timeStart.substring(0, 5) : '08:00',
      });
      setSimulation(sim);
    } catch {
      setError('Error al simular el cronograma. Verificá la conexión con el servidor.');
    } finally {
      setSimulating(false);
    }
  }

  async function handleConfirm() {
    if (isSubmitting) return;
    setError('');
    if (totalH === 0) { setError('Ingresá las horas del presupuesto en al menos un proceso.'); return; }
    setIsSubmitting(true);
    try {
      const effectiveAdvisorCode = dmsAdvisorCode || advisorCode || null;
      const effectiveAdvisorName = dmsAdvisorCode ? dmsAdvisorName : (advisorName || null);
      const result = await create.mutateAsync({
        workshopId,
        date,
        workTypeId:    null,
        customerName,
        plate:         plate.toUpperCase(),
        status:        'scheduled',
        bodyworkHours: bodyworkH,
        prepHours:     prepH,
        paintHours:    paintH,
        channel,
        timeStart:     timeStart             || null,
        advisorCode:   effectiveAdvisorCode,
        advisorName:   effectiveAdvisorName,
        dmsSucursalId: dmsSucursalId ?? advisorSucursalId ?? null,
        notes,
        budgetNumber:  budgetNumber.trim() || null,
      } as any);
      const dmsResult = (result as any).dmsSync as { success: boolean; dmsId?: string; error?: string } | null | undefined;

      setConfirmData({
        type: 'bodyshop',
        workshopName: workshop?.name,
        date,
        customerName,
        plate: plate.toUpperCase(),
        chassis,
        vehicleType,
        cedula,
        ruc,
        telPrincipal,
        celular,
        telOficina,
        address,
        budgetNumber:  budgetNumber.trim() || undefined,
        stayDays:      (result as any).stayDays ?? 1,
        bodyworkHours: bodyworkH,
        prepHours:     prepH,
        paintHours:    paintH,
        channel,
        notes: notes || undefined,
        processTechs: result.processTechs ? {
          BODYWORK: result.processTechs.BODYWORK?.technician?.name,
          PREP:     result.processTechs.PREP?.technician?.name,
          PAINT:    result.processTechs.PAINT?.technician?.name,
        } : undefined,
        dmsAdvisorCode: effectiveAdvisorCode ?? undefined,
        dmsAdvisorName: effectiveAdvisorName ?? undefined,
        dmsSync: dmsResult ?? null,
      });
    } catch (err: any) {
      // The backend may return HTTP 500 even though the entry was created
      // (known bug: workTypeId null triggers a post-save exception).
      // Before showing an error, verify via GET whether the entry actually exists.
      const isServerError = /500|servidor|server/i.test(err?.message ?? '');
      if (isServerError) {
        try {
          const entries = await getBodyshopEntriesByRange(workshopId, date, date);
          const created = entries.find(
            e => e.plate?.toUpperCase() === plate.toUpperCase() && e.customerName === customerName,
          );
          if (created) {
            // Entry exists — show success modal with whatever data we have
            const effectiveAdvisorCode = dmsAdvisorCode || advisorCode || null;
            const effectiveAdvisorName = dmsAdvisorCode ? dmsAdvisorName : (advisorName || null);
            setConfirmData({
              type: 'bodyshop',
              workshopName: workshop?.name,
              date,
              customerName,
              plate: plate.toUpperCase(),
              chassis,
              vehicleType,
              cedula,
              ruc,
              telPrincipal,
              celular,
              telOficina,
              address,
              budgetNumber:  budgetNumber.trim() || undefined,
              stayDays:      (created as any).stayDays ?? 1,
              bodyworkHours: bodyworkH,
              prepHours:     prepH,
              paintHours:    paintH,
              channel,
              notes: notes || undefined,
              processTechs: created.processTechs ? {
                BODYWORK: created.processTechs.BODYWORK?.technician?.name,
                PREP:     created.processTechs.PREP?.technician?.name,
                PAINT:    created.processTechs.PAINT?.technician?.name,
              } : undefined,
              dmsAdvisorCode: effectiveAdvisorCode ?? undefined,
              dmsAdvisorName: effectiveAdvisorName ?? undefined,
              dmsSync: null,
            });
            return;
          }
        } catch {
          // Verification GET failed — fall through to show the original error
        }
      }
      const data = err?.response?.data ?? err?.data ?? err;
      const msg  = data?.message ?? data?.error ?? err?.message;
      setError(Array.isArray(msg) ? msg.join(' · ') : (msg || 'Error al registrar el ingreso'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVehicleLookup() {
    const value = searchValue.trim().toUpperCase();
    if (!value) return;
    if (!looksLikePlateOrChassis(value)) {
      setSearchError('Eso no parece una chapa ni un chasis (¿será un número de OT o de cliente?). La chapa lleva letras, ej: AACA898.');
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const res  = await fetch(`/api/vehicle-lookup?plate=${encodeURIComponent(value)}`);
      if (res.status === 404) { setSearchError('Vehículo no encontrado en DMS'); return; }
      if (!res.ok)            { setSearchError('Error al conectar con DMS'); return; }
      const data = await res.json();
      if (data.found) {
        setPlate(data.vehicle.plate);             setChassis(data.vehicle.chassis);
        setVehicleType(data.vehicle.vehicleType); setEngine(data.vehicle.engine);
        setMileage(data.vehicle.mileage);         setRegistrationDate(data.vehicle.registrationDate);
        setLastService(data.vehicle.lastService);
        setCustomerName(data.customer.customerName);   setCustomerNumber(data.customer.customerNumber);
        setCedula(data.customer.cedula);               setRuc(data.customer.ruc);
        setTelPrincipal(data.customer.telPrincipal);   setTelOficina(data.customer.telOficina);
        setCelular(data.customer.celular);             setAddress(data.customer.address);
      }
    } catch { setSearchError('Error de conexión'); }
    finally  { setSearching(false); }
  }

  const step1Valid = !!(customerName.trim() && plate.trim());
  const step2Valid = totalH > 0;

  return (
    <>
      <BookingConfirmModal
        data={confirmData}
        onClose={() => setConfirmData(null)}
        onViewSchedule={() => router.push(`/appointments?date=${date}`)}
        onNewBooking={() => { setConfirmData(null); router.push('/appointments/new'); }}
      />

      {/* DMS Toast */}
      {dmsToast && (
        <div className={`fixed top-4 right-4 z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium max-w-sm transition-all
          ${dmsToast.type === 'success'
            ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
            : 'bg-red-50 border-red-300 text-red-800'}`}>
          <span className="text-lg leading-none mt-0.5">{dmsToast.type === 'success' ? '✓' : '!'}</span>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-xs uppercase tracking-wide mb-0.5">{dmsToast.type === 'success' ? 'DMS OK' : 'Error DMS'}</p>
            <p className="text-xs font-normal break-words">{dmsToast.msg}</p>
          </div>
          <button type="button" onClick={() => setDmsToast(null)} className="text-current opacity-50 hover:opacity-100 text-base leading-none ml-1">×</button>
        </div>
      )}

      <div className="flex flex-col h-full bg-slate-50">
        {/* Header with step indicator */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4">
          <button type="button"
            onClick={() => step > 1 ? setStep((step - 1) as 1 | 2 | 3) : router.back()}
            className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <ArrowLeft className="h-4 w-4 text-slate-500" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-slate-900">Nuevo Ingreso</h1>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700">BODYSHOP</span>
            </div>
            <p className="text-xs text-slate-500">Registrá el ingreso del vehículo al taller de carrocería</p>
          </div>
          <div className="flex items-center gap-1.5">
            {([1, 2, 3] as const).map((s, idx) => (
              <div key={s} className="flex items-center gap-1.5">
                {idx > 0 && <div className="h-px w-5 bg-slate-200" />}
                <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                  ${s === step ? 'bg-orange-600 text-white shadow-sm' : s < step ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                  {s < step ? '✓' : s}
                </div>
                <span className={`text-[11px] font-semibold hidden sm:block whitespace-nowrap ${s === step ? 'text-orange-700' : 'text-slate-400'}`}>
                  {s === 1 ? 'Vehículo' : s === 2 ? 'Trabajos' : 'Agenda'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">

          {/* ──────────────── STEP 1: Vehicle + Customer ──────────────────── */}
          {step === 1 && (
            <div className="max-w-2xl mx-auto space-y-5">
              {/* DMS search */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center gap-2">
                  <Car className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Búsqueda en DMS</span>
                </div>
                <div className="px-5 py-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Chapa o Chasis</label>
                    <p className="text-xs text-slate-400">Ingresá la chapa (ej: AACA898) o el número de chasis (ej: 9BD186DZ0LB035786)</p>
                    <div className="flex gap-2">
                      <Input value={searchValue} onChange={e => setSearchValue(e.target.value.toUpperCase())}
                        onKeyDown={e => e.key === 'Enter' && handleVehicleLookup()}
                        placeholder="AACA898 · 9BD186DZ0LB035786" className="uppercase" />
                      <button type="button" onClick={() => handleVehicleLookup()}
                        disabled={searching || !searchValue.trim()}
                        className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-60 flex-shrink-0 hover:bg-blue-700 transition-colors">
                        {searching ? '...' : 'Buscar'}
                      </button>
                    </div>
                  </div>
                </div>
                {searchError && <div className="px-5 pb-4"><Alert variant="danger"><p>{searchError}</p></Alert></div>}
              </div>

              {/* Vehicle data */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center gap-2">
                  <Car className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Datos del vehículo</span>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Chapa / Matrícula" required>
                      <Input value={plate} onChange={e => setPlate(e.target.value.toUpperCase())} placeholder="AACA898" className="uppercase" />
                    </Field>
                    <Field label="Chasis">
                      <Input value={chassis} onChange={e => setChassis(e.target.value.toUpperCase())} placeholder="9BD..." className="uppercase" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Tipo de vehículo">
                      <Input value={vehicleType} onChange={e => setVehicleType(e.target.value)} placeholder="Sedan" />
                    </Field>
                    <Field label="Año modelo">
                      <Input value={modelYear} onChange={e => setModelYear(e.target.value)} placeholder="2020" />
                    </Field>
                    <Field label="Motor">
                      <Input value={engine} onChange={e => setEngine(e.target.value)} placeholder="1.6L" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Kilometraje">
                      <Input value={mileage} onChange={e => setMileage(e.target.value)} placeholder="45000" />
                    </Field>
                    <Field label="Último servicio">
                      <Input value={lastService} onChange={e => setLastService(e.target.value)} placeholder="2023-08-15" />
                    </Field>
                  </div>
                </div>
              </div>

              {/* Customer data */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Datos del cliente</span>
                </div>
                <div className="px-5 py-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Nombre del cliente" required>
                      <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Juan Pérez" />
                    </Field>
                    <Field label="Nro. cliente">
                      <Input value={customerNumber} onChange={e => setCustomerNumber(e.target.value)} placeholder="C-00123" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Cédula">
                      <Input value={cedula} onChange={e => setCedula(e.target.value)} placeholder="1234567" />
                    </Field>
                    <Field label="RUC">
                      <Input value={ruc} onChange={e => setRuc(e.target.value)} placeholder="80012345-8" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Tel. principal">
                      <PhoneInput value={telPrincipal} onChange={setTelPrincipal} />
                    </Field>
                    <Field label="Celular">
                      <PhoneInput value={celular} onChange={setCelular} />
                    </Field>
                    <Field label="Tel. oficina">
                      <PhoneInput value={telOficina} onChange={setTelOficina} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Email">
                      <Input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="juan@mail.com" />
                    </Field>
                    <Field label="Dirección">
                      <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Av. República 123" />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button type="button" disabled={!step1Valid} onClick={() => setStep(2)}
                  className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors shadow-sm">
                  Siguiente: Trabajos <CheckCircle2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ──────────────── STEP 2: Horas del presupuesto ────────────── */}
          {step === 2 && (
            <div className="max-w-xl mx-auto space-y-5">

              {/* Número de presupuesto */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Número de presupuesto</span>
                </div>
                <div className="px-5 py-4">
                  <Input
                    type="text"
                    placeholder="Ej: 2024-001, PRE-5523..."
                    value={budgetNumber}
                    onChange={e => setBudgetNumber(e.target.value)}
                    className="text-sm font-semibold"
                    autoFocus
                  />
                </div>
              </div>

              {/* Hours stepper */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Horas del presupuesto</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {([
                    { key: 'bodywork', label: 'Chapería',    color: 'blue',   val: directBodyworkHours, set: setDirectBodyworkHours },
                    { key: 'prep',     label: 'Preparación', color: 'violet', val: directPrepHours,     set: setDirectPrepHours     },
                    { key: 'paint',    label: 'Pintura',     color: 'orange', val: directPaintHours,    set: setDirectPaintHours    },
                  ] as const).map(({ key, label, color, val, set }) => {
                    const parsed = parseFloat(val) || 0;
                    const adjust = (delta: number) => {
                      const next = Math.max(0, Math.round((parsed + delta) * 2) / 2);
                      set(next === 0 ? '' : String(next));
                      setSimulation(null);
                    };
                    const labelColor = color === 'blue' ? 'text-blue-700' : color === 'violet' ? 'text-violet-700' : 'text-orange-700';
                    const badgeCls   = color === 'blue' ? 'bg-blue-100 text-blue-700' : color === 'violet' ? 'bg-violet-100 text-violet-700' : 'bg-orange-100 text-orange-700';
                    return (
                      <div key={key} className="px-5 py-4 flex items-center gap-4">
                        <div className="w-28 flex-shrink-0">
                          <span className={`text-xs font-bold uppercase tracking-wide ${labelColor}`}>{label}</span>
                        </div>
                        <div className="flex items-center gap-1 flex-1">
                          {/* Minus buttons */}
                          <button type="button" onClick={() => adjust(-1)}
                            className="h-9 w-9 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-600 font-bold text-lg flex items-center justify-center transition-colors select-none"
                            tabIndex={-1}>−</button>
                          <button type="button" onClick={() => adjust(-0.5)}
                            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-500 text-xs font-bold flex items-center justify-center transition-colors select-none"
                            tabIndex={-1}>−½</button>

                          {/* Input central */}
                          <input
                            type="text"
                            inputMode="decimal"
                            value={val}
                            onChange={e => { set(e.target.value); setSimulation(null); }}
                            onKeyDown={e => {
                              if (e.key === 'ArrowUp')   { e.preventDefault(); adjust(0.5); }
                              if (e.key === 'ArrowDown') { e.preventDefault(); adjust(-0.5); }
                            }}
                            placeholder="0"
                            className="w-16 h-9 text-center text-lg font-bold border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white tabular-nums"
                          />

                          {/* Plus buttons */}
                          <button type="button" onClick={() => adjust(0.5)}
                            className="h-9 px-2.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-500 text-xs font-bold flex items-center justify-center transition-colors select-none"
                            tabIndex={-1}>+½</button>
                          <button type="button" onClick={() => adjust(1)}
                            className="h-9 w-9 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-600 font-bold text-lg flex items-center justify-center transition-colors select-none"
                            tabIndex={-1}>+</button>

                          <span className="text-sm text-slate-400 font-medium ml-1">h</span>
                          {parsed > 0 && (
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ml-1 ${badgeCls}`}>{parsed.toFixed(1)}h</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Total */}
                {totalH > 0 && (
                  <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <span className="text-xs text-slate-500 font-semibold">Total presupuesto</span>
                    <span className="text-xl font-bold text-slate-900">{totalH.toFixed(1)}h</span>
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-5 py-3">
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Notas (opcional)</span>
                </div>
                <div className="px-5 py-4">
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    placeholder="Observaciones del presupuesto, trabajo especial, etc."
                    rows={3}
                    className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300 text-slate-700"
                  />
                </div>
              </div>

              {error && <Alert variant="danger"><p>{error}</p></Alert>}

              <div className="flex justify-between">
                <button type="button" onClick={() => { setStep(1); setError(''); }}
                  className="flex items-center gap-2 px-5 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl transition-colors text-sm">
                  <ArrowLeft className="h-4 w-4" /> Volver
                </button>
                <button type="button" disabled={!step2Valid} onClick={() => { setStep(3); setError(''); }}
                  className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors shadow-sm">
                  Siguiente: Agenda <CheckCircle2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* ──────────────── STEP 3: Date + Schedule + Confirm ───────────── */}
          {step === 3 && (
            <div className="max-w-2xl mx-auto space-y-5">
              {/* Date + channel */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center gap-2">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Fecha y Canal</span>
                </div>
                <div className="px-5 py-4 grid grid-cols-2 gap-4">
                  <Field label="Fecha de ingreso" required>
                    <Input type="date" value={date} onChange={e => { setDate(e.target.value); setSimulation(null); }} />
                  </Field>
                  <Field label="Canal de ingreso">
                    <Select value={channel} onValueChange={v => setChannel(v as BodyshopChannel)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CHANNEL_OPTIONS.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
                <div className="px-5 pb-4">
                  <Field label="Hora de ingreso">
                    <Select value={timeStart || '__none__'} onValueChange={v => setTimeStart(v === '__none__' ? '' : v)}>
                      <SelectTrigger><SelectValue placeholder="Sin hora (opcional)" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Sin hora</SelectItem>
                        {Array.from({ length: 24 }, (_, i) => {
                          const h = Math.floor(i / 2) + 7;
                          const m = i % 2 === 0 ? '00' : '30';
                          if (h >= 19) return null;
                          const val = `${String(h).padStart(2, '0')}:${m}:00`;
                          return <SelectItem key={val} value={val}>{String(h).padStart(2, '0')}:{m}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </div>

              {/* DMS Agendamiento */}
              {(dmsAsesores.length > 0 || dmsAsesoresLoading) && (
                <div className="bg-white rounded-xl border border-indigo-200 shadow-sm overflow-hidden">
                  <div className="bg-indigo-900 px-5 py-3 flex items-center gap-2">
                    <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Integración DMS</span>
                    <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold ml-auto">Condor</span>
                  </div>
                  <div className={`px-5 py-4 gap-4 ${dmsSucursales.length > 0 ? 'grid grid-cols-2' : ''}`}>
                    {dmsSucursales.length > 0 && (
                      <Field label="Sucursal DMS">
                        <Select
                          value={dmsSucursalId ?? '__none__'}
                          onValueChange={v => {
                            setDmsSucursalId(v === '__none__' ? null : v);
                            setDmsAdvisorCode('');
                            setDmsAdvisorName('');
                          }}
                        >
                          <SelectTrigger><SelectValue placeholder="Seleccioná sucursal" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sin sucursal</SelectItem>
                            {dmsSucursales.map(s => (
                              <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                    )}
                    <Field label="Asesor DMS">
                      <Select
                        value={dmsAdvisorCode || '__none__'}
                        onValueChange={v => {
                          if (v === '__none__') { setDmsAdvisorCode(''); setDmsAdvisorName(''); return; }
                          setDmsAdvisorCode(v);
                          setDmsAdvisorName(dmsAsesores.find(a => a.codigo === v)?.nombre ?? '');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={dmsAsesoresLoading ? 'Cargando...' : 'Seleccioná asesor'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Sin asesor</SelectItem>
                          {dmsAsesores.map((a, i) => (
                            <SelectItem key={`${a.codigo}__${i}`} value={a.codigo}>{a.nombre} ({a.codigo})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  {dmsAdvisorCode && (
                    <div className="px-5 pb-4">
                      <p className="text-[11px] text-indigo-500 flex items-center gap-1.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                        Al confirmar se creará el turno en Condor DMS con asesor {dmsAdvisorCode}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Advisor picker */}
              {(advisorSlots.length > 0 || advisorSlotsLoading) && (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <AdvisorReceptionPicker
                    dmsSlots={advisorSlots}
                    dmsLoading={advisorSlotsLoading}
                    selectedAdvisorCode={advisorCode}
                    onAdvisorSelect={(code, name, sucId) => { setAdvisorCode(code); setAdvisorName(name); setAdvisorSucursalId(sucId); }}
                    selectedSlot={timeStart}
                    onSlotSelect={setTimeStart}
                    date={date}
                  />
                </div>
              )}

              {/* Schedule simulation */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="bg-slate-900 px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Simulación de Agenda</span>
                  </div>
                  <button type="button" onClick={handleSimulate} disabled={simulating || !date}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg transition-colors">
                    {simulating ? (
                      <><svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg> Simulando...</>
                    ) : <><CalendarDays className="h-3 w-3" /> Simular agenda</>}
                  </button>
                </div>
                <div className="px-5 py-4">
                  {!simulation ? (
                    <p className="text-xs text-slate-400 italic">Hacé clic en "Simular agenda" para ver el cronograma estimado con las horas del presupuesto.</p>
                  ) : (
                    <div className="space-y-3">
                      {simulation.warnings.map((w, i) => <Alert key={i} variant="warning"><p className="text-xs">{w}</p></Alert>)}
                      {(!simulation.slots || simulation.slots.length === 0) ? (
                        <Alert variant="danger"><p>Sin disponibilidad en los próximos {90} días.</p></Alert>
                      ) : (
                        <>
                          {/* Group slots by process */}
                          {(['BODYWORK', 'PREP', 'PAINT'] as const).map(code => {
                            const procSlots = simulation.slots.filter(s => s.process === code);
                            if (procSlots.length === 0) return null;
                            const procLabel  = code === 'BODYWORK' ? 'Chapería' : code === 'PREP' ? 'Preparación' : 'Pintura';
                            const dotColor   = code === 'BODYWORK' ? 'bg-blue-500' : code === 'PREP' ? 'bg-violet-500' : 'bg-orange-500';
                            const totalHours = procSlots.reduce((s, p) => s + p.hours, 0);
                            return (
                              <div key={code} className="rounded-xl bg-slate-50 border border-slate-100 p-3 space-y-1.5">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full ${dotColor}`} />
                                    <span className="text-xs font-bold text-slate-700">{procLabel}</span>
                                  </div>
                                  <span className="text-xs font-bold text-slate-900">{totalHours.toFixed(1)}h total</span>
                                </div>
                                {procSlots.map((s, i) => (
                                  <div key={i} className="flex items-center justify-between text-xs text-slate-500 pl-4">
                                    <span className="capitalize">{format(parseISO(s.date + 'T12:00:00'), "EEE d MMM", { locale: es })}</span>
                                    <span>{s.timeStart}–{s.timeEnd} <span className="font-semibold text-slate-700">({s.hours.toFixed(1)}h)</span></span>
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                          {simulation.estimatedFinishDate && (
                            <div className="border-t border-slate-200 pt-3 flex items-center justify-between text-xs">
                              <span className="text-slate-500 font-semibold">Entrega estimada</span>
                              <span className="font-bold text-emerald-700 text-sm">
                                {format(parseISO(simulation.estimatedFinishDate + 'T12:00:00'), "EEE d 'de' MMMM", { locale: es })}
                              </span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {error && <Alert variant="danger"><p>{error}</p></Alert>}

              <div className="flex justify-between">
                <button type="button" onClick={() => { setStep(2); setError(''); }}
                  className="flex items-center gap-2 px-5 py-3 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold rounded-xl transition-colors text-sm">
                  <ArrowLeft className="h-4 w-4" /> Volver
                </button>
                <button type="button" disabled={isSubmitting || create.isPending || !customerName || !plate}
                  onClick={handleConfirm}
                  className="flex items-center gap-2 px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors shadow-sm">
                  {isSubmitting || create.isPending ? 'Guardando...' : <><CheckCircle2 className="h-4 w-4" /> Confirmar Ingreso</>}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}


// ─── Technician Picker ────────────────────────────────────────────────────────

// Color por especialidad — matching da color propio, no-matching queda gris
const SPECIALTY_THEME: Record<string, { badge: string; ring: string; avatar: string }> = {
  'Motor':             { badge: 'bg-blue-100 text-blue-700 border-blue-200',     ring: 'border-blue-400 bg-blue-50 shadow-blue-100',    avatar: 'from-blue-500 to-blue-700'    },
  'Frenos/Suspensión': { badge: 'bg-orange-100 text-orange-700 border-orange-200', ring: 'border-orange-400 bg-orange-50 shadow-orange-100', avatar: 'from-orange-500 to-orange-700' },
  'Electricidad':      { badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', ring: 'border-yellow-400 bg-yellow-50 shadow-yellow-100', avatar: 'from-yellow-500 to-yellow-600' },
  'Aire/Diagnóstico':  { badge: 'bg-cyan-100 text-cyan-700 border-cyan-200',     ring: 'border-cyan-400 bg-cyan-50 shadow-cyan-100',    avatar: 'from-cyan-500 to-cyan-700'    },
  'Express':           { badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', ring: 'border-emerald-400 bg-emerald-50 shadow-emerald-100', avatar: 'from-emerald-500 to-emerald-700' },
  'CHAPERIA':          { badge: 'bg-rose-100 text-rose-700 border-rose-200',     ring: 'border-rose-400 bg-rose-50 shadow-rose-100',    avatar: 'from-rose-500 to-rose-700'    },
  'PREPARACION':       { badge: 'bg-violet-100 text-violet-700 border-violet-200', ring: 'border-violet-400 bg-violet-50 shadow-violet-100', avatar: 'from-violet-500 to-violet-700' },
  'PINTURA':           { badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', ring: 'border-indigo-400 bg-indigo-50 shadow-indigo-100', avatar: 'from-indigo-500 to-indigo-700' },
};

const DEFAULT_THEME = { badge: 'bg-slate-100 text-slate-600 border-slate-200', ring: 'border-slate-200 bg-white', avatar: 'from-slate-400 to-slate-600' };

function getTheme(specialty?: string | null) {
  return (specialty && SPECIALTY_THEME[specialty]) || DEFAULT_THEME;
}

interface TechnicianPickerProps {
  technicians: { id: string; name: string; specialty?: string | null }[];
  selectedId: string;
  capacity: { technicianId: string; availableHours: number; usedHours?: number; isWorkingDay?: boolean }[];
  serviceHours: number;
  serviceSpecialty?: string | null;
  onSelect: (id: string) => void;
  hasError?: boolean;
}

function TechnicianPicker({ technicians, selectedId, capacity, serviceHours, serviceSpecialty, onSelect, hasError }: TechnicianPickerProps) {
  // Matching primero, luego disponibles, luego no-laboran
  const sorted = [...technicians].sort((a, b) => {
    const aMatch = serviceSpecialty ? a.specialty === serviceSpecialty : true;
    const bMatch = serviceSpecialty ? b.specialty === serviceSpecialty : true;
    if (aMatch !== bMatch) return aMatch ? -1 : 1;
    return 0;
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={`text-xs font-semibold uppercase tracking-wide ${hasError ? 'text-red-600' : 'text-slate-600'}`}>
          Técnico disponible<span className="text-red-500 ml-0.5">*</span>{hasError && <span className="ml-1 normal-case font-normal">— requerido</span>}
        </label>
        {serviceSpecialty && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getTheme(serviceSpecialty).badge}`}>
            Especialidad requerida: {serviceSpecialty}
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-slate-400 italic py-2">Sin técnicos disponibles para esta fecha</p>
      ) : (
        <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${hasError ? 'rounded-xl ring-2 ring-red-300 ring-offset-2 p-2 bg-red-50/30' : ''}`}>
          {sorted.map(tech => {
            const cap           = capacity.find(c => c.technicianId === tech.id);
            const totalHours    = cap?.availableHours ?? 0;
            const usedHours     = cap?.usedHours ?? 0;
            const freeHours     = totalHours - usedHours;
            const pctUsed       = totalHours > 0 ? (usedHours / totalHours) * 100 : 0;
            const wouldOverload = serviceHours > 0 && freeHours < serviceHours;
            const isSelected    = tech.id === selectedId;
            const isUnavailable = !cap?.isWorkingDay || totalHours === 0;
            const isMatch       = !serviceSpecialty || tech.specialty === serviceSpecialty;
            const isMismatch    = !!serviceSpecialty && !!tech.specialty && tech.specialty !== serviceSpecialty;

            const theme   = getTheme(tech.specialty);
            const initials = tech.name.split(' ').slice(0, 2).map(n => n[0]).join('');

            const barColor =
              freeHours <= 1 ? 'bg-red-500' :
              freeHours <= 2 ? 'bg-amber-400' :
              'bg-emerald-400';

            const hoursLabel =
              isUnavailable ? 'No labora' :
              freeHours <= 0 ? `${usedHours.toFixed(1)}h / ${totalHours.toFixed(1)}h` :
              `${usedHours.toFixed(1)}h / ${totalHours.toFixed(1)}h`;

            const hoursColor =
              isUnavailable || freeHours <= 0 ? 'text-slate-400' :
              freeHours <= 1 ? 'text-red-600 font-bold' :
              freeHours <= 2 ? 'text-amber-600 font-semibold' :
              'text-emerald-600 font-semibold';

            // Border/background del card según estado
            const cardCls = isSelected
              ? `border-2 ${theme.ring} shadow-sm`
              : isUnavailable
              ? 'border-2 border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
              : isMismatch
              ? 'border-2 border-slate-200 bg-slate-50/60 hover:border-slate-300 cursor-pointer opacity-70'
              : isMatch && serviceSpecialty
              ? `border-2 ${theme.ring} hover:shadow-sm cursor-pointer`
              : wouldOverload
              ? 'border-2 border-amber-200 bg-white hover:border-amber-400 hover:shadow-sm cursor-pointer'
              : 'border-2 border-slate-200 bg-white hover:border-blue-300 hover:shadow-sm cursor-pointer';

            return (
              <button
                key={tech.id}
                type="button"
                disabled={isUnavailable}
                onClick={() => onSelect(tech.id)}
                className={`relative text-left rounded-xl p-3 transition-all ${cardCls}`}
              >
                {/* Checkmark cuando seleccionado */}
                {isSelected && (
                  <span className="absolute top-2 right-2 h-4 w-4 rounded-full bg-blue-600 flex items-center justify-center">
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                )}

                {/* Icono de advertencia: sobrecarga o especialidad diferente */}
                {!isSelected && !isUnavailable && (wouldOverload || isMismatch) && (
                  <span className="absolute top-2 right-2">
                    <AlertTriangle className={`h-3.5 w-3.5 ${isMismatch ? 'text-orange-400' : 'text-amber-500'}`} />
                  </span>
                )}

                {/* Icono match de especialidad */}
                {!isSelected && isMatch && serviceSpecialty && !isUnavailable && (
                  <span className="absolute top-2 right-2">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  </span>
                )}

                <div className="flex items-start gap-2.5">
                  <div className={`h-9 w-9 rounded-xl bg-gradient-to-br ${theme.avatar} flex items-center justify-center flex-shrink-0 shadow-sm ${isMismatch ? 'opacity-50 grayscale' : ''}`}>
                    <span className="text-xs font-bold text-white">{initials}</span>
                  </div>

                  <div className="min-w-0 flex-1 pr-4">
                    <p className={`text-xs font-bold truncate leading-tight ${isUnavailable || isMismatch ? 'text-slate-400' : 'text-slate-800'}`}>
                      {tech.name.split(' ')[0]}
                    </p>

                    {tech.specialty ? (
                      <span className={`inline-flex items-center gap-0.5 mt-0.5 text-[9px] font-semibold px-1.5 py-0.5 rounded-md border leading-none ${isMismatch ? 'bg-slate-100 text-slate-400 border-slate-200' : theme.badge}`}>
                        <Wrench className="h-2 w-2" />
                        {tech.specialty}
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-300 mt-0.5 block">Sin especialidad</span>
                    )}
                  </div>
                </div>

                {/* Barra de horas */}
                {!isUnavailable && (
                  <div className="mt-2.5 space-y-1">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pctUsed)}%` }} />
                    </div>
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] ${hoursColor}`}>{hoursLabel}</span>
                      {serviceHours > 0 && !wouldOverload && (
                        <span className="text-[9px] text-slate-400">servicio: {serviceHours}h</span>
                      )}
                      {serviceHours > 0 && wouldOverload && (
                        <span className="text-[9px] text-amber-600 font-semibold">necesita {serviceHours}h</span>
                      )}
                    </div>
                  </div>
                )}

                {isUnavailable && <p className="text-[10px] text-slate-400 mt-1.5">{hoursLabel}</p>}

                {/* Label especialidad diferente */}
                {isMismatch && !isUnavailable && (
                  <p className="text-[9px] text-orange-500 font-semibold mt-1">Especialidad diferente</p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

export default function NewAppointmentPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-400 text-sm">Cargando...</div>}>
      <FormRouter />
    </Suspense>
  );
}

function Field({ label, children, error, required }: { label: string; children: React.ReactNode; error?: boolean; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label className={`text-xs font-semibold uppercase tracking-wide ${error ? 'text-red-600' : 'text-slate-600'}`}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
        {error && <span className="ml-1 normal-case font-normal">— requerido</span>}
      </label>
      {children}
    </div>
  );
}

function errCls(active: boolean) {
  return active ? 'border-red-400 bg-red-50 focus-visible:ring-red-400' : '';
}

type AlertVariant = 'warning' | 'danger' | 'orange';

function Alert({ variant, children }: { variant: AlertVariant; children: React.ReactNode }) {
  const styles: Record<AlertVariant, string> = {
    warning: 'border-amber-300 bg-amber-50 text-amber-800',
    danger:  'border-red-300 bg-red-50 text-red-800',
    orange:  'border-orange-300 bg-orange-50 text-orange-900',
  };
  const iconColor: Record<AlertVariant, string> = {
    warning: 'text-amber-500', danger: 'text-red-500', orange: 'text-orange-500',
  };
  return (
    <div className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 ${styles[variant]}`}>
      <AlertTriangle className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconColor[variant]}`} />
      <div className="text-xs flex-1">{children}</div>
    </div>
  );
}


// ─── Picker de Asesor de Recepción ───────────────────────────────────────────
// Muestra TODOS los asesores DMS disponibles en cache para la fecha.
// Al elegir un asesor se expanden sus slots; al elegir un slot se propaga
// la hora al formulario padre.

function AdvisorReceptionPicker({
  dmsSlots,
  dmsLoading,
  selectedAdvisorCode,
  onAdvisorSelect,
  selectedSlot,
  onSlotSelect,
  date,
}: {
  dmsSlots: DmsAdvisor[];
  dmsLoading: boolean;
  selectedAdvisorCode: string;
  onAdvisorSelect: (code: string, name: string, sucursalId: string) => void;
  selectedSlot?: string;
  onSlotSelect?: (timeStart: string) => void;
  date?: string;
}) {
  const _pickerNow = new Date();
  const _pickerToday = formatDate(_pickerNow);
  const _pickerNowMin = _pickerNow.getHours() * 60 + _pickerNow.getMinutes();
  const isPickerToday = date === _pickerToday;

  const selectedDms = dmsSlots.find(a => a.advisorCode === selectedAdvisorCode);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-100">
        <div className="h-6 w-6 rounded-md bg-indigo-50 flex items-center justify-center">
          <UserCheck className="h-3.5 w-3.5 text-indigo-600" />
        </div>
        <span className="text-sm font-semibold text-slate-900">Asesor de Recepción</span>
        {selectedSlot && selectedAdvisorCode && (
          <span className="ml-auto text-xs text-indigo-600 font-medium">
            {selectedDms?.advisorName} — {selectedSlot.slice(0, 5)}
          </span>
        )}
        {dmsLoading && (
          <svg className="h-3.5 w-3.5 animate-spin text-slate-400 ml-auto" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
      </div>

      <div className="px-5 py-4 space-y-4">
        {!dmsLoading && dmsSlots.length === 0 && (
          <p className="text-xs text-slate-400">Sin datos de asesores DMS para esta fecha.</p>
        )}

        {/* Lista de todos los asesores */}
        <div className="flex flex-wrap gap-2">
          {dmsSlots.map(advisor => {
            const isSelected = advisor.advisorCode === selectedAdvisorCode;
            const effectiveFree = isPickerToday
              ? advisor.slots.filter(s => !s.isOccupied && timeToMinutes(s.timeStart.slice(0, 5)) > _pickerNowMin).length
              : advisor.freeSlots;
            const hasFree    = effectiveFree > 0;
            return (
              <button
                key={`${advisor.advisorCode}__${advisor.sucursalId ?? ''}`}
                type="button"
                onClick={() => onAdvisorSelect(isSelected ? '' : advisor.advisorCode, advisor.advisorName, isSelected ? '' : (advisor.sucursalId ?? ''))}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                  isSelected
                    ? 'border-indigo-400 bg-indigo-50 text-indigo-800 ring-1 ring-indigo-400'
                    : hasFree
                    ? 'border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700'
                    : 'border-red-200 bg-red-50 text-red-700 opacity-60'
                }`}
              >
                <span>{advisor.advisorName}</span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                  hasFree ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                }`}>
                  {hasFree ? `${effectiveFree} libre${effectiveFree !== 1 ? 's' : ''}` : 'lleno'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Slots del asesor seleccionado */}
        {selectedDms && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
              Horarios de {selectedDms.advisorName}
              {selectedSlot && (
                <span className="ml-2 normal-case font-normal text-indigo-600">
                  · seleccionado: {selectedSlot.slice(0, 5)}
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedDms.slots.map((slot, idx) => {
                const isChosen  = selectedSlot === slot.timeStart;
                const slotPast  = isPickerToday && timeToMinutes(slot.timeStart.slice(0, 5)) <= _pickerNowMin;
                return slot.isOccupied || slotPast ? (
                  <span
                    key={`${slot.timeStart}-${idx}`}
                    className={`text-xs px-2 py-1 rounded-md font-medium line-through opacity-50 ${
                      slot.isOccupied ? 'bg-red-100 text-red-400' : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {slot.timeStart.slice(0, 5)}
                  </span>
                ) : (
                  <button
                    key={`${slot.timeStart}-${idx}`}
                    type="button"
                    onClick={() => onSlotSelect?.(isChosen ? '' : slot.timeStart)}
                    className={`text-xs px-2 py-1 rounded-md font-medium transition-all ${
                      isChosen
                        ? 'bg-indigo-600 text-white ring-2 ring-indigo-400'
                        : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 hover:scale-105'
                    }`}
                  >
                    {slot.timeStart.slice(0, 5)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
