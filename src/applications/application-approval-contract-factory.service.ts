import { Injectable } from '@nestjs/common';
import { CreateContractDto } from '../contracts/dto/create-contract.dto';
import type { ApplicationResult } from './applications.service';
import { ApproveApplicationDto } from './dto/approve-application.dto';

@Injectable()
export class ApplicationApprovalContractFactoryService {
  buildContractData(
    applicationId: number,
    application: ApplicationResult,
    approveDto: ApproveApplicationDto,
  ): CreateContractDto {
    const startDate = approveDto.start_date
      ? new Date(approveDto.start_date)
      : new Date();
    const endDate = approveDto.end_date
      ? new Date(approveDto.end_date)
      : new Date(
          Date.UTC(
            startDate.getFullYear() + 1,
            startDate.getMonth(),
            startDate.getDate(),
          ),
        );
    const depositAmount = approveDto.deposit_amount ?? approveDto.monthly_rent;

    const contractData: CreateContractDto = {
      property_id: Number(application.property_id),
      tenant_id: Number(application.applicant_id),
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      monthly_rent: approveDto.monthly_rent,
      // currency se omite si no viene: ContractCreationService la resuelve desde
      // la configuración regional del tenant (US=USD, BO=BOB, GT=GTQ, HN=HNL).
      payment_day: approveDto.payment_day || 5,
      deposit_amount: depositAmount,
      application_id: applicationId,
    };

    this.copyOptionalContractFields(contractData, approveDto);
    return contractData;
  }

  private copyOptionalContractFields(
    contractData: CreateContractDto,
    approveDto: ApproveApplicationDto,
  ): void {
    if (approveDto.currency) {
      contractData.currency = approveDto.currency;
    }
    if (approveDto.payment_method) {
      contractData.payment_method = approveDto.payment_method;
    }
    if (approveDto.late_fee_percentage !== undefined) {
      contractData.late_fee_percentage = approveDto.late_fee_percentage;
    }
    if (approveDto.grace_days !== undefined) {
      contractData.grace_days = approveDto.grace_days;
    }
    if (approveDto.included_services) {
      contractData.included_services = approveDto.included_services;
    }
    if (approveDto.key_delivery_date) {
      contractData.key_delivery_date = approveDto.key_delivery_date;
    }
    if (approveDto.tenant_responsibilities) {
      contractData.tenant_responsibilities = approveDto.tenant_responsibilities;
    }
    if (approveDto.owner_responsibilities) {
      contractData.owner_responsibilities = approveDto.owner_responsibilities;
    }
    if (approveDto.prohibitions) {
      contractData.prohibitions = approveDto.prohibitions;
    }
    if (approveDto.coexistence_rules) {
      contractData.coexistence_rules = approveDto.coexistence_rules;
    }
    if (approveDto.renewal_terms) {
      contractData.renewal_terms = approveDto.renewal_terms;
    }
    if (approveDto.termination_terms) {
      contractData.termination_terms = approveDto.termination_terms;
    }
    if (approveDto.jurisdiction) {
      contractData.jurisdiction = approveDto.jurisdiction;
    }
    if (approveDto.auto_renew !== undefined) {
      contractData.auto_renew = approveDto.auto_renew;
    }
    if (approveDto.renewal_notice_days !== undefined) {
      contractData.renewal_notice_days = approveDto.renewal_notice_days;
    }
    if (approveDto.auto_increase_percentage !== undefined) {
      contractData.auto_increase_percentage =
        approveDto.auto_increase_percentage;
    }
    if (approveDto.bank_account_number) {
      contractData.bank_account_number = approveDto.bank_account_number;
    }
    if (approveDto.bank_account_type) {
      contractData.bank_account_type = approveDto.bank_account_type;
    }
    if (approveDto.bank_name) {
      contractData.bank_name = approveDto.bank_name;
    }
    if (approveDto.bank_account_holder) {
      contractData.bank_account_holder = approveDto.bank_account_holder;
    }
  }
}
