import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { Money, allocate, MoneyDecimal, MONEY_ROUNDING } from '../common/money';

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
    // Aritmética exacta en decimal (sin float). La comisión es un cargo: se
    // redondea a 2 decimales con la política central. El neto se deriva exacto.
    const commissionAmount = new MoneyDecimal(grossRent)
      .times(commissionPercentage)
      .div(100)
      .toDecimalPlaces(2, MONEY_ROUNDING)
      .toNumber();
    const netAmount = new MoneyDecimal(grossRent)
      .minus(commissionAmount)
      .minus(maintenanceDeductions)
      .toDecimalPlaces(2, MONEY_ROUNDING)
      .toNumber();
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
  async executeSplit(
    params: ExecuteSplitParams,
    externalQueryRunner?: QueryRunner,
  ): Promise<void> {
    const {
      paymentId,
      totalAmount,
      propertyId,
      paymentDate,
      currency,
      schemaName,
      unitId,
    } = params;

    const queryRunner =
      externalQueryRunner ?? this.dataSource.createQueryRunner();
    const ownsTransaction = !externalQueryRunner;

    if (ownsTransaction) {
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    try {
      // 1. Leer commission_percentage del tenant
      const configRows = (await queryRunner.query(
        `SELECT commission_percentage FROM ${quoteIdent(schemaName)}.tenant_config LIMIT 1`,
      )) as Array<{ commission_percentage: number }>;
      const commissionPercentage =
        configRows.length > 0
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
      const owners = (await queryRunner.query(
        `SELECT po.rental_owner_id, ro.name AS owner_name, po.ownership_percentage
           FROM ${quoteIdent(schemaName)}.property_owners po
           JOIN ${quoteIdent(schemaName)}.rental_owners ro ON ro.id = po.rental_owner_id
           WHERE po.property_id = $1
             AND po.ownership_percentage > 0`,
        [propertyId],
      )) as Array<{
        rental_owner_id: number;
        owner_name: string;
        ownership_percentage: number;
      }>;

      if (!owners || owners.length === 0) {
        if (ownsTransaction) {
          await queryRunner.commitTransaction();
        }
        return;
      }

      const totalOwnership = owners.reduce(
        (sum, owner) => sum + Number(owner.ownership_percentage),
        0,
      );
      if (Math.abs(totalOwnership - 100) > 0.01) {
        throw new BadRequestException(
          `Los porcentajes de propiedad suman ${totalOwnership}%, deben sumar 100%`,
        );
      }

      // 4. Repartir con "largest remainder": la suma de las partes es EXACTA-
      //    mente igual al total (no se pierde ni se crea un centavo entre los
      //    propietarios). Reemplaza el redondeo por-propietario que descuadraba.
      const ratios = owners.map((o) => Number(o.ownership_percentage));
      const grossRents = allocate(
        Money.of(String(totalAmount), currency),
        ratios,
      );
      const maintenances = allocate(
        Money.of(String(maintenanceDeductions), currency),
        ratios,
      );

      // 4. Calcular y persistir split por propietario
      for (let i = 0; i < owners.length; i++) {
        const owner = owners[i];
        const grossRent = grossRents[i].toNumber();
        const ownerMaintenance = maintenances[i].toNumber();
        const split = this.calculateSplit(
          grossRent,
          commissionPercentage,
          ownerMaintenance,
        );

        // 4a. Registrar en payment_splits
        await queryRunner.query(
          `INSERT INTO ${quoteIdent(schemaName)}.payment_splits
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

      if (ownsTransaction) {
        await queryRunner.commitTransaction();
      }
      this.logger.log(
        `Split ejecutado: pago #${paymentId}, propiedad #${propertyId}, ${owners.length} propietario(s)`,
      );
    } catch (error: unknown) {
      if (ownsTransaction) {
        await queryRunner.rollbackTransaction();
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Split payment fallido para pago #${paymentId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      if (ownsTransaction) {
        await queryRunner.release();
      }
    }
  }

  // ─── Privados ─────────────────────────────────────────────────────────────

  private async fetchMaintenanceDeductions(
    queryRunner: QueryRunner,
    propertyId: number,
    month: number,
    year: number,
    schemaName: string,
  ): Promise<number> {
    const hasEstimatedCostColumn = (await queryRunner.query(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = $1
           AND table_name = 'maintenance_requests'
           AND column_name = 'estimated_cost'
       ) AS exists`,
      [schemaName],
    )) as Array<{ exists: boolean }>;

    if (!hasEstimatedCostColumn[0]?.exists) {
      return 0;
    }

    const rows = (await queryRunner.query(
      `SELECT COALESCE(SUM(estimated_cost), 0) AS total
       FROM ${quoteIdent(schemaName)}.maintenance_requests
       WHERE property_id = $1
         AND status = 'COMPLETED'
         AND EXTRACT(MONTH FROM updated_at) = $2
         AND EXTRACT(YEAR  FROM updated_at) = $3
         AND estimated_cost IS NOT NULL`,
      [propertyId, month, year],
    )) as Array<{ total: string }>;

    return rows.length > 0 ? Number(rows[0].total) : 0;
  }

  private async upsertOwnerStatement(
    queryRunner: QueryRunner,
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
    const {
      rentalOwnerId,
      propertyId,
      unitId,
      month,
      year,
      split,
      currency,
      schemaName,
    } = params;

    // Verificar si ya existe un statement para este propietario/propiedad/período
    const existing = (await queryRunner.query(
      `SELECT id FROM ${quoteIdent(schemaName)}.owner_statements
       WHERE rental_owner_id = $1
         AND property_id     = $2
         AND period_month    = $3
         AND period_year     = $4`,
      [rentalOwnerId, propertyId, month, year],
    )) as Array<{ id: number }>;

    if (existing && existing.length > 0) {
      // Acumular: sumar al registro existente
      await queryRunner.query(
        `UPDATE ${quoteIdent(schemaName)}.owner_statements SET
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
        `INSERT INTO ${quoteIdent(schemaName)}.owner_statements (
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

  /** Redondea a 2 decimales con decimal exacto (sin float) y política central. */
  round2(value: number): number {
    return new MoneyDecimal(value)
      .toDecimalPlaces(2, MONEY_ROUNDING)
      .toNumber();
  }
}
