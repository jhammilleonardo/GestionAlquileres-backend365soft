import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OwnerStatementPdfService } from '../owner-statements/owner-statement-pdf.service';

// ─── Interfaces de respuesta ──────────────────────────────────────────────────

export interface OwnerDashboardDto {
  property_count: number;
  active_tenant_count: number;
  pending_balance: number;
  currency: string;
  active_maintenance_count: number;
  pending_statements: number;
}

export interface OwnerPropertyDto {
  id: number;
  title: string;
  status: string;
  monthly_rent: string;
  currency: string;
  ownership_percentage: number;
  is_primary: boolean;
  street_address: string;
  city: string;
  country: string;
  current_tenant_name: string | null;
  current_tenant_email: string | null;
  current_tenant_phone: string | null;
  contract_number: string | null;
  contract_status: string | null;
  contract_end_date: string | null;
}

export interface OwnerStatementSummaryDto {
  id: number;
  property_id: number;
  property_title: string;
  period_month: number;
  period_year: number;
  gross_rent: number;
  maintenance_deduction: number;
  management_commission: number;
  net_amount: number;
  currency: string;
  status: string;
  transferred_at: Date | null;
  generated_at: Date;
}

export interface OwnerMaintenanceDto {
  id: number;
  ticket_number: string;
  title: string;
  description: string;
  category: string | null;
  status: string;
  priority: string;
  current_stage: string;
  owner_authorized: boolean;
  property_id: number;
  property_title: string;
  technician_name: string | null;
  due_date: string | null;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface OwnerContractDto {
  id: number;
  contract_number: string;
  status: string;
  start_date: string;
  end_date: string;
  monthly_rent: number;
  currency: string;
  property_id: number;
  property_title: string;
  tenant_name: string;
  is_signed: boolean;
  pdf_url: string | null;
}

interface OwnerStatementPdfRow {
  id: number;
  owner_name: string;
  property_title: string;
  property_address: string | null;
  property_city: string | null;
  property_country: string | null;
  tenant_name: string | null;
  period_year: number;
  period_month: number;
  gross_rent: string | number;
  maintenance_deduction: string | number;
  management_commission: string | number;
  net_amount: string | number;
  currency: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class OwnerPortalService {
  private readonly logger = new Logger(OwnerPortalService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly pdfService: OwnerStatementPdfService,
  ) {}

  /**
   * Resumen del dashboard del propietario:
   * propiedades, inquilinos activos, saldo pendiente, mantenimientos activos y liquidaciones pendientes.
   */
  async getDashboard(rentalOwnerId: number): Promise<OwnerDashboardDto> {
    this.logger.log(`Dashboard solicitado para propietario ${rentalOwnerId}`);

    const [
      propertiesResult,
      tenantsResult,
      balanceResult,
      maintenanceResult,
      statementsResult,
    ] = await Promise.all([
      // Cantidad de propiedades del propietario
      this.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(DISTINCT po.property_id)::int AS count
           FROM property_owners po
           WHERE po.rental_owner_id = $1`,
        [rentalOwnerId],
      ),

      // Cantidad de inquilinos con contrato vigente en sus propiedades
      this.dataSource.query<{ count: string; currency: string }[]>(
        `SELECT COUNT(DISTINCT c.tenant_id)::int AS count
           FROM property_owners po
           JOIN contracts c ON c.property_id = po.property_id
           WHERE po.rental_owner_id = $1
             AND c.status IN ('ACTIVO', 'POR_VENCER', 'RENOVADO')`,
        [rentalOwnerId],
      ),

      // Saldo pendiente: liquidaciones en estado 'pending'
      this.dataSource.query<{ pending_balance: string; currency: string }[]>(
        `SELECT COALESCE(SUM(os.net_amount), 0)::numeric AS pending_balance,
                  COALESCE(MAX(os.currency), 'BOB')        AS currency
           FROM owner_statements os
           WHERE os.rental_owner_id = $1
             AND os.status = 'pending'`,
        [rentalOwnerId],
      ),

      // Solicitudes de mantenimiento activas en sus propiedades
      this.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(mr.id)::int AS count
           FROM maintenance_requests mr
           JOIN property_owners po ON po.property_id = mr.property_id
           WHERE po.rental_owner_id = $1
             AND mr.status IN ('NEW', 'IN_PROGRESS')`,
        [rentalOwnerId],
      ),

      // Liquidaciones pendientes de transferencia
      this.dataSource.query<{ count: string }[]>(
        `SELECT COUNT(id)::int AS count
           FROM owner_statements
           WHERE rental_owner_id = $1
             AND status = 'pending'`,
        [rentalOwnerId],
      ),
    ]);

    return {
      property_count: Number(propertiesResult[0]?.count ?? 0),
      active_tenant_count: Number(tenantsResult[0]?.count ?? 0),
      pending_balance: Number(balanceResult[0]?.pending_balance ?? 0),
      currency: balanceResult[0]?.currency ?? 'BOB',
      active_maintenance_count: Number(maintenanceResult[0]?.count ?? 0),
      pending_statements: Number(statementsResult[0]?.count ?? 0),
    };
  }

  /**
   * Lista propiedades del propietario con estado, inquilino actual y datos del contrato.
   */
  async getProperties(rentalOwnerId: number): Promise<OwnerPropertyDto[]> {
    return this.dataSource.query<OwnerPropertyDto[]>(
      `SELECT DISTINCT ON (p.id)
         p.id,
         p.title,
         p.status,
         p.monthly_rent,
         p.currency,
         po.ownership_percentage,
         po.is_primary,
         COALESCE(pa.street_address, '') AS street_address,
         COALESCE(pa.city, '')           AS city,
         COALESCE(pa.country, '')        AS country,
         u.name                          AS current_tenant_name,
         u.email                         AS current_tenant_email,
         u.phone                         AS current_tenant_phone,
         c.contract_number               AS contract_number,
         c.status                        AS contract_status,
         c.end_date::text                AS contract_end_date
       FROM property_owners po
       JOIN properties p ON p.id = po.property_id
       LEFT JOIN property_addresses pa
              ON pa.property_id = p.id AND pa.address_type = 'address_1'
       -- Contrato vigente más relevante: prioriza ACTIVO/POR_VENCER, pero cae a
       -- RENOVADO para no dejar una propiedad ocupada sin inquilino visible.
       LEFT JOIN LATERAL (
         SELECT ct.contract_number, ct.status, ct.end_date, ct.tenant_id
         FROM contracts ct
         WHERE ct.property_id = p.id
           AND ct.status IN ('ACTIVO', 'POR_VENCER', 'RENOVADO')
         ORDER BY
           CASE ct.status
             WHEN 'ACTIVO' THEN 0
             WHEN 'POR_VENCER' THEN 1
             ELSE 2
           END,
           ct.start_date DESC
         LIMIT 1
       ) c ON true
       LEFT JOIN "user" u ON u.id = c.tenant_id
       WHERE po.rental_owner_id = $1
       ORDER BY p.id, po.is_primary DESC, p.title ASC`,
      [rentalOwnerId],
    );
  }

  /**
   * Historial de liquidaciones del propietario, ordenadas por período descendente.
   */
  async getStatements(
    rentalOwnerId: number,
  ): Promise<OwnerStatementSummaryDto[]> {
    const rows = await this.dataSource.query<OwnerStatementSummaryDto[]>(
      `SELECT
         os.id,
         os.property_id,
         p.title AS property_title,
         os.period_month,
         os.period_year,
         os.gross_rent::numeric,
         os.maintenance_deduction::numeric,
         os.management_commission::numeric,
         os.net_amount::numeric,
         os.currency,
         os.status,
         os.transferred_at,
         os.generated_at
       FROM owner_statements os
       JOIN properties p ON p.id = os.property_id
       WHERE os.rental_owner_id = $1
       ORDER BY os.period_year DESC, os.period_month DESC`,
      [rentalOwnerId],
    );

    return rows.map((r) => ({
      ...r,
      gross_rent: Number(r.gross_rent),
      maintenance_deduction: Number(r.maintenance_deduction),
      management_commission: Number(r.management_commission),
      net_amount: Number(r.net_amount),
    }));
  }

  /**
   * Genera el PDF de una liquidación y valida que pertenezca al propietario.
   */
  async getStatementPdf(
    statementId: number,
    rentalOwnerId: number,
    lang: 'es' | 'en' = 'es',
  ): Promise<string> {
    // Validar ownership del statement antes de generar el PDF
    await this.assertStatementBelongsToOwner(statementId, rentalOwnerId);

    const result = await this.dataSource.query<OwnerStatementPdfRow[]>(
      `SELECT
         os.id,
         ro.name    AS owner_name,
         p.title    AS property_title,
         pa.street_address AS property_address,
         pa.city    AS property_city,
         pa.country AS property_country,
         u.name     AS tenant_name,
         os.period_year,
         os.period_month,
         os.gross_rent,
         os.maintenance_deduction,
         os.management_commission,
         os.net_amount,
         os.currency
       FROM owner_statements os
       JOIN rental_owners ro ON ro.id = os.rental_owner_id
       JOIN properties p ON p.id = os.property_id
       LEFT JOIN property_addresses pa
              ON pa.property_id = p.id AND pa.address_type = 'address_1'
       LEFT JOIN contracts c
              ON c.property_id = p.id AND c.status IN ('ACTIVO', 'POR_VENCER')
       LEFT JOIN "user" u ON u.id = c.tenant_id
       WHERE os.id = $1`,
      [statementId],
    );

    if (!result || result.length === 0) {
      throw new NotFoundException(
        `No se encontraron datos para la liquidación ${statementId}`,
      );
    }

    const data = result[0];
    return this.pdfService.generatePdf(
      {
        id: data.id,
        owner_name: data.owner_name,
        property_title: data.property_title,
        property_address: data.property_address ?? 'No especificada',
        property_city: data.property_city ?? '',
        property_country: data.property_country ?? '',
        tenant_name: data.tenant_name ?? undefined,
        period_year: data.period_year,
        period_month: data.period_month,
        gross_rent: Number(data.gross_rent),
        maintenance_deduction: Number(data.maintenance_deduction),
        management_commission: Number(data.management_commission),
        net_amount: Number(data.net_amount),
        currency: data.currency,
      },
      lang,
    );
  }

  /**
   * Solicitudes de mantenimiento activas (NEW | IN_PROGRESS) en propiedades del propietario.
   */
  async getMaintenance(rentalOwnerId: number): Promise<OwnerMaintenanceDto[]> {
    return this.dataSource.query<OwnerMaintenanceDto[]>(
      `SELECT
         mr.id,
         mr.ticket_number,
         mr.title,
         mr.description,
         mr.category,
         mr.status,
         mr.priority,
         mr.current_stage,
         mr.owner_authorized,
         mr.property_id,
         p.title AS property_title,
         tech.name AS technician_name,
         mr.due_date::text AS due_date,
         mr.completed_at,
         mr.created_at,
         mr.updated_at
       FROM maintenance_requests mr
       JOIN property_owners po ON po.property_id = mr.property_id
       JOIN properties p ON p.id = mr.property_id
       LEFT JOIN "user" tech ON tech.id = mr.assigned_to
       WHERE po.rental_owner_id = $1
         AND mr.status IN ('NEW', 'IN_PROGRESS')
       ORDER BY mr.updated_at DESC`,
      [rentalOwnerId],
    );
  }

  /**
   * Autoriza el gasto de una solicitud de mantenimiento.
   * Solo Bolivia — el propietario confirma que acepta el costo estimado.
   * Valida que la solicitud sea de una de sus propiedades.
   */
  async authorizeMaintenance(
    requestId: number,
    rentalOwnerId: number,
  ): Promise<void> {
    // Valida ownership y que la propiedad esté en Bolivia (único país donde aplica esta acción)
    const rows = await this.dataSource.query<Array<{ id: number }>>(
      `SELECT mr.id
       FROM maintenance_requests mr
       JOIN property_owners po ON po.property_id = mr.property_id
       JOIN property_addresses pa ON pa.property_id = mr.property_id
                                  AND pa.address_type = 'address_1'
       WHERE mr.id = $1
         AND po.rental_owner_id = $2
         AND pa.country ILIKE 'Bolivia'`,
      [requestId, rentalOwnerId],
    );

    if (rows.length === 0) {
      throw new ForbiddenException(
        'No tienes permiso para autorizar esta solicitud o la propiedad no está en Bolivia',
      );
    }

    await this.dataSource.query(
      `UPDATE maintenance_requests
       SET owner_authorized = true, updated_at = NOW()
       WHERE id = $1`,
      [requestId],
    );

    this.logger.log(
      `Propietario ${rentalOwnerId} autorizó solicitud de mantenimiento ${requestId}`,
    );
  }

  /** Contratos firmados y con PDF disponible en propiedades del propietario. */
  async getContracts(rentalOwnerId: number): Promise<OwnerContractDto[]> {
    return this.dataSource.query<OwnerContractDto[]>(
      `SELECT
         c.id,
         c.contract_number,
         c.status,
         c.start_date::text,
         c.end_date::text,
         c.monthly_rent::numeric,
         c.currency,
         c.property_id,
         p.title   AS property_title,
         u.name    AS tenant_name,
         c.is_signed,
         c.pdf_url
       FROM contracts c
       JOIN property_owners po ON po.property_id = c.property_id
       JOIN properties p ON p.id = c.property_id
       JOIN "user" u ON u.id = c.tenant_id
       WHERE po.rental_owner_id = $1
         AND c.is_signed = true
         AND c.pdf_url IS NOT NULL
         AND c.pdf_url <> ''
       ORDER BY c.start_date DESC, c.id DESC`,
      [rentalOwnerId],
    );
  }

  // ─── Helpers internos ─────────────────────────────────────────────────────

  private async assertStatementBelongsToOwner(
    statementId: number,
    rentalOwnerId: number,
  ): Promise<void> {
    const rows = await this.dataSource.query<Array<{ id: number }>>(
      `SELECT id FROM owner_statements
       WHERE id = $1 AND rental_owner_id = $2`,
      [statementId, rentalOwnerId],
    );

    if (rows.length === 0) {
      throw new ForbiddenException('No tienes acceso a esta liquidación');
    }
  }
}
