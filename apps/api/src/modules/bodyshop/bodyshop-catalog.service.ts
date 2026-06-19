import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { BodyshopProcess } from './bodyshop-process.entity';
import { BodyshopGrade } from './bodyshop-grade.entity';
import { BodyshopPieceGroup } from './bodyshop-piece-group.entity';
import { BodyshopPiece } from './bodyshop-piece.entity';
import { BodyshopWorkMatrix } from './bodyshop-work-matrix.entity';

@Injectable()
export class BodyshopCatalogService {
  constructor(
    @InjectRepository(BodyshopProcess)
    private processRepo: Repository<BodyshopProcess>,

    @InjectRepository(BodyshopGrade)
    private gradeRepo: Repository<BodyshopGrade>,

    @InjectRepository(BodyshopPieceGroup)
    private groupRepo: Repository<BodyshopPieceGroup>,

    @InjectRepository(BodyshopPiece)
    private pieceRepo: Repository<BodyshopPiece>,

    @InjectRepository(BodyshopWorkMatrix)
    private matrixRepo: Repository<BodyshopWorkMatrix>,
  ) {}

  getProcesses(): Promise<BodyshopProcess[]> {
    return this.processRepo.find({
      where: { active: true },
      order: { sequence: 'ASC' },
    });
  }

  getGrades(): Promise<BodyshopGrade[]> {
    return this.gradeRepo.find({ order: { severity: 'ASC' } });
  }

  getPieceGroups(): Promise<BodyshopPieceGroup[]> {
    return this.groupRepo.find({
      relations: ['pieces'],
      order: { order: 'ASC' },
    });
  }

  getPieces(groupId?: string): Promise<BodyshopPiece[]> {
    const where: Record<string, unknown> = { active: true };
    if (groupId) where['groupId'] = groupId;
    return this.pieceRepo.find({ where, order: { order: 'ASC' } });
  }

  async getMatrix(
    pieceId: string,
    processId: string,
    gradeId: string,
    workshopId?: string,
  ): Promise<BodyshopWorkMatrix | null> {
    if (workshopId) {
      const specific = await this.matrixRepo.findOne({
        where: { pieceId, processId, gradeId, workshopId },
      });
      if (specific) return specific;
    }
    return this.matrixRepo.findOne({
      where: { pieceId, processId, gradeId, workshopId: IsNull() },
    });
  }

  async calculateHours(
    items: Array<{ pieceId: string; processId: string; gradeId: string }>,
    workshopId?: string,
  ): Promise<Array<{ pieceId: string; processId: string; gradeId: string; suggestedHours: number | null }>> {
    return Promise.all(
      items.map(async item => {
        const entry = await this.getMatrix(item.pieceId, item.processId, item.gradeId, workshopId);
        return { ...item, suggestedHours: entry ? entry.suggestedHours : null };
      }),
    );
  }

  // ── CRUD: Groups ─────────────────────────────────────────────────────────────

  createGroup(dto: { name: string; code?: string; order?: number }) {
    return this.groupRepo.save({ name: dto.name, code: dto.code ?? null, order: dto.order ?? 0 });
  }

  async updateGroup(id: string, dto: { name?: string; code?: string; order?: number }) {
    await this.groupRepo.update(id, dto);
    const g = await this.groupRepo.findOne({ where: { id }, relations: ['pieces'] });
    if (!g) throw new NotFoundException('Group not found');
    return g;
  }

  async deleteGroup(id: string) {
    const g = await this.groupRepo.findOne({ where: { id } });
    if (!g) throw new NotFoundException('Group not found');
    await this.groupRepo.remove(g);
  }

  // ── CRUD: Pieces ──────────────────────────────────────────────────────────────

  createPiece(dto: { name: string; code: string; groupId?: string | null; order?: number }) {
    return this.pieceRepo.save({
      name: dto.name,
      code: dto.code,
      groupId: (dto.groupId ?? '') as string,
      active: true,
      applicableProcesses: [] as string[],
      order: dto.order ?? 0,
    });
  }

  async updatePiece(id: string, dto: { name?: string; code?: string; groupId?: string | null; order?: number }) {
    const patch: Record<string, any> = {};
    if (dto.name !== undefined)    patch['name']    = dto.name;
    if (dto.code !== undefined)    patch['code']    = dto.code;
    if (dto.groupId !== undefined) patch['groupId'] = dto.groupId;
    if (dto.order !== undefined)   patch['order']   = dto.order;
    await this.pieceRepo.update(id, patch);
    const p = await this.pieceRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Piece not found');
    return p;
  }

  async deletePiece(id: string) {
    const p = await this.pieceRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Piece not found');
    await this.pieceRepo.remove(p);
  }

  // ── CRUD: Processes ───────────────────────────────────────────────────────────

  createProcess(dto: { name: string; code: string; sequence?: number }) {
    return this.processRepo.save({ name: dto.name, code: dto.code, sequence: dto.sequence ?? 0, active: true });
  }

  async updateProcess(id: string, dto: { name?: string; code?: string; sequence?: number }) {
    await this.processRepo.update(id, dto);
    const p = await this.processRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Process not found');
    return p;
  }

  async deleteProcess(id: string) {
    const p = await this.processRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Process not found');
    await this.processRepo.remove(p);
  }

  // ── CRUD: Grades ──────────────────────────────────────────────────────────────

  createGrade(dto: { name: string; code: string; severity?: number }) {
    return this.gradeRepo.save({ name: dto.name, code: dto.code, severity: dto.severity ?? 1 });
  }

  async updateGrade(id: string, dto: { name?: string; code?: string; severity?: number }) {
    await this.gradeRepo.update(id, dto);
    const g = await this.gradeRepo.findOne({ where: { id } });
    if (!g) throw new NotFoundException('Grade not found');
    return g;
  }

  async deleteGrade(id: string) {
    const g = await this.gradeRepo.findOne({ where: { id } });
    if (!g) throw new NotFoundException('Grade not found');
    await this.gradeRepo.remove(g);
  }

  async seedWorkshopMatrix(workshopId: string): Promise<{ seeded: boolean; count: number; message: string }> {
    const pieces    = await this.pieceRepo.find({ where: { active: true } });
    const grades    = await this.gradeRepo.find();
    const processes = await this.processRepo.find({ where: { active: true } });
    const activeProcs = processes.filter(p => ['BODYWORK', 'PREP', 'PAINT'].includes(p.code));

    if (!pieces.length || !grades.length || !activeProcs.length) {
      return { seeded: false, count: 0, message: 'Catalog not seeded yet. Run /seed first.' };
    }

    const existing = await this.matrixRepo.count({ where: { workshopId } } as any);
    if (existing > 0) {
      return { seeded: false, count: existing, message: `Workshop already has ${existing} matrix entries.` };
    }

    const baseHours: Record<string, { BODYWORK: number; PREP: number; PAINT: number }> = {
      CAPO:          { BODYWORK: 3.0,  PREP: 1.5,  PAINT: 1.0  },
      PARADELANT:    { BODYWORK: 2.0,  PREP: 1.0,  PAINT: 0.5  },
      FARO_IZQ:      { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
      FARO_DER:      { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
      GBARROIZQ:     { BODYWORK: 2.5,  PREP: 1.0,  PAINT: 0.75 },
      PUERTADELIZQ:  { BODYWORK: 3.0,  PREP: 1.5,  PAINT: 1.0  },
      PUERTATRASIZQ: { BODYWORK: 2.5,  PREP: 1.0,  PAINT: 0.75 },
      ESPEJO_IZQ:    { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
      GBARRODER:     { BODYWORK: 2.5,  PREP: 1.0,  PAINT: 0.75 },
      PUERTADELDER:  { BODYWORK: 3.0,  PREP: 1.5,  PAINT: 1.0  },
      PUERTATRASDER: { BODYWORK: 2.5,  PREP: 1.0,  PAINT: 0.75 },
      ESPEJO_DER:    { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
      TECHO:         { BODYWORK: 4.0,  PREP: 2.0,  PAINT: 1.5  },
      LUNETA:        { BODYWORK: 1.0,  PREP: 0.5,  PAINT: 0.5  },
      PARABRISAS:    { BODYWORK: 1.0,  PREP: 0.5,  PAINT: 0.5  },
      PARATRASER:    { BODYWORK: 2.0,  PREP: 1.0,  PAINT: 0.5  },
      TAPABAULJ:     { BODYWORK: 3.0,  PREP: 1.5,  PAINT: 1.0  },
      FARO_TRAS_IZQ: { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
      FARO_TRAS_DER: { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
    };
    const gradeFactors: Record<string, number> = { LEVE: 1.0, MEDIO: 1.8, GRAVE: 3.0 };

    const entries: any[] = [];
    for (const piece of pieces) {
      const base = baseHours[piece.code];
      if (!base) continue;
      for (const grade of grades) {
        const factor = gradeFactors[grade.code] ?? 1;
        for (const proc of activeProcs) {
          const rawHours = base[proc.code as 'BODYWORK' | 'PREP' | 'PAINT'];
          if (!rawHours) continue;
          const hours = Math.round(rawHours * factor * 4) / 4;
          entries.push({ pieceId: piece.id, processId: proc.id, gradeId: grade.id, workshopId, suggestedHours: hours });
        }
      }
    }
    await this.matrixRepo.save(entries);
    return { seeded: true, count: entries.length, message: `Seeded ${entries.length} matrix entries for workshop ${workshopId}.` };
  }

  async seedDefaults(workshopId?: string): Promise<{ seeded: boolean; message: string }> {
    const existingCount = await this.processRepo.count();
    if (existingCount > 0) {
      return { seeded: false, message: 'Catalog already has data, skipping seed.' };
    }

    const processes = await this.processRepo.save([
      { name: 'Chapería',     code: 'BODYWORK',      sequence: 1, active: true },
      { name: 'Preparación',  code: 'PREP',          sequence: 2, active: true },
      { name: 'Pintura',      code: 'PAINT',         sequence: 3, active: true },
      { name: 'Pulido',       code: 'POLISH',        sequence: 4, active: true },
      { name: 'Mecánica',     code: 'MECHANIC',      sequence: 5, active: true },
      { name: 'Control Final',code: 'FINAL_CONTROL', sequence: 6, active: true },
    ]);

    await this.gradeRepo.save([
      { name: 'Leve', code: 'LEVE', severity: 1 },
      { name: 'Medio', code: 'MEDIO', severity: 2 },
      { name: 'Grave', code: 'GRAVE', severity: 3 },
    ]);

    const defaultProcesses = processes
      .filter(p => ['BODYWORK', 'PREP', 'PAINT'].includes(p.code))
      .map(p => p.code);

    const frontal = await this.groupRepo.save({ name: 'Frontal', code: 'FRONT', order: 1 });
    const latIzq = await this.groupRepo.save({ name: 'Lateral izquierdo', code: 'LATI', order: 2 });
    const latDer = await this.groupRepo.save({ name: 'Lateral derecho', code: 'LATD', order: 3 });
    const techo = await this.groupRepo.save({ name: 'Techo', code: 'TECHO', order: 4 });
    const trasero = await this.groupRepo.save({ name: 'Trasero', code: 'TRAS', order: 5 });

    const pieces = await this.pieceRepo.save([
      { groupId: frontal.id, name: 'Capó', code: 'CAPO', order: 1, active: true, applicableProcesses: defaultProcesses },
      { groupId: frontal.id, name: 'Paragolpe delantero', code: 'PARADELANT', order: 2, active: true, applicableProcesses: defaultProcesses },
      { groupId: frontal.id, name: 'Faro izquierdo', code: 'FARO_IZQ', order: 3, active: true, applicableProcesses: defaultProcesses },
      { groupId: frontal.id, name: 'Faro derecho', code: 'FARO_DER', order: 4, active: true, applicableProcesses: defaultProcesses },

      { groupId: latIzq.id, name: 'Guardabarro izquierdo', code: 'GBARROIZQ', order: 1, active: true, applicableProcesses: defaultProcesses },
      { groupId: latIzq.id, name: 'Puerta delantera izquierda', code: 'PUERTADELIZQ', order: 2, active: true, applicableProcesses: defaultProcesses },
      { groupId: latIzq.id, name: 'Puerta trasera izquierda', code: 'PUERTATRASIZQ', order: 3, active: true, applicableProcesses: defaultProcesses },
      { groupId: latIzq.id, name: 'Espejo izquierdo', code: 'ESPEJO_IZQ', order: 4, active: true, applicableProcesses: defaultProcesses },

      { groupId: latDer.id, name: 'Guardabarro derecho', code: 'GBARRODER', order: 1, active: true, applicableProcesses: defaultProcesses },
      { groupId: latDer.id, name: 'Puerta delantera derecha', code: 'PUERTADELDER', order: 2, active: true, applicableProcesses: defaultProcesses },
      { groupId: latDer.id, name: 'Puerta trasera derecha', code: 'PUERTATRASDER', order: 3, active: true, applicableProcesses: defaultProcesses },
      { groupId: latDer.id, name: 'Espejo derecho', code: 'ESPEJO_DER', order: 4, active: true, applicableProcesses: defaultProcesses },

      { groupId: techo.id, name: 'Techo', code: 'TECHO', order: 1, active: true, applicableProcesses: defaultProcesses },
      { groupId: techo.id, name: 'Luneta', code: 'LUNETA', order: 2, active: true, applicableProcesses: defaultProcesses },
      { groupId: techo.id, name: 'Parabrisas', code: 'PARABRISAS', order: 3, active: true, applicableProcesses: defaultProcesses },

      { groupId: trasero.id, name: 'Paragolpe trasero', code: 'PARATRASER', order: 1, active: true, applicableProcesses: defaultProcesses },
      { groupId: trasero.id, name: 'Tapa baúl', code: 'TAPABAULJ', order: 2, active: true, applicableProcesses: defaultProcesses },
      { groupId: trasero.id, name: 'Faro trasero izquierdo', code: 'FARO_TRAS_IZQ', order: 3, active: true, applicableProcesses: defaultProcesses },
      { groupId: trasero.id, name: 'Faro trasero derecho', code: 'FARO_TRAS_DER', order: 4, active: true, applicableProcesses: defaultProcesses },
    ]);

    // ── Matriz de horas por defecto (workshopId=null → fallback global) ─────────
    // Horas base para grado LEVE. Multiplicadores: LEVE×1, MEDIO×1.8, GRAVE×3.
    const baseHours: Record<string, { BODYWORK: number; PREP: number; PAINT: number }> = {
      CAPO:          { BODYWORK: 3.0,  PREP: 1.5,  PAINT: 1.0  },
      PARADELANT:    { BODYWORK: 2.0,  PREP: 1.0,  PAINT: 0.5  },
      FARO_IZQ:      { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
      FARO_DER:      { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
      GBARROIZQ:     { BODYWORK: 2.5,  PREP: 1.0,  PAINT: 0.75 },
      PUERTADELIZQ:  { BODYWORK: 3.0,  PREP: 1.5,  PAINT: 1.0  },
      PUERTATRASIZQ: { BODYWORK: 2.5,  PREP: 1.0,  PAINT: 0.75 },
      ESPEJO_IZQ:    { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
      GBARRODER:     { BODYWORK: 2.5,  PREP: 1.0,  PAINT: 0.75 },
      PUERTADELDER:  { BODYWORK: 3.0,  PREP: 1.5,  PAINT: 1.0  },
      PUERTATRASDER: { BODYWORK: 2.5,  PREP: 1.0,  PAINT: 0.75 },
      ESPEJO_DER:    { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
      TECHO:         { BODYWORK: 4.0,  PREP: 2.0,  PAINT: 1.5  },
      LUNETA:        { BODYWORK: 1.0,  PREP: 0.5,  PAINT: 0.5  },
      PARABRISAS:    { BODYWORK: 1.0,  PREP: 0.5,  PAINT: 0.5  },
      PARATRASER:    { BODYWORK: 2.0,  PREP: 1.0,  PAINT: 0.5  },
      TAPABAULJ:     { BODYWORK: 3.0,  PREP: 1.5,  PAINT: 1.0  },
      FARO_TRAS_IZQ: { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
      FARO_TRAS_DER: { BODYWORK: 0.5,  PREP: 0.25, PAINT: 0.25 },
    };

    const gradeFactors: Record<string, number> = { LEVE: 1.0, MEDIO: 1.8, GRAVE: 3.0 };
    const grades = await this.gradeRepo.find();
    const activeProcs = processes.filter(p => ['BODYWORK', 'PREP', 'PAINT'].includes(p.code));

    const matrixEntries: any[] = [];
    for (const piece of pieces) {
      const base = baseHours[piece.code];
      if (!base) continue;
      for (const grade of grades) {
        const factor = gradeFactors[grade.code] ?? 1;
        for (const proc of activeProcs) {
          const rawHours = base[proc.code as 'BODYWORK' | 'PREP' | 'PAINT'];
          if (!rawHours) continue;
          // Round to nearest 0.25
          const hours = Math.round((rawHours * factor) * 4) / 4;
          matrixEntries.push({
            pieceId: piece.id,
            processId: proc.id,
            gradeId: grade.id,
            workshopId: null,
            suggestedHours: hours,
          });
        }
      }
    }
    await this.matrixRepo.save(matrixEntries);

    return {
      seeded: true,
      message: `Catalog seeded: ${pieces.length} piezas, ${matrixEntries.length} entradas de matriz.`,
    };
  }
}
