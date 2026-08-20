import { Test, TestingModule } from '@nestjs/testing';
import { WorkshopsController } from '../modules/workshops/workshops.controller';
import { WorkshopsService } from '../modules/workshops/workshops.service';
import { JwtAuthGuard } from '../modules/auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';

describe('WorkshopsController', () => {
  let controller: WorkshopsController;
  let service: jest.Mocked<WorkshopsService>;

  const user = { id: 'user-1', role: 'receptionist', allowedWorkshopIds: ['ws-a'] };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [WorkshopsController],
      providers: [
        {
          provide: WorkshopsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({ id: 'ws-a' }),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<WorkshopsController>(WorkshopsController);
    service = module.get(WorkshopsService);
  });

  it('findAll pasa el usuario autenticado al service', async () => {
    await controller.findAll(user);
    expect(service.findAll).toHaveBeenCalledWith(user);
  });

  it('findOne pasa el id y el usuario autenticado al service', async () => {
    await controller.findOne('ws-a', user);
    expect(service.findOne).toHaveBeenCalledWith('ws-a', user);
  });
});
