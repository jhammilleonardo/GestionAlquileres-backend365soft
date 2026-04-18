import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface SplitCalculation {
  grossRent: number;
  commissionAmount: number;
  maintenanceDeductions: number;
  netAmount: number;
}

export interface OwnerSplit extends SplitCalculation {
  rentalOwnerId: number;
  ownerName: string;
  ownershipPercentage: number;
}

export interface ExecuteSplitParams {
  paymentId: number;
  totalAmount: number;
  propertyId: number;
  paymentDate: Date;
  currency: string;
  schemaName: string;
  unitId?: number;
}

const PAYMENT_STATUS_APPROVED = 'APPROVED';

@Injectable()
export class SplitPaymentService {
  private readonly logger = new Logger(SplitPaymentService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Cálculo puro del split para un propietario.
   * Sin dependencias externas: ideal para unit tests.
   *
   * Fórmula: net_amount = gross_rent - commission_amount - maintenance_deductions
   */
  calculateSplit(
    grossRent: number,
    commissionPercentage: number,
    maintenanceDeductions: number,
  ): SplitCalculation {
    const commissionAmount = this.round2(grossRent * commissionPercentage / 100);
    const netAmount = this.round2(grossRent - commissionAmount - maintenanceDeductions);
    return { grossRent, commissionAmount, maintenanceDeductions, netAmount };
  }

  /**
   * Extrae mes y año desde una fecha de pago.
   * Separado para facilitar tests del período correcto.
   */
  extractPeriod(date: Date): { month: number; year: number } {
    return {
      month: date.getMonth() + 1, // getMonth() retorna 0-11
      year: date.getFullYear(),
    };
  }

  /**
   * Valida que el pago esté APPROVED antes de ejecutar el split.
   * Lanza BadRequestException si el estado no es válido.
   */
  validatePaymentStatus(status: string): void {
    if (status !== PAYMENT_STATUS_APPROVED) {
      throw new BadRequestException(
        `Solo se genera split para pagos APPROVED. Estado actual: ${status}`,
      );
    }
  }

  /**
   * Ejecuta el split de forma completamente atómica.
   * Si cualquier operación falla, se hace rollback de todo:
   *   - payment_splits
   *   - owner_statements (upsert)
   *
   * Si la propiedad no tiene propietarios, termina sin error.
   */
  async executeSplit(params: ExecuteSplitParams): Promise<void> {
    const { paymentId, totalAmount, propertyId, paymentDate, currency, schemaName, unitId } = params;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SET search_path TO ${schemaName}, public`);

      // 1. Leer commission_percentage del tenant
      const configRows: { commission_percentage: number }[] = await queryRunner.query(
        `SELECT commission_percentage FROM ${schemaName}.tenant_config LIMIT 1`,
      );
      const commissionPercentage = configRows.length > 0
        ? Number(configRows[0].commission_percentage ?? 0)
        : 0;

      // 2. Leer costos de mantenimiento autorizados para la propiedad en el período
      const { month, year } = this.extractPeriod(paymentDate);
      const maintenanceDeductions = await this.fetchMaintenanceDeductions(
        queryRunner,
        propertyId,
        month,
        year,
        schemaName,
      );

      // 3. Leer propietarios de la propiedad
      const owners: { rental_owner_id: number; owner_name: string; ownership_percentage: number }[] =
        await queryRunner.query(
          `SELECT po.rental_owner_id, ro.name AS owner_name, po.ownership_percentage
           FROM ${schemaName}.property_owners po
           JOIN ${schemaName}.rental_owners ro ON ro.id = po.rental_owner_id
           WHERE po.property_id = $1
             AND po.ownership_percentage > 0`,
          [propertyId],
        );

      if (!owners || owners.length === 0) {
        await queryRunner.commitTransaction();
        return;
      }

      // 4. Calcular y persistir split por propietario
      for (const owner of owners) {
        const grossRent = this.round2(totalAmount * owner.ownership_percentage / 100);
        const ownerMaintenance = this.round2(maintenanceDeductions * owner.ownership_percentage / 100);
        const split = this.calculateSplit(grossRent, commissionPercentage, ownerMaintenance);

        // 4a. Registrar en payment_splits
        await queryRunner.query(
          `INSERT INTO ${schemaName}.payment_splits
             (payment_id, rental_owner_id, owner_name, ownership_pct, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            paymentId,
            owner.rental_owner_id,
            owner.owner_name,
            owner.ownership_percentage,
            split.grossRent,
          ],
        );

        // 4b. Upsert owner_statement
        await this.upsertOwnerStatement(queryRunner, {
          rentalOwnerId: owner.rental_owner_id,
          propertyId,
          unitId,
          month,
          year,
          split,
          currency,
          schemaName,
        });
      }

      await queryRunner.commitTransaction();
      this.logger.log(
        `Split ejecutado: pago #${paymentId}, propiedad #${propertyId}, ${owners.length} propietario(s)`,
      );
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Split payment fallido para pago #${paymentId}: ${message}`, error instanceof Error ? error.stack : undefined);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  // ─── Privados ─────────────────────────────────────────────────────────────

  private async fetchMaintenanceDeductions(
    queryRunner: ReturnType<DataSource['createQueryRunner']>,
    propertyId: number,
    month: number,
    year: number,
    schemaName: string,
  ): Promise<number> {
    try {
      const rows: { total: string }[] = await queryRunner.query(
        `SELECT COALESCE(SUM(estimated_cost), 0) AS total
         FROM ${schemaName}.maintenance_requests
         WHERE property_id = $1
           AND status = 'COMPLETED'
           AND EXTRACT(MONTH FROM updated_at) = $2
           AND EXTRACT(YEAR  FROM updated_at) = $3
           AND estimated_cost IS NOT NULL`,
        [propertyId, month, year],
      );
      return rows.length > 0 ? Number(rows[0].total) : 0;
    } catch {
      // La tabla puede no tener estimated_cost — no es bloqueante
      return 0;
    }
  }

  private async upsertOwnerStatement(
    queryRunner: ReturnType<DataSource['createQueryRunner']>,
    params: {
      rentalOwnerId: number;
      propertyId: number;
      unitId?: number;
      month: number;
      year: number;
      split: SplitCalculation;
      currency: string;
      schemaName: string;
    },
  ): Promise<void> {
    const { rentalOwnerId, propertyId, unitId, month, year, split, currency, schemaName } = params;

    // Verificar si ya existe un statement para este propietario/propiedad/período
    const existing: { id: number }[] = await queryRunner.query(
      `SELECT id FROM ${schemaName}.owner_statements
       WHERE rental_owner_id = $1
         AND property_id     = $2
         AND period_month    = $3
         AND period_year     = $4`,
      [rentalOwnerId, propertyId, month, year],
    );

    if (existing && existing.length > 0) {
      // Acumular: sumar al registro existente
      await queryRunner.query(
        `UPDATE ${schemaName}.owner_statements SET
           gross_rent             = gross_rent             + $1,
           management_commission  = management_commission  + $2,
           maintenance_deduction  = maintenance_deduction  + $3,
           net_amount             = net_amount             + $4,
           payment_count          = payment_count          + 1,
           updated_at             = NOW()
         WHERE id = $5`,
        [
          split.grossRent,
          split.commissionAmount,
          split.maintenanceDeductions,
          split.netAmount,
          existing[0].id,
        ],
      );
    } else {
      await queryRunner.query(
        `INSERT INTO ${schemaName}.owner_statements (
           rental_owner_id, property_id, unit_id, period_month, period_year,
           gross_rent, management_commission, maintenance_deduction, net_amount,
           currency, payment_count, status,
           generated_at, created_at, updated_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,'pending',NOW(),NOW(),NOW())`,
        [
          rentalOwnerId,
          propertyId,
          unitId ?? null,
          month,
          year,
          split.grossRent,
          split.commissionAmount,
          split.maintenanceDeductions,
          split.netAmount,
          currency,
        ],
      );
    }
  }

  /** Redondea a 2 decimales usando multiplicación entera para evitar imprecisión float. */
  round2(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
