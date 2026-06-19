import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class UsersController {
  constructor(private service: UsersService) {}

  @Get()
  async findAll() {
    return { data: await this.service.findAll(), meta: { timestamp: new Date().toISOString() } };
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    return { data: await this.service.create(dto), meta: { timestamp: new Date().toISOString() } };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return { data: await this.service.update(id, dto), meta: { timestamp: new Date().toISOString() } };
  }
}
