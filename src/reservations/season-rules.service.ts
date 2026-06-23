import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateSeasonRuleDto } from './dto/create-season-rule.dto';
import { SeasonRule } from './season-pricing';

export interface SeasonRuleRow extends SeasonRule {
  id: number;
  unit_id: number;
  name: string;
  created_at: Date;
}

/**
 * Gestión de temporadas (override de precio/noches por rango de fechas y unidad).
 * Impide solapes para que cada noche resuelva a una sola temporada. Consultas con
 * nombres sin calificar: corren con el `search_path` del tenant del middleware.
 */
@Injectable()
export class SeasonRulesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async create(
    unitId: number,
    dto: CreateSeasonRuleDto,
  ): Promise<SeasonRuleRow> {
    if (dto.end_date < dto.start_date) {
      throw new BadRequestException(
        'La fecha de fin no puede ser anterior a la de inicio.',
      );
    }

    await this.assertNoOverlap(unitId, dto.start_date, dto.end_date);

    const rows = await this.dataSource.query<SeasonRuleRow[]>(
      `INSERT INTO season_rules
         (unit_id, name, start_date, end_date, price_per_night, min_nights)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        unitId,
        dto.name,
        dto.start_date,
        dto.end_date,
        dto.price_per_night ?? null,
        dto.min_nights ?? null,
      ],
    );
    return rows[0];
  }

  async findByUnit(unitId: number): Promise<SeasonRuleRow[]> {
    return this.dataSource.query<SeasonRuleRow[]>(
      `SELECT id, unit_id, name, start_date::text AS start_date,
              end_date::text AS end_date, price_per_night, min_nights, created_at
         FROM season_rules
        WHERE unit_id = $1
        ORDER BY start_date`,
      [unitId],
    );
  }

  async remove(unitId: number, id: number): Promise<void> {
    const deleted = await this.dataSource.query<Array<{ id: number }>>(
      `DELETE FROM season_rules WHERE id = $1 AND unit_id = $2 RETURNING id`,
      [id, unitId],
    );
    if (deleted.length === 0) {
      throw new NotFoundException(`Temporada ${id} no encontrada`);
    }
  }

  private async assertNoOverlap(
    unitId: number,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const rows = await this.dataSource.query<Array<{ id: number }>>(
      `SELECT id FROM season_rules
        WHERE unit_id = $1
          AND start_date <= $3::date
          AND end_date   >= $2::date
        LIMIT 1`,
      [unitId, startDate, endDate],
    );
    if (rows.length > 0) {
      throw new ConflictException(
        'La temporada se solapa con otra existente en esta unidad.',
      );
    }
  }
}
