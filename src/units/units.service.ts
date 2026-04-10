import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Unit } from './entities/unit.entity';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { UnitStatus } from './enums/unit-status.enum';

// Estados de contrato que bloquean el borrado de una unidad
const ACTIVE_CONTRACT_STATUSES = ['BORRADOR', 'PENDIENTE', 'FIRMADO', 'ACTIVO', 'POR_VENCER'];

@Injectable()
export class UnitsService {
  private readonly logger = new Logger(UnitsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  private getUnitRepository(): Repository<Unit> {
    return this.dataSource.getRepository(Unit);
  }

  async findByProperty(propertyId: number): Promise<Unit[]> {
    await this.assertPropertyExists(propertyId);

    return this.getUnitRepository().find({
      where: { property_id: propertyId },
      order: { floor: 'ASC', unit_number: 'ASC' },
    });
  }

  async findAvailableByProperty(propertyId: number): Promise<Unit[]> {
    await this.assertPropertyExists(propertyId);

    return this.getUnitRepository().find({
      where: { property_id: propertyId, status: UnitStatus.AVAILABLE },
      order: { floor: 'ASC', unit_number: 'ASC' },
    });
  }

  async findOne(propertyId: number, unitId: number): Promise<Unit> {
    const unit = await this.getUnitRepository().findOne({
      where: { id: unitId, property_id: propertyId },
    });

    if (!unit) {
      throw new NotFoundException(
        `Unidad ${unitId} no encontrada en la propiedad ${propertyId}`,
      );
    }

    return unit;
  }

  async create(propertyId: number, createUnitDto: CreateUnitDto): Promise<Unit> {
    await this.assertPropertyExists(propertyId);
    await this.assertUnitNumberUnique(propertyId, createUnitDto.unit_number);

    const unit = this.getUnitRepository().create({
      ...createUnitDto,
      property_id: propertyId,
    });

    return this.getUnitRepository().save(unit);
  }

  async update(
    propertyId: number,
    unitId: number,
    updateUnitDto: UpdateUnitDto,
  ): Promise<Unit> {
    const unit = await this.findOne(propertyId, unitId);

    if (
      updateUnitDto.unit_number &&
      updateUnitDto.unit_number !== unit.unit_number
    ) {
      await this.assertUnitNumberUnique(propertyId, updateUnitDto.unit_number, unitId);
    }

    Object.assign(unit, updateUnitDto);
    return this.getUnitRepository().save(unit);
  }

  async remove(propertyId: number, unitId: number): Promise<{ message: string }> {
    await this.findOne(propertyId, unitId);
    await this.assertNoActiveContracts(unitId);

    await this.getUnitRepository().delete(unitId);

    return { message: `Unidad ${unitId} eliminada correctamente` };
  }

  // ─── Helpers de validación ────────────────────────────────────────────────

  private async assertPropertyExists(propertyId: number): Promise<void> {
    const rows: unknown[] = await this.dataSource.query(
      'SELECT id FROM properties WHERE id = $1',
      [propertyId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Propiedad ${propertyId} no encontrada`);
    }
  }

  private async assertUnitNumberUnique(
    propertyId: number,
    unitNumber: string,
    excludeUnitId?: number,
  ): Promise<void> {
    const qb = this.getUnitRepository()
      .createQueryBuilder('unit')
      .where('unit.property_id = :propertyId', { propertyId })
      .andWhere('unit.unit_number = :unitNumber', { unitNumber });

    if (excludeUnitId !== undefined) {
      qb.andWhere('unit.id != :excludeUnitId', { excludeUnitId });
    }

    const existing = await qb.getOne();

    if (existing) {
      throw new ConflictException(
        `Ya existe una unidad con el número "${unitNumber}" en esta propiedad`,
      );
    }
  }

  private async assertNoActiveContracts(unitId: number): Promise<void> {
    const placeholders = ACTIVE_CONTRACT_STATUSES.map(
      (_, i) => `$${i + 2}`,
    ).join(', ');

    const rows: unknown[] = await this.dataSource.query(
      `SELECT id FROM contracts WHERE unit_id = $1 AND status IN (${placeholders})`,
      [unitId, ...ACTIVE_CONTRACT_STATUSES],
    );

    if (rows.length > 0) {
      throw new BadRequestException(
        'No se puede eliminar una unidad con contratos activos',
      );
    }
  }
}
