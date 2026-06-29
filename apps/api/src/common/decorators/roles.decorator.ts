import { SetMetadata } from '@nestjs/common';

export type UserRole = 'admin' | 'admin_taller' | 'receptionist' | 'perito';
export const ROLES_KEY = 'roles';
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
