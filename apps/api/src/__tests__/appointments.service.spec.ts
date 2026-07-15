import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppointmentsService, UpdateAppointmentDto } from '../modules/appointments/appointments.service';
import { Appointment } from '../modules/appointments/appointment.entity';
import { BodyshopEntry } from '../modules/bodyshop/bodyshop-entry.entity';
import { CapacityService } from '../modules/capacity/capacity.service';
import { ServiceTypesService } from '../modules/service-types/service-types.service';
import { TechniciansService } from '../modules/technicians/technicians.service';
import { WorkshopsService } from '../modules/workshops/workshops.service';
import { DmsSyncService } from '../modules/dms-sync/dms-sync.service';
import { TrackingService } from '../modules/tracking/tracking.service';

const mockAppointment: Partial<Appointment> = {
  id: 'appt-1',
  date: '2025-07-15',
  timeStart: '09:00',
  timeEnd: '10:00',
  customerName: 'Juan Perez',
  plate: 'ABC123',
  status: 'scheduled',
  createdBy: 'user-receptionist-1',
};

const adminUser = { id: 'user-admin-1', role: 'admin' };
const receptionistUser = { id: 'user-receptionist-1', role: 'receptionist' };
const otherReceptionist = { id: 'user-receptionist-2', role: 'receptionist' };

function makeQb(returnValue: any[] = []) {
  const qb: any = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(returnValue),
    getCount: jest.fn().mockResolvedValue(0),
  };
  return qb;
}

describe('AppointmentsService', () => {
  let service: AppointmentsService;
  let repo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock; find: jest.Mock; createQueryBuilder: jest.Mock };

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: getRepositoryToken(Appointment), useValue: repo },
        { provide: getRepositoryToken(BodyshopEntry), useValue: { find: jest.fn().mockResolvedValue([]), createQueryBuilder: jest.fn() } },
        { provide: CapacityService, useValue: {} },
        { provide: ServiceTypesService, useValue: {} },
        { provide: TechniciansService, useValue: { findOne: jest.fn(), findAll: jest.fn() } },
        { provide: WorkshopsService,   useValue: { findOne: jest.fn(), findByName: jest.fn() } },
        { provide: DmsSyncService,  useValue: { pushToAgendamiento: jest.fn().mockResolvedValue(undefined) } },
        { provide: TrackingService, useValue: { initForMechanic: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  describe('update()', () => {
    const dto: UpdateAppointmentDto = { customerName: 'Carlos Lopez' };

    it('admin puede editar cualquier turno', async () => {
      repo.findOne.mockResolvedValue({ ...mockAppointment });
      repo.save.mockResolvedValue({ ...mockAppointment, ...dto });

      const result = await service.update('appt-1', dto, adminUser);
      expect(result.customerName).toBe('Carlos Lopez');
    });

    it('recepcionista puede editar su propio turno', async () => {
      repo.findOne.mockResolvedValue({ ...mockAppointment });
      repo.save.mockResolvedValue({ ...mockAppointment, ...dto });

      const result = await service.update('appt-1', dto, receptionistUser);
      expect(result.customerName).toBe('Carlos Lopez');
    });

    it('recepcionista obtiene ForbiddenException al editar turno ajeno', async () => {
      repo.findOne.mockResolvedValue({ ...mockAppointment });

      await expect(service.update('appt-1', dto, otherReceptionist)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza NotFoundException si el turno no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update('nonexistent', dto, adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('delete()', () => {
    it('admin puede cancelar cualquier turno', async () => {
      repo.findOne.mockResolvedValue({ ...mockAppointment });
      repo.save.mockResolvedValue({ ...mockAppointment, status: 'cancelled' });

      const result = await service.delete('appt-1', adminUser);
      expect(result.status).toBe('cancelled');
    });

    it('recepcionista puede cancelar su propio turno', async () => {
      repo.findOne.mockResolvedValue({ ...mockAppointment });
      repo.save.mockResolvedValue({ ...mockAppointment, status: 'cancelled' });

      const result = await service.delete('appt-1', receptionistUser);
      expect(result.status).toBe('cancelled');
    });

    it('recepcionista obtiene ForbiddenException al cancelar turno ajeno', async () => {
      repo.findOne.mockResolvedValue({ ...mockAppointment });

      await expect(service.delete('appt-1', otherReceptionist)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('lanza NotFoundException si el turno no existe', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.delete('nonexistent', adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── BUG #1: findByRange filtra cancelados → kanban pierde cards al refetch ────
  describe('findByRange()', () => {
    it('por defecto excluye turnos cancelados (bug confirmado: kanban pierde card al hacer refetch)', async () => {
      const qb = makeQb([{ ...mockAppointment, status: 'scheduled' }]);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.findByRange('2025-07-01', '2025-07-31');

      const hasCancelledFilter = qb.andWhere.mock.calls.some(
        (args: any[]) => typeof args[0] === 'string' && args[0].includes("status != 'cancelled'"),
      );
      expect(hasCancelledFilter).toBe(true);
    });

    it('con includeAll=true NO aplica filtro de cancelados (fix para kanban)', async () => {
      const appointments = [
        { ...mockAppointment, status: 'scheduled' },
        { ...mockAppointment, id: 'appt-2', status: 'cancelled' },
      ];
      const qb = makeQb(appointments);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.findByRange('2025-07-01', '2025-07-31', undefined, true);

      const hasCancelledFilter = qb.andWhere.mock.calls.some(
        (args: any[]) => typeof args[0] === 'string' && args[0].includes("status != 'cancelled'"),
      );
      expect(hasCancelledFilter).toBe(false);
    });

    it('aplica filtro por workshopName cuando se pasa', async () => {
      const qb = makeQb([{ ...mockAppointment }]);
      repo.createQueryBuilder.mockReturnValue(qb);

      await service.findByRange('2025-07-01', '2025-07-31', 'Taller Central');

      const workshopFilter = qb.andWhere.mock.calls.some(
        (args: any[]) => typeof args[0] === 'string' && args[0].includes('workshopName'),
      );
      expect(workshopFilter).toBe(true);
    });
  });

  // ── BUG #1 contraparte: updateStatus funciona bien — el problema es findByRange ──
  describe('updateStatus()', () => {
    it('puede cambiar estado a "cancelled" correctamente', async () => {
      const appt = { ...mockAppointment };
      repo.findOne.mockResolvedValue(appt);
      repo.save.mockImplementation(async (a: any) => a);

      const result = await service.updateStatus('appt-1', 'cancelled');

      expect(result.status).toBe('cancelled');
      expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }));
    });

    it('puede cambiar estado a "in_progress"', async () => {
      const appt = { ...mockAppointment };
      repo.findOne.mockResolvedValue(appt);
      repo.save.mockImplementation(async (a: any) => a);

      const result = await service.updateStatus('appt-1', 'in_progress');
      expect(result.status).toBe('in_progress');
    });

    it('puede cambiar estado a "done"', async () => {
      const appt = { ...mockAppointment };
      repo.findOne.mockResolvedValue(appt);
      repo.save.mockImplementation(async (a: any) => a);

      const result = await service.updateStatus('appt-1', 'done');
      expect(result.status).toBe('done');
    });

    it('lanza NotFoundException si el turno no existe', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.updateStatus('nonexistent', 'cancelled')).rejects.toThrow(NotFoundException);
    });
  });
});
