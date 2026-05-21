import { CreateContractDto } from '../contracts/dto/create-contract.dto';
import type { ApplicationResult } from './applications.service';
import { ApproveApplicationDto } from './dto/approve-application.dto';

export interface GeneratedContractSummary {
  id: number;
  contract_number: string;
  tenant_id: number;
  property_id: number;
  status: string;
  monthly_rent: number;
  currency: string;
  deposit_amount: number;
}

export interface ApplicationApprovalResult {
  message: string;
  application: {
    id: number;
    status: string;
    property: string | undefined;
    applicant: string | undefined;
  };
  contract_generated: {
    id: number;
    number: string;
    status: string;
    monthly_rent: number;
    currency: string;
    deposit_amount: number;
    message: string;
  };
}

export interface ApplicationApprovalSideEffectsParams {
  adminId: number;
  application: ApplicationResult;
  contract: GeneratedContractSummary;
  contractData: CreateContractDto;
  schemaName: string;
  schemaPrefix: string;
  tenantSlug: string;
  updateDto: ApproveApplicationDto;
}
