import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BodyshopGroup } from './bodyshop-group.entity';
import { BodyshopProcess } from './bodyshop-process.entity';
import { BodyshopWorkGrade } from './bodyshop-grade.entity';
import { BodyshopPiece } from './bodyshop-piece.entity';

@Injectable()
export class BodyshopCatalogService {
  constructor(
    @InjectRepository(BodyshopGroup)     private groups:    Repository<BodyshopGroup>,
    @InjectRepository(BodyshopProcess)   private processes: Repository<BodyshopProcess>,
    @InjectRepository(BodyshopWorkGrade) private grades:    Repository<BodyshopWorkGrade>,
    @InjectRepository(BodyshopPiece)     private pieces:    Repository<BodyshopPiece>,
  ) {}

  // ── Groups ──────────────────────────────────────────────────────────────────

  findGroups() {
    return this.groups.find({ relations: ['pieces'], order: { code: 'ASC' } });
  }

  async createGroup(dto: { code: string; label: string }) {
    const exists = await this.groups.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`Ya existe un grupo con el código ${dto.code}`);
    return this.groups.save(this.groups.create(dto));
  }

  async updateGroup(id: string, dto: { code?: string; label?: string }) {
    const group = await this.groups.findOne({ where: { id } });
    if (!group) throw new NotFoundException('Grupo no encontrado');
    Object.assign(group, dto);
    return this.groups.save(group);
  }

  async deleteGroup(id: string) {
    const group = await this.groups.findOne({ where: { id } });
    if (!group) throw new NotFoundException('Grupo no encontrado');
    await this.groups.remove(group);
  }

  // ── Pieces ──────────────────────────────────────────────────────────────────

  findPieces() {
    return this.pieces.find({ relations: ['group'], order: { code: 'ASC' } });
  }

  async createPiece(dto: { code: string; label: string; groupId?: string | null }) {
    const exists = await this.pieces.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`Ya existe una pieza con el código ${dto.code}`);
    return this.pieces.save(this.pieces.create(dto));
  }

  async updatePiece(id: string, dto: { code?: string; label?: string; groupId?: string | null }) {
    const piece = await this.pieces.findOne({ where: { id } });
    if (!piece) throw new NotFoundException('Pieza no encontrada');
    Object.assign(piece, dto);
    return this.pieces.save(piece);
  }

  async deletePiece(id: string) {
    const piece = await this.pieces.findOne({ where: { id } });
    if (!piece) throw new NotFoundException('Pieza no encontrada');
    await this.pieces.remove(piece);
  }

  // ── Processes ────────────────────────────────────────────────────────────────

  findProcesses() {
    return this.processes.find({ order: { order: 'ASC' } });
  }

  async createProcess(dto: { code: string; label: string; order: number }) {
    const exists = await this.processes.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`Ya existe un proceso con el código ${dto.code}`);
    return this.processes.save(this.processes.create(dto));
  }

  async updateProcess(id: string, dto: { code?: string; label?: string; order?: number }) {
    const proc = await this.processes.findOne({ where: { id } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    Object.assign(proc, dto);
    return this.processes.save(proc);
  }

  async deleteProcess(id: string) {
    const proc = await this.processes.findOne({ where: { id } });
    if (!proc) throw new NotFoundException('Proceso no encontrado');
    await this.processes.remove(proc);
  }

  // ── Grades ───────────────────────────────────────────────────────────────────

  findGrades() {
    return this.grades.find({ order: { code: 'ASC' } });
  }

  async createGrade(dto: { code: string; label: string; factor?: number | null }) {
    const exists = await this.grades.findOne({ where: { code: dto.code } });
    if (exists) throw new ConflictException(`Ya existe un grado con el código ${dto.code}`);
    return this.grades.save(this.grades.create(dto));
  }

  async updateGrade(id: string, dto: { code?: string; label?: string; factor?: number | null }) {
    const grade = await this.grades.findOne({ where: { id } });
    if (!grade) throw new NotFoundException('Grado no encontrado');
    Object.assign(grade, dto);
    return this.grades.save(grade);
  }

  async deleteGrade(id: string) {
    const grade = await this.grades.findOne({ where: { id } });
    if (!grade) throw new NotFoundException('Grado no encontrado');
    await this.grades.remove(grade);
  }
}
