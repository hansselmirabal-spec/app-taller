import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from './user.entity';
import { IsEmail, IsString, MinLength, IsEnum, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsString() name: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
  @IsEnum(['admin', 'receptionist']) role: 'admin' | 'receptionist';
}

export class UpdateUserDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() @MinLength(8) password?: string;
  @IsOptional() @IsEnum(['admin', 'receptionist']) role?: 'admin' | 'receptionist';
  @IsOptional() active?: boolean;
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  async findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }

  async findAll() {
    const users = await this.repo.find({ order: { name: 'ASC' } });
    return users.map(({ passwordHash: _, ...u }) => u);
  }

  async create(dto: CreateUserDto) {
    const exists = await this.findByEmail(dto.email);
    if (exists) throw new ConflictException('Email already in use');

    const user = this.repo.create({
      name: dto.name,
      email: dto.email,
      passwordHash: await bcrypt.hash(dto.password, 10),
      role: dto.role,
    });
    const saved = await this.repo.save(user);
    const { passwordHash: _, ...result } = saved;
    return result;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');

    if (dto.name) user.name = dto.name;
    if (dto.role) user.role = dto.role;
    if (dto.active !== undefined) user.active = dto.active;
    if (dto.password) user.passwordHash = await bcrypt.hash(dto.password, 10);

    const saved = await this.repo.save(user);
    const { passwordHash: _, ...result } = saved;
    return result;
  }
}
