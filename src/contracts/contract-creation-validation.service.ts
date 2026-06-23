import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { CreateContractDto } from './dto/create-contract.dto';
import { ContractStatus } from './enums/contract-status.enum';

type SqlExecutor = Pick<DataSource, 'query'> | QueryRunner;

@Injectable()
export class ContractCreationValidationService {
  async validate(params: {
    createContractDto: CreateContractDto;
    adminUserId?: number;
    executor: SqlExecutor;
    schemaPrefix: string;
  }): Promise<void> {
    const { createContractDto, adminUserId, executor, schemaPrefix } = params;

    this.validateAdminIsNotTenant(createContractDto, adminUserId);

    if (createContractDto.application_id) {
      await this.validateApplicationBelongsToTenant(
        executor,
        schemaPrefix,
        createContractDto,
      );
    } else {
      await this.validateManualTenantEligibility(
        executor,
        schemaPrefix,
        createContractDto,
      );
    }

    await this.validateNoActiveContract(
      executor,
      schemaPrefix,
      createContractDto,
    );
    await this.validatePropertyAvailability(
      executor,
      schemaPrefix,
      createContractDto,
    );
  }

  private validateAdminIsNotTenant(
    createContractDto: CreateContractDto,
    adminUserId?: number,
  ): void {
    if (
      !createContractDto.application_id &&
      adminUserId &&
      createContractDto.tenant_id === adminUserId
    ) {
      throw new BadRequestException(
        'No puedes crear un contrato para ti mismo. Los administradores no pueden ser inquilinos.',
      );
    }
  }

  private async validateManualTenantEligibility(
    executor: SqlExecutor,
    schemaPrefix: string,
    createContractDto: CreateContractDto,
  ): Promise<void> {
    const tenant = await this.queryRows<{ role: string }>(
      executor,
      `SELECT role FROM ${schemaPrefix}"user" WHERE id = $1`,
      [createContractDto.tenant_id],
    );

    if (tenant.length === 0) {
      throw new NotFoundException(
        `Usuario con ID ${createContractDto.tenant_id} no encontrado`,
      );
    }

    if (tenant[0].role !== 'INQUILINO') {
      throw new BadRequestException(
        'El contrato solo puede ser asignado a usuarios con rol INQUILINO',
      );
    }

    const approvedApplication = await this.queryRows<{ id: number }>(
      executor,
      `SELECT id FROM ${schemaPrefix}rental_applications
       WHERE applicant_id = $1 AND status = 'APROBADA'
       ORDER BY created_at DESC
       LIMIT 1`,
      [createContractDto.tenant_id],
    );

    if (approvedApplication.length === 0) {
      throw new BadRequestException(
        'No se puede crear un contrato manual para este inquilino. ' +
          'El inquilino debe tener al menos una solicitud de alquiler aprobada antes de poder crear un contrato. ' +
          'Utilice el flujo de solicitudes para aprobar al inquilino primero.',
      );
    }
  }

  private async validateApplicationBelongsToTenant(
    executor: SqlExecutor,
    schemaPrefix: string,
    createContractDto: CreateContractDto,
  ): Promise<void> {
    const application = await this.queryRows<{
      id: number;
      applicant_id: number;
    }>(
      executor,
      `SELECT id, applicant_id FROM ${schemaPrefix}rental_applications WHERE id = $1`,
      [createContractDto.application_id],
    );

    if (application.length === 0) {
      throw new NotFoundException(
        `La solicitud con ID ${createContractDto.application_id} no existe`,
      );
    }

    if (application[0].applicant_id !== createContractDto.tenant_id) {
      throw new BadRequestException(
        'La solicitud no pertenece al inquilino especificado',
      );
    }
  }

  /**
   * Estados "en proceso" que impiden crear otro contrato para el mismo
   * inquilino: un borrador/pendiente/firmado o vigente ya ocupa al inquilino.
   * Los estados terminales (VENCIDO, RENOVADO, FINALIZADO, CANCELADO,
   * SUSPENDIDO) sí permiten un contrato nuevo.
   */
  private static readonly IN_FLIGHT_STATUSES: ContractStatus[] = [
    ContractStatus.BORRADOR,
    ContractStatus.PENDIENTE,
    ContractStatus.FIRMADO,
    ContractStatus.ACTIVO,
    ContractStatus.POR_VENCER,
  ];

  private async validateNoActiveContract(
    executor: SqlExecutor,
    schemaPrefix: string,
    createContractDto: CreateContractDto,
  ): Promise<void> {
    // status::text = ANY($2): comparar el enum de Postgres directamente con un
    // array de strings de JS provoca error de tipos (500); el cast lo evita.
    const existingContract = await this.queryRows<{
      id: number;
      status: string;
    }>(
      executor,
      `SELECT id, status FROM ${schemaPrefix}contracts
       WHERE tenant_id = $1 AND status::text = ANY($2)
       LIMIT 1`,
      [
        createContractDto.tenant_id,
        ContractCreationValidationService.IN_FLIGHT_STATUSES,
      ],
    );

    if (existingContract.length > 0) {
      throw new BadRequestException(
        `El inquilino ya tiene un contrato vigente o en proceso ` +
          `(ID: ${existingContract[0].id}, estado: ${existingContract[0].status}). ` +
          `No se puede crear otro hasta finalizar o cancelar el existente.`,
      );
    }
  }

  private async validatePropertyAvailability(
    executor: SqlExecutor,
    schemaPrefix: string,
    createContractDto: CreateContractDto,
  ): Promise<void> {
    const property = await this.queryRows<{ status: string }>(
      executor,
      `SELECT status FROM ${schemaPrefix}properties WHERE id = $1`,
      [createContractDto.property_id],
    );

    if (property.length === 0) {
      throw new NotFoundException(
        `Propiedad con ID ${createContractDto.property_id} no encontrada`,
      );
    }

    if (
      !createContractDto.application_id &&
      !['DISPONIBLE', 'RESERVADO'].includes(property[0].status)
    ) {
      throw new BadRequestException(
        `La propiedad no está disponible para un nuevo contrato (estado actual: ${property[0].status})`,
      );
    }
  }

  private async queryRows<T>(
    executor: SqlExecutor,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return (await executor.query(sql, params)) as unknown as T[];
  }
}
