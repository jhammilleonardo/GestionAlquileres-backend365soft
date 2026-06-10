import { Injectable } from '@nestjs/common';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractStatus } from './enums/contract-status.enum';
import { RenewContractDto } from './dto/renew-contract.dto';
import {
  ContractFilters,
  ContractQueriesService,
} from './contract-queries.service';
import { ContractRenewalService } from './contract-renewal.service';
import {
  ContractSigningService,
  SignatureEvidence,
} from './contract-signing.service';
import {
  ContractCreatedSideEffectsParams,
  ContractCreationService,
  CreateContractOptions,
} from './contract-creation.service';
import { ContractPdfResult, ContractPdfService } from './contract-pdf.service';
import { ContractUpdateService } from './contract-update.service';

export interface ContractResult {
  id: number;
  contract_number: string;
  tenant_id: number;
  property_id: number;
  start_date: string | Date;
  end_date: string | Date;
  duration_months?: number | null;
  monthly_rent: number;
  currency: string;
  payment_day: number;
  deposit_amount: number;
  payment_method?: string | null;
  late_fee_percentage?: number | null;
  grace_days?: number | null;
  unit_id?: number | null;
  included_services?: string[] | string | null;
  tenant_responsibilities?: string | null;
  owner_responsibilities?: string | null;
  prohibitions?: string | null;
  coexistence_rules?: string | null;
  renewal_terms?: string | null;
  termination_terms?: string | null;
  jurisdiction?: string | null;
  auto_renew?: boolean | null;
  renewal_notice_days?: number | null;
  auto_increase_percentage?: number | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
  bank_name?: string | null;
  bank_account_holder?: string | null;
  status: ContractStatus;
  terms_conditions?: string | null;
  signature_image?: string | null;
  signature_method?: string | null;
  signed_user_agent?: string | null;
  tenant_signature_date?: string | Date | null;
  signed_ip?: string | null;
  created_at: Date;
  updated_at: Date;
  // Campos de JOIN — SQL retorna null cuando no hay coincidencia
  property_title?: string | null;
  property_description?: string | null;
  property_status?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  tenant_name?: string | null;
  tenant_email?: string | null;
  tenant_phone?: string | null;
}

@Injectable()
export class ContractsService {
  constructor(
    private contractQueriesService: ContractQueriesService,
    private contractCreationService: ContractCreationService,
    private contractUpdateService: ContractUpdateService,
    private contractRenewalService: ContractRenewalService,
    private contractSigningService: ContractSigningService,
    private contractPdfService: ContractPdfService,
  ) {}

  async create(
    createContractDto: CreateContractDto,
    adminUserId?: number,
    tenantSlug?: string,
    options: CreateContractOptions = {},
  ) {
    return this.contractCreationService.create(
      createContractDto,
      adminUserId,
      tenantSlug,
      options,
    );
  }

  async emitContractCreatedSideEffects(
    params: ContractCreatedSideEffectsParams,
  ): Promise<void> {
    return this.contractCreationService.emitCreatedSideEffects(params);
  }

  async findAll(filters: ContractFilters, tenantSlug?: string) {
    return this.contractQueriesService.findAll(filters, tenantSlug);
  }

  async findOne(id: number, tenantSlug?: string) {
    return this.contractQueriesService.findOne(id, tenantSlug);
  }

  async update(
    id: number,
    updateContractDto: UpdateContractDto,
    userId: number = 0,
    tenantSlug?: string,
  ) {
    return this.contractUpdateService.update(
      id,
      updateContractDto,
      userId,
      tenantSlug,
    );
  }

  async signContract(
    id: number,
    userId: number,
    ip: string,
    tenantSlug?: string,
    signature?: SignatureEvidence,
  ) {
    return this.contractSigningService.signContract(
      id,
      userId,
      ip,
      tenantSlug,
      signature,
    );
  }

  async getMetrics(tenantSlug?: string) {
    return this.contractQueriesService.getMetrics(tenantSlug);
  }

  async generatePdf(
    id: number,
    tenantSlug: string,
    baseUrl: string = '',
  ): Promise<ContractPdfResult> {
    return this.contractPdfService.generatePdf(id, tenantSlug, baseUrl);
  }

  async renew(
    id: number,
    dto: RenewContractDto = {},
    userId: number = 0,
    tenantSlug?: string,
  ): Promise<ContractResult> {
    return this.contractRenewalService.renew(id, dto, userId, tenantSlug);
  }

  async getContractHistory(
    id: number,
    tenantSlug?: string,
  ): Promise<ContractResult[]> {
    return this.contractQueriesService.getContractHistory(id, tenantSlug);
  }
}
