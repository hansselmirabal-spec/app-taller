import { Injectable, OnApplicationBootstrap, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, Repository } from 'typeorm';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BudgetSimulatorItem } from './budget-simulator-item.entity';
import { BudgetConfig } from './budget-config.entity';
import { BUDGET_CATALOG_SEED } from './budget-catalog.seed';

// User-facing damage levels
export type DamageLevel = 'Leve' | 'Medio' | 'Grave' | 'Sustitucion';

// Base operations always included regardless of damage level
const ALWAYS_INCLUDED = new Set(['Desm/Mont', 'Parcial desarmar', 'Empapelado']);

// Determines if a catalog row should be included for a given damage level.
// Rules derived from BASE_SIMULADOR + SIMULADOR_PRESUPUESTO logic (columna "Pintar"
// del Excel de referencia: siempre busca categoría "Pintar reparación" salvo que el
// tipo de daño sea "Sustitución" — no varía entre Leve/Medio/Grave):
//   Leve/Medio/Grave → repair route: Reparar+Preparacion matching grade, Pulir (Leve only), Pintar (todas)
//   Sustitución       → replacement route: Sustituir, Preparacion/Pintar with tipoDano='Sustitución'
function matchesDamageLevel(proceso: string, tipoDano: string, damageLevel: DamageLevel): boolean {
  if (ALWAYS_INCLUDED.has(proceso)) return true;
  switch (damageLevel) {
    case 'Leve':
      return proceso === 'Pulir' ||
             ((proceso === 'Reparar' || proceso === 'Preparacion') && tipoDano === 'Leve') ||
             (proceso === 'Pintar' && (tipoDano === 'Pintar reparación' || tipoDano === 'Reparación'));
    case 'Medio':
      return ((proceso === 'Reparar' || proceso === 'Preparacion') && tipoDano === 'Medio') ||
             (proceso === 'Pintar' && (tipoDano === 'Pintar reparación' || tipoDano === 'Reparación'));
    case 'Grave':
      return ((proceso === 'Reparar' || proceso === 'Preparacion') && tipoDano === 'Grave') ||
             (proceso === 'Pintar' && (tipoDano === 'Pintar reparación' || tipoDano === 'Reparación'));
    case 'Sustitucion':
      return proceso === 'Sustituir' ||
             ((proceso === 'Preparacion' || proceso === 'Pintar') && tipoDano === 'Sustitución');
  }
  return false;
}

// Map proceso → bodyshop category
const PROCESO_CATEGORY: Record<string, 'bodywork' | 'prep' | 'paint'> = {
  'Reparar':          'bodywork',
  'Sustituir':        'bodywork',
  'Desm/Mont':        'bodywork',
  'Parcial desarmar': 'bodywork',
  'Renovar':          'bodywork',
  'Preparacion':      'prep',
  'Empapelado':       'prep',
  'Pintar':           'paint',
  'Pulir':            'paint',
};

export class EstimateItemDto {
  @IsString() pieza: string;
  @IsEnum(['Leve', 'Medio', 'Grave', 'Sustitucion']) damageLevel: DamageLevel;
  @IsNumber() @Min(1) qty: number;
}

export class EstimateRequestDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EstimateItemDto)
  items: EstimateItemDto[];

  @IsOptional() @IsNumber() tarifaOverride?: number;
}

export interface ProcessBreakdown {
  proceso:   string;
  horas:     number;
  descripcion: string;
}

export interface EstimateLineResult {
  pieza:        string;
  damageLevel:  DamageLevel;
  qty:          number;
  breakdown:    ProcessBreakdown[];
  bodyworkHours: number;
  prepHours:    number;
  paintHours:   number;
  totalHoras:   number;
  totalMdo:     number;
}

export interface EstimateResult {
  lines:         EstimateLineResult[];
  bodyworkHours: number;
  prepHours:     number;
  paintHours:    number;
  totalHoras:    number;
  totalMdo:      number;
  tarifa:        number;
  moneda:        string;
}

@Injectable()
export class BudgetSimulatorService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BudgetSimulatorService.name);

  constructor(
    @InjectRepository(BudgetSimulatorItem) private itemRepo: Repository<BudgetSimulatorItem>,
    @InjectRepository(BudgetConfig)        private configRepo: Repository<BudgetConfig>,
  ) {}

  async onApplicationBootstrap() {
    const count = await this.itemRepo.count();
    if (count > 0) return;
    this.logger.log('Seeding budget_simulator_items...');
    await this.itemRepo.save(
      BUDGET_CATALOG_SEED.map(row => this.itemRepo.create(row)),
    );
    this.logger.log(`Seeded ${BUDGET_CATALOG_SEED.length} catalog items.`);

    const cfgCount = await this.configRepo.count();
    if (cfgCount === 0) {
      await this.configRepo.save(this.configRepo.create({ tarifaMdo: 144000, moneda: 'Gs.', ivaIncluido: false }));
      this.logger.log('Seeded default budget_config.');
    }
  }

  async getPiezas(): Promise<{ pieza: string; grupo: number }[]> {
    const rows = await this.itemRepo
      .createQueryBuilder('i')
      .select('i.pieza', 'pieza')
      .addSelect('MIN(i.grupo)', 'grupo')
      .groupBy('i.pieza')
      .orderBy('i.pieza', 'ASC')
      .getRawMany();
    return rows.map(r => ({ pieza: r.pieza, grupo: Number(r.grupo) }));
  }

  getDamageLevels(): { code: DamageLevel; label: string }[] {
    return [
      { code: 'Leve',        label: 'Leve'        },
      { code: 'Medio',       label: 'Medio'       },
      { code: 'Grave',       label: 'Grave'       },
      { code: 'Sustitucion', label: 'Sustitución' },
    ];
  }

  async getConfig(): Promise<BudgetConfig> {
    let cfg = await this.configRepo.findOne({ where: {}, order: { updatedAt: 'DESC' } });
    if (!cfg) {
      cfg = await this.configRepo.save(this.configRepo.create({ tarifaMdo: 144000, moneda: 'Gs.', ivaIncluido: false }));
    }
    return cfg;
  }

  async updateConfig(dto: { tarifaMdo?: number; moneda?: string; ivaIncluido?: boolean }): Promise<BudgetConfig> {
    const cfg = await this.getConfig();
    Object.assign(cfg, dto);
    return this.configRepo.save(cfg);
  }

  async estimate(dto: EstimateRequestDto): Promise<EstimateResult> {
    const cfg = await this.getConfig();
    const tarifa = dto.tarifaOverride ?? Number(cfg.tarifaMdo);

    const lines: EstimateLineResult[] = [];

    // Batch-load all catalog rows for every requested pieza in a single query (avoids N+1).
    const piezasUnicas = [...new Set(dto.items.map(i => i.pieza))];
    const allItems = await this.itemRepo.find({ where: { pieza: In(piezasUnicas), active: true } });
    const itemsByPieza = new Map<string, typeof allItems>();
    for (const row of allItems) {
      const bucket = itemsByPieza.get(row.pieza) ?? [];
      bucket.push(row);
      itemsByPieza.set(row.pieza, bucket);
    }

    for (const item of dto.items) {
      // Filter in-memory by damage level — no additional DB calls.
      const allRows = itemsByPieza.get(item.pieza) ?? [];
      const rows = allRows.filter(r => matchesDamageLevel(r.proceso, r.tipoDano, item.damageLevel));

      const byProceso = new Map<string, number>();
      for (const row of rows) {
        const prev = byProceso.get(row.proceso) ?? 0;
        byProceso.set(row.proceso, prev + Number(row.horas));
      }

      const breakdown: ProcessBreakdown[] = Array.from(byProceso.entries()).map(([proceso, horas]) => ({
        proceso,
        horas: round2(horas * item.qty),
        descripcion: `${proceso} — ${item.pieza}`,
      }));

      let bodyworkHours = 0, prepHours = 0, paintHours = 0;
      for (const b of breakdown) {
        const cat = PROCESO_CATEGORY[b.proceso];
        if (cat === 'bodywork') bodyworkHours += b.horas;
        else if (cat === 'prep') prepHours += b.horas;
        else if (cat === 'paint') paintHours += b.horas;
      }

      const totalHoras = round2(bodyworkHours + prepHours + paintHours);
      lines.push({
        pieza:         item.pieza,
        damageLevel:   item.damageLevel,
        qty:           item.qty,
        breakdown,
        bodyworkHours: round2(bodyworkHours),
        prepHours:     round2(prepHours),
        paintHours:    round2(paintHours),
        totalHoras,
        totalMdo:      Math.round(totalHoras * tarifa),
      });
    }

    const totalBodywork = round2(lines.reduce((s, l) => s + l.bodyworkHours, 0));
    const totalPrep     = round2(lines.reduce((s, l) => s + l.prepHours,     0));
    const totalPaint    = round2(lines.reduce((s, l) => s + l.paintHours,    0));
    const totalHoras    = round2(totalBodywork + totalPrep + totalPaint);

    return {
      lines,
      bodyworkHours: totalBodywork,
      prepHours:     totalPrep,
      paintHours:    totalPaint,
      totalHoras,
      totalMdo:      Math.round(totalHoras * tarifa),
      tarifa,
      moneda:        cfg.moneda,
    };
  }

  async listCatalog(q: CatalogListQuery) {
    const page  = Math.max(1, q.page  ?? 1);
    const limit = Math.min(200, Math.max(1, q.limit ?? 50));
    const skip  = (page - 1) * limit;

    const where: any = {};
    if (q.pieza)   where.pieza   = ILike(`%${q.pieza}%`);
    if (q.proceso) where.proceso = ILike(`%${q.proceso}%`);
    if (q.activeOnly !== false) where.active = true;

    let qb = this.itemRepo.createQueryBuilder('i').where('1=1');
    if (q.pieza)   qb = qb.andWhere('i.pieza   ILIKE :pieza',   { pieza:   `%${q.pieza}%`   });
    if (q.proceso) qb = qb.andWhere('i.proceso ILIKE :proceso', { proceso: `%${q.proceso}%` });
    if (q.search)  qb = qb.andWhere(
      '(i.pieza ILIKE :s OR i.proceso ILIKE :s OR i.descripcion_final ILIKE :s OR i.tipo_dano ILIKE :s OR i.codigo_posicion ILIKE :s)',
      { s: `%${q.search}%` },
    );
    if (q.activeOnly !== false) qb = qb.andWhere('i.active = true');

    const [items, total] = await qb
      .orderBy('i.pieza', 'ASC')
      .addOrderBy('i.proceso', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async updateCatalogItem(id: string, dto: UpdateCatalogItemDto): Promise<BudgetSimulatorItem> {
    const item = await this.itemRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException('Ítem no encontrado');
    if (dto.horas            !== undefined) item.horas            = dto.horas;
    if (dto.descripcionFinal !== undefined) item.descripcionFinal = dto.descripcionFinal;
    if (dto.active           !== undefined) item.active           = dto.active;
    return this.itemRepo.save(item);
  }

  async createCatalogItem(dto: CreateCatalogItemDto): Promise<BudgetSimulatorItem> {
    const existing = await this.itemRepo.findOne({ where: { codigoPosicion: dto.codigoPosicion } });
    if (existing) throw new BadRequestException(`Ya existe un ítem con código ${dto.codigoPosicion}`);
    return this.itemRepo.save(this.itemRepo.create({ ...dto, active: true }));
  }

  async importFromExcel(buffer: Buffer): Promise<{ created: number; updated: number; errors: string[] }> {
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    // Prefer BASE_SIMULADOR sheet (original Excel format), fall back to first sheet
    const sheetName = workbook.SheetNames.includes('BASE_SIMULADOR')
      ? 'BASE_SIMULADOR'
      : workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows  = XLSX.utils.sheet_to_json<any>(sheet, { defval: '' });

    let created = 0, updated = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      // Accept both the original Excel column names and the uppercase/camelCase variants
      const codigo = String(
        row['Código posición'] ?? row['CODIGO_POSICION'] ?? row['codigoPosicion'] ?? ''
      ).trim();
      const horasRaw = row['Horas'] ?? row['HORAS'] ?? row['horas'] ?? '0';
      const horas = parseFloat(String(horasRaw).replace(',', '.'));

      if (!codigo) { errors.push(`Fila ${i + 2}: sin "Código posición"`); continue; }
      if (isNaN(horas) || horas < 0) { errors.push(`Fila ${i + 2}: horas inválidas (${horasRaw})`); continue; }

      const descRaw = String(
        row['Descripción final'] ?? row['DESCRIPCION_FINAL'] ?? row['descripcionFinal'] ?? ''
      ).trim();

      const existing = await this.itemRepo.findOne({ where: { codigoPosicion: codigo } });
      if (existing) {
        existing.horas            = horas;
        existing.descripcionFinal = descRaw || existing.descripcionFinal;
        existing.active           = true;
        await this.itemRepo.save(existing);
        updated++;
      } else {
        const pieza = String(row['Pieza'] ?? row['PIEZA'] ?? row['pieza'] ?? '').trim();
        const proceso = String(row['Proceso'] ?? row['PROCESO'] ?? row['proceso'] ?? '').trim();
        const tipoDano = String(
          row['Tipo daño normalizado'] ?? row['TIPO_DANO'] ?? row['tipoDano'] ?? ''
        ).trim();

        if (!pieza || !proceso || !tipoDano) {
          errors.push(`Fila ${i + 2}: faltan campos obligatorios (Pieza, Proceso, Tipo daño normalizado)`);
          continue;
        }

        await this.itemRepo.save(this.itemRepo.create({
          codigoPosicion:   codigo,
          pieza,
          grupo:            parseInt(String(row['Grupo'] ?? row['GRUPO'] ?? row['grupo'] ?? '0')) || 0,
          proceso,
          gradoOriginal:    String(row['Grado original'] ?? row['GRADO_ORIGINAL'] ?? row['gradoOriginal'] ?? '').trim() || null,
          tipoDano,
          nroTrabajo:       parseInt(String(row['Nro trabajo/proceso'] ?? row['NRO_TRABAJO'] ?? row['nroTrabajo'] ?? '0')) || 0,
          descripcionFinal: descRaw,
          horas,
          active:           true,
        }));
        created++;
      }
    }

    return { created, updated, errors };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─── CATALOG CRUD ─────────────────────────────────────────────────────────────

export class CatalogListQuery {
  @IsOptional() @IsString() pieza?:   string;
  @IsOptional() @IsString() proceso?: string;
  @IsOptional() @IsString() search?:  string;
  @IsOptional() page?:    number;
  @IsOptional() limit?:   number;
  @IsOptional() activeOnly?: boolean;
}

export class UpdateCatalogItemDto {
  @IsOptional() @IsNumber() horas?:            number;
  @IsOptional() @IsString() descripcionFinal?: string;
  @IsOptional() @IsBoolean() active?:          boolean;
}

export class CreateCatalogItemDto {
  @IsString()  pieza:            string;
  @IsInt()     grupo:            number;
  @IsString()  proceso:          string;
  @IsOptional() @IsString() gradoOriginal?:   string | null;
  @IsString()  tipoDano:         string;
  @IsInt()     nroTrabajo:       number;
  @IsString()  codigoPosicion:   string;
  @IsString()  descripcionFinal: string;
  @IsNumber()  horas:            number;
}
