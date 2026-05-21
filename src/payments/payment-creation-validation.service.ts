import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { CreatePaymentAsAdminDto } from './dto';
import {
  ActiveContractRow,
  ContractValidationRow,
} from './payment-creation.types';

@Injectable()
export class PaymentCreationValidationService {
  async resolveActiveContractForTenant(
    queryRunner: QueryRunner,
    tenantId: number,
    schemaPrefix: string,
  ): Promise<ActiveContractRow> {
    const contracts = (await queryRunner.query(
      `SELECT id, property_id FROM ${schemaPrefix}contracts
       WHERE tenant_id = $1 AND status IN ('ACTIVO', 'POR_VENCER')
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId],
    )) as ActiveContractRow[];

    const contract = contracts[0];
    if (!contract) {
      throw new BadRequestException('No tiene un contrato activo');
    }

    return contract;
  }

  async validateAdminPaymentContract(
    queryRunner: QueryRunner,
    dto: CreatePaymentAsAdminDto,
    schemaPrefix: string,
  ): Promise<ContractValidationRow> {
    const contracts = (await queryRunner.query(
      `SELECT id, tenant_id, property_id, status FROM ${schemaPrefix}contracts WHERE id = $1`,
      [dto.contract_id],
    )) as ContractValidationRow[];

    const contract = contracts[0];
    if (!contract) {
      throw new NotFoundException(`Contrato #${dto.contract_id} no encontrado`);
    }

    if (contract.tenant_id !== dto.tenant_id) {
      throw new BadRequestException(
        'El contrato no pertenece al inquilino especificado',
      );
    }

    if (contract.property_id !== dto.property_id) {
      throw new BadRequestException(
        'El contrato no pertenece a la propiedad especificada',
      );
    }

    return contract;
  }
}
