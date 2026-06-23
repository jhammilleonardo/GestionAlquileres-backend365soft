import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateReviewDto } from './dto/create-review.dto';

interface ReservationForReview {
  tenant_id: number;
  status: string;
  property_id: number;
  unit_id: number;
}

export interface ReviewRow {
  id: number;
  reservation_id: number;
  tenant_id: number;
  property_id: number;
  unit_id: number;
  rating: number;
  comment: string | null;
  created_at: Date;
}

export interface PropertyRating {
  average: number;
  count: number;
}

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Reseñas de estadía. Una reseña por reserva, sólo sobre reservas COMPLETADAS y
 * del propio huésped. Las consultas usan nombres de tabla sin calificar: corren
 * dentro del request con el `search_path` del tenant ya fijado por el middleware.
 */
@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async createForReservation(
    reservationId: number,
    tenantId: number,
    dto: CreateReviewDto,
  ): Promise<ReviewRow> {
    const reservation = await this.findReservationForReview(
      reservationId,
      tenantId,
    );

    if (reservation.status !== 'completed') {
      throw new BadRequestException(
        'Sólo se pueden reseñar reservas completadas.',
      );
    }

    try {
      const rows = await this.dataSource.query<ReviewRow[]>(
        `INSERT INTO reviews
           (reservation_id, tenant_id, property_id, unit_id, rating, comment)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          reservationId,
          tenantId,
          reservation.property_id,
          reservation.unit_id,
          dto.rating,
          dto.comment ?? null,
        ],
      );

      this.logger.log(
        `Tenant ${tenantId} reviewed reservation ${reservationId} (${dto.rating}★)`,
      );
      return rows[0];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException('Esta reserva ya tiene una reseña.');
      }
      throw error;
    }
  }

  /** Reseñas del huésped autenticado, con nombre de propiedad/unidad. */
  async findMine(tenantId: number): Promise<unknown[]> {
    return this.dataSource.query(
      `SELECT r.*, p.title AS property_name, u.unit_number AS unit_number
         FROM reviews r
         LEFT JOIN properties p ON p.id = r.property_id
         LEFT JOIN units u      ON u.id = r.unit_id
        WHERE r.tenant_id = $1
        ORDER BY r.created_at DESC`,
      [tenantId],
    );
  }

  /** Listado admin con nombres de propiedad/unidad/huésped; filtro opcional por propiedad. */
  async findAll(propertyId?: number): Promise<unknown[]> {
    const params: unknown[] = [];
    let where = '';
    if (propertyId !== undefined) {
      params.push(propertyId);
      where = `WHERE r.property_id = $1`;
    }

    return this.dataSource.query(
      `SELECT r.*,
              p.title        AS property_name,
              u.unit_number AS unit_number,
              t.name        AS guest_name
         FROM reviews r
         LEFT JOIN properties p ON p.id = r.property_id
         LEFT JOIN units u      ON u.id = r.unit_id
         LEFT JOIN "user"   t   ON t.id = r.tenant_id
         ${where}
        ORDER BY r.created_at DESC`,
      params,
    );
  }

  /** Rating agregado de una propiedad (promedio + cantidad). */
  async getPropertyRating(propertyId: number): Promise<PropertyRating> {
    const rows = await this.dataSource.query<
      Array<{ average: number; count: number }>
    >(
      `SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::float8 AS average,
              COUNT(*)::int AS count
         FROM reviews WHERE property_id = $1`,
      [propertyId],
    );

    return { average: rows[0]?.average ?? 0, count: rows[0]?.count ?? 0 };
  }

  private async findReservationForReview(
    reservationId: number,
    tenantId: number,
  ): Promise<ReservationForReview> {
    const rows = await this.dataSource.query<ReservationForReview[]>(
      `SELECT tenant_id, status, property_id, unit_id
         FROM reservations WHERE id = $1`,
      [reservationId],
    );

    const reservation = rows[0];
    if (!reservation || reservation.tenant_id !== tenantId) {
      throw new NotFoundException(`Reserva ${reservationId} no encontrada`);
    }
    return reservation;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === POSTGRES_UNIQUE_VIOLATION
    );
  }
}
