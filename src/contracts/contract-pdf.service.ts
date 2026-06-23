import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { basename } from 'path';
import { DataSource } from 'typeorm';
import { ContractQueriesService } from './contract-queries.service';
import { PdfService } from './pdf.service';
import { TenantsService } from '../tenants/tenants.service';
import {
  ContractTemplateRow,
  ContractTemplatesService,
} from '../contract-templates/contract-templates.service';
import { quoteIdent } from '../common/utils/sql-identifier';
import { StorageService } from '../common/storage/storage.service';

export interface ContractPdfResult {
  path?: string;
  url: string;
  fullUrl: string;
}

interface PersistedContractPdf {
  storagePath: string;
  routePath: string;
}

@Injectable()
export class ContractPdfService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly pdfService: PdfService,
    private readonly contractTemplatesService: ContractTemplatesService,
    private readonly tenantsService: TenantsService,
    private readonly contractQueriesService: ContractQueriesService,
    private readonly storageService: StorageService,
  ) {}

  async generatePdf(
    id: number,
    tenantSlug: string,
    baseUrl: string = '',
  ): Promise<ContractPdfResult> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);
    const contract = await this.contractQueriesService.findOne(id, tenantSlug);
    const landlordName = await this.getLandlordName(tenantSlug);
    const language = await this.getTenantLanguage(schemaPrefix);
    const template = await this.findActiveTemplate(schemaPrefix, language);

    const pdfPath = template
      ? await this.generatePdfFromTemplate(
          contract,
          template,
          schemaPrefix,
          landlordName,
        )
      : await this.pdfService.generateContractPdf(
          contract,
          {
            name: landlordName,
            address: 'Dirección de la administración',
          },
          {
            signatureImage: contract.signature_image ?? undefined,
            tenantName: contract.tenant_name ?? undefined,
            signedDate: contract.tenant_signature_date ?? undefined,
            signedIp: contract.signed_ip ?? undefined,
          },
        );

    const persistedPdf = await this.persistPdf(pdfPath, tenantSlug, id);
    const fullUrl = this.storageService.isS3Enabled()
      ? await this.storageService.getSignedReadUrl(
          persistedPdf.storagePath,
          300,
        )
      : `${baseUrl}${persistedPdf.routePath}`;

    await this.dataSource.query(
      `UPDATE ${schemaPrefix}contracts SET pdf_url = $1 WHERE id = $2`,
      [persistedPdf.routePath, id],
    );

    const localPdfPath = await this.resolveLocalPdfPath(
      persistedPdf.storagePath,
    );

    return {
      path: localPdfPath,
      url: persistedPdf.routePath,
      fullUrl,
    };
  }

  private async resolveLocalPdfPath(
    storagePath: string,
  ): Promise<string | undefined> {
    if (this.storageService.isS3Enabled()) {
      return undefined;
    }

    const readAccess = await this.storageService.resolveReadAccess(
      storagePath,
      'private',
    );

    return readAccess.kind === 'local' ? readAccess.absolutePath : undefined;
  }

  private async generatePdfFromTemplate(
    contract: Awaited<ReturnType<ContractQueriesService['findOne']>>,
    template: ContractTemplateRow,
    schemaPrefix: string,
    landlordName: string,
  ): Promise<string> {
    const fullAddress = [
      contract.street_address,
      contract.city,
      contract.state,
      contract.country,
    ]
      .filter(Boolean)
      .join(', ');

    const unitNumber = contract.unit_id
      ? await this.findUnitNumber(schemaPrefix, contract.unit_id)
      : '';

    const vars = {
      contract_number: contract.contract_number ?? '',
      tenant_name: contract.tenant_name ?? '',
      tenant_email: contract.tenant_email ?? '',
      tenant_phone: contract.tenant_phone ?? '',
      property_title: contract.property_title ?? '',
      property_address: fullAddress || 'No especificada',
      unit_number: unitNumber,
      rent_amount: String(contract.monthly_rent ?? 0),
      currency: contract.currency ?? '',
      // Fechas date-only: se formatean en UTC para preservar el día calendario
      // sin importar el timezone del servidor (evita el off-by-one).
      start_date: new Date(contract.start_date).toLocaleDateString(undefined, {
        timeZone: 'UTC',
      }),
      end_date: new Date(contract.end_date).toLocaleDateString(undefined, {
        timeZone: 'UTC',
      }),
      payment_day: String(contract.payment_day ?? 5),
      deposit_amount: String(contract.deposit_amount ?? 0),
      late_fee_percentage: String(contract.late_fee_percentage ?? 0),
      grace_days: String(contract.grace_days ?? 0),
      jurisdiction: contract.jurisdiction ?? '',
      duration_months: String(contract.duration_months ?? 12),
      landlord_name: landlordName,
      issue_date: new Date().toLocaleDateString(),
    };

    const populated = this.contractTemplatesService.substituteVariables(
      template.content,
      vars,
    );

    return this.pdfService.generateContractPdfFromTemplate(
      contract.contract_number,
      populated,
      {
        signatureImage: contract.signature_image ?? undefined,
        tenantName: contract.tenant_name ?? undefined,
        signedDate: contract.tenant_signature_date ?? undefined,
        signedIp: contract.signed_ip ?? undefined,
      },
    );
  }

  private async persistPdf(
    pdfPath: string,
    tenantSlug: string,
    contractId: number,
  ): Promise<PersistedContractPdf> {
    const fileName = basename(pdfPath);
    const storagePath = this.storageService.buildStoragePath(
      'contracts',
      tenantSlug,
      String(contractId),
      fileName,
    );

    await this.storageService.uploadLocalFile(
      pdfPath,
      storagePath,
      'application/pdf',
      'private',
      true,
    );

    return {
      storagePath,
      routePath: this.storageService.toRoutePath(storagePath),
    };
  }

  private async getLandlordName(tenantSlug: string): Promise<string> {
    const tenantInfo = await this.dataSource.query<
      { company_name: string; logo_url?: string }[]
    >('SELECT company_name, logo_url FROM public.tenant WHERE slug = $1', [
      tenantSlug,
    ]);

    return tenantInfo[0]?.company_name ?? 'Empresa Administradora';
  }

  private async getTenantLanguage(schemaPrefix: string): Promise<string> {
    const configRows = await this.dataSource.query<{ language: string }[]>(
      `SELECT language FROM ${schemaPrefix}tenant_config LIMIT 1`,
    );
    return configRows[0]?.language ?? 'es';
  }

  private async findActiveTemplate(
    schemaPrefix: string,
    language: string,
  ): Promise<ContractTemplateRow | undefined> {
    const [template] = await this.dataSource.query<ContractTemplateRow[]>(
      `SELECT * FROM ${schemaPrefix}contract_templates
       WHERE language = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [language],
    );

    return template;
  }

  private async findUnitNumber(
    schemaPrefix: string,
    unitId: number,
  ): Promise<string> {
    const unitRows = await this.dataSource.query<{ unit_number: string }[]>(
      `SELECT unit_number FROM ${schemaPrefix}units WHERE id = $1`,
      [unitId],
    );

    return unitRows[0]?.unit_number ?? '';
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
