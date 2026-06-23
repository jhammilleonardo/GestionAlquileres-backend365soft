import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { UpdateHousekeepingDto } from './dto/update-housekeeping.dto';

export interface HousekeepingFilters {
  status?: string;
  from?: string;
  to?: string;
}

interface ReservationForTask {
  id: number;
  property_id: number;
  unit_id: number;
  checkout_date: string;
}

/**
 * Tareas de limpieza (housekeeping). Se generan al COMPLETAR una reserva
 * (programadas para la fecha de salida) y las gestiona el back-office. Consultas
 * con nombres sin calificar: corren con el `search_path` del tenant.
 */
@Injectable()
export class HousekeepingService {
  private readonly logger = new Logger(HousekeepingService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Crea la tarea de limpieza de una reserva completada dentro de la transacción
   * de la transición. Idempotente por reserva: no duplica si ya existe una.
   */
  async createForReservation(
    queryRunner: QueryRunner,
    reservation: ReservationForTask,
  ): Promise<void> {
    const existing = (await queryRunner.query(
      `SELECT id FROM housekeeping_tasks WHERE reservation_id = $1 LIMIT 1`,
      [reservation.id],
    )) as Array<{ id: number }>;
    if (existing.length > 0) return;

    await queryRunner.query(
      `INSERT INTO housekeeping_tasks
         (property_id, unit_id, reservation_id, scheduled_date, status)
       VALUES ($1, $2, $3, $4, 'pending')`,
      [
        reservation.property_id,
        reservation.unit_id,
        reservation.id,
        reservation.checkout_date,
      ],
    );
    this.logger.log(
      `Housekeeping task creada para reserva ${reservation.id} (${reservation.checkout_date})`,
    );
  }

  async list(filters: HousekeepingFilters): Promise<unknown[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`h.status = $${params.length}`);
    }
    if (filters.from) {
      params.push(filters.from);
      conditions.push(`h.scheduled_date >= $${params.length}::date`);
    }
    if (filters.to) {
      params.push(filters.to);
      conditions.push(`h.scheduled_date <= $${params.length}::date`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.dataSource.query(
      `SELECT h.*,
              p.title        AS property_name,
              u.unit_number AS unit_number,
              a.name        AS assignee_name
         FROM housekeeping_tasks h
         LEFT JOIN properties p ON p.id = h.property_id
         LEFT JOIN units u      ON u.id = h.unit_id
         LEFT JOIN "user"  a    ON a.id = h.assigned_to
         ${where}
        ORDER BY h.scheduled_date ASC, h.id ASC`,
      params,
    );
  }

  async update(id: number, dto: UpdateHousekeepingDto): Promise<unknown> {
    const fields: string[] = [];
    const params: unknown[] = [];

    if (dto.status !== undefined) {
      params.push(dto.status);
      fields.push(`status = $${params.length}`);
    }
    if (dto.assigned_to !== undefined) {
      params.push(dto.assigned_to);
      fields.push(`assigned_to = $${params.length}`);
    }
    if (dto.notes !== undefined) {
      params.push(dto.notes);
      fields.push(`notes = $${params.length}`);
    }

    if (fields.length === 0) {
      return this.findOne(id);
    }

    params.push(id);
    const rows = await this.dataSource.query<unknown[]>(
      `UPDATE housekeeping_tasks
          SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length}
        RETURNING *`,
      params,
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Tarea de limpieza ${id} no encontrada`);
    }
    return rows[0];
  }

  private async findOne(id: number): Promise<unknown> {
    const rows = await this.dataSource.query<unknown[]>(
      `SELECT * FROM housekeeping_tasks WHERE id = $1`,
      [id],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Tarea de limpieza ${id} no encontrada`);
    }
    return rows[0];
  }
}
