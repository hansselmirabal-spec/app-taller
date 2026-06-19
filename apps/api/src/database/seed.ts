import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';

const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL || 'postgresql://taller_user:taller_pass@localhost:5432/taller_db',
  entities: [__dirname + '/../**/*.entity.ts'],
  synchronize: true,
});

async function seed() {
  await AppDataSource.initialize();

  const userRepo = AppDataSource.getRepository('users');
  const techRepo = AppDataSource.getRepository('technicians');
  const stRepo = AppDataSource.getRepository('service_types');

  const adminExists = await userRepo.findOne({ where: { email: 'admin@taller.com' } });
  if (!adminExists) {
    await userRepo.save({
      name: 'Administrador',
      email: 'admin@taller.com',
      passwordHash: await bcrypt.hash('admin1234', 10),
      role: 'admin',
    });
    console.log('Admin created: admin@taller.com / admin1234');
  }

  const recepExists = await userRepo.findOne({ where: { email: 'recepcion@taller.com' } });
  if (!recepExists) {
    await userRepo.save({
      name: 'Recepcion',
      email: 'recepcion@taller.com',
      passwordHash: await bcrypt.hash('recep1234', 10),
      role: 'receptionist',
    });
    console.log('Receptionist created: recepcion@taller.com / recep1234');
  }

  const techCount = await techRepo.count();
  if (techCount === 0) {
    await techRepo.save([
      { name: 'Carlos Gutierrez', dailyHours: 8 },
      { name: 'Marcelo Diaz', dailyHours: 8 },
      { name: 'Roberto Sanchez', dailyHours: 8 },
    ]);
    console.log('3 technicians created');
  }

  const stCount = await stRepo.count();
  if (stCount === 0) {
    await stRepo.save([
      { name: 'Service basico', durationHours: 1.5, color: '#22c55e' },
      { name: 'Service completo', durationHours: 3, color: '#3b82f6' },
      { name: 'Frenos', durationHours: 2, color: '#f59e0b' },
      { name: 'Suspension', durationHours: 4, color: '#ef4444' },
      { name: 'Diagnostico', durationHours: 1, color: '#8b5cf6' },
    ]);
    console.log('5 service types created');
  }

  await AppDataSource.destroy();
  console.log('Seed complete');
}

seed().catch(err => { console.error(err); process.exit(1); });
