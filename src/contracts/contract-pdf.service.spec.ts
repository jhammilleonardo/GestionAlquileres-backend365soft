import { DataSource } from 'typeorm';
import { ContractTemplatesService } from '../contract-templates/contract-templates.service';
import { StorageService } from '../common/storage/storage.service';
import { TenantsService } from '../tenants/tenants.service';
import { ContractPdfService } from './contract-pdf.service';
import { ContractQueriesService } from './contract-queries.service';
import { ContractStatus } from './enums/contract-status.enum';
import { PdfService } from './pdf.service';
import type { ContractResult } from './contracts.service';

function makeContract(overrides: Partial<ContractResult> = {}): ContractResult {
  return {
    id: 1,
    contract_number: 'CTR-2026-0001',
    tenant_id: 10,
    property_id: 20,
    unit_id: null,
    status: ContractStatus.ACTIVO,
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    duration_months: 12,
    monthly_rent: 2500,
    currency: 'BOB',
    payment_day: 5,
    deposit_amount: 5000,
    late_fee_percentage: 2,
    grace_days: 3,
    jurisdiction: 'Bolivia',
    auto_renew: false,
    renewal_notice_days: 30,
    auto_increase_percentage: 0,
    created_at: new Date('2026-01-01'),
    updated_at: new Date('2026-01-01'),
    tenant_name: 'Juan Perez',
    tenant_email: 'juan@example.com',
    tenant_phone: '70000000',
    property_title: 'Edificio Central',
    street_address: 'Av. Principal 123',
    city: 'La Paz',
    state: 'La Paz',
    country: 'Bolivia',
    ...overrides,
  };
}

describe('ContractPdfService', () => {
  let service: ContractPdfService;

  const mockDataSource = {
    query: jest.fn(),
  };
  const mockPdfService = {
    generateContractPdf: jest.fn(),
    generateContractPdfFromTemplate: jest.fn(),
  };
  const mockContractTemplatesService = {
    substituteVariables: jest.fn(),
  };
  const mockTenantsService = {
    findBySlug: jest.fn(),
  };
  const mockContractQueriesService = {
    findOne: jest.fn(),
  };
  const mockStorageService = {
    buildStoragePath: jest.fn(),
    uploadLocalFile: jest.fn(),
    toRoutePath: jest.fn(),
    isS3Enabled: jest.fn(),
    getSignedReadUrl: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockTenantsService.findBySlug.mockResolvedValue({
      slug: 'acme',
      schema_name: 'tenant_acme',
    });
    mockContractQueriesService.findOne.mockResolvedValue(makeContract());
    mockPdfService.generateContractPdf.mockResolvedValue('/tmp/contract.pdf');
    mockPdfService.generateContractPdfFromTemplate.mockResolvedValue(
      '/tmp/template-contract.pdf',
    );
    mockContractTemplatesService.substituteVariables.mockReturnValue(
      'populated contract',
    );
    mockStorageService.buildStoragePath.mockReturnValue(
      'storage/contracts/acme/1/contract.pdf',
    );
    mockStorageService.uploadLocalFile.mockResolvedValue(undefined);
    mockStorageService.toRoutePath.mockReturnValue(
      '/storage/contracts/acme/1/contract.pdf',
    );
    mockStorageService.isS3Enabled.mockReturnValue(false);
    mockStorageService.getSignedReadUrl.mockResolvedValue(
      'https://signed.example/contract.pdf',
    );

    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM public.tenant')) {
        return Promise.resolve([{ company_name: 'ACME Rentals' }]);
      }
      if (sql.includes('tenant_config')) {
        return Promise.resolve([{ language: 'es' }]);
      }
      if (sql.includes('contract_templates')) {
        return Promise.resolve([]);
      }
      if (sql.includes('units')) {
        return Promise.resolve([{ unit_number: '2B' }]);
      }
      if (sql.includes('UPDATE')) {
        return Promise.resolve([]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    service = new ContractPdfService(
      mockDataSource as unknown as DataSource,
      mockPdfService as unknown as PdfService,
      mockContractTemplatesService as unknown as ContractTemplatesService,
      mockTenantsService as unknown as TenantsService,
      mockContractQueriesService as unknown as ContractQueriesService,
      mockStorageService as unknown as StorageService,
    );
  });

  it('genera PDF por defecto, lo persiste y guarda la ruta privada del contrato', async () => {
    const result = await service.generatePdf(1, 'acme', 'https://api.test');

    expect(mockContractQueriesService.findOne).toHaveBeenCalledWith(1, 'acme');
    expect(mockPdfService.generateContractPdf).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, contract_number: 'CTR-2026-0001' }),
      {
        name: 'ACME Rentals',
        address: 'Dirección de la administración',
      },
    );
    expect(mockStorageService.uploadLocalFile).toHaveBeenCalledWith(
      '/tmp/contract.pdf',
      'storage/contracts/acme/1/contract.pdf',
      'application/pdf',
      'private',
      true,
    );
    expect(mockDataSource.query).toHaveBeenCalledWith(
      'UPDATE "tenant_acme".contracts SET pdf_url = $1 WHERE id = $2',
      ['/storage/contracts/acme/1/contract.pdf', 1],
    );
    expect(result).toEqual({
      path: '/tmp/contract.pdf',
      url: '/storage/contracts/acme/1/contract.pdf',
      fullUrl: 'https://api.test/storage/contracts/acme/1/contract.pdf',
    });
  });

  it('usa plantilla activa con variables calculadas cuando existe template del idioma del tenant', async () => {
    mockContractQueriesService.findOne.mockResolvedValue(
      makeContract({ unit_id: 9 }),
    );
    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM public.tenant')) {
        return Promise.resolve([{ company_name: 'ACME Rentals' }]);
      }
      if (sql.includes('tenant_config')) {
        return Promise.resolve([{ language: 'es' }]);
      }
      if (sql.includes('contract_templates')) {
        return Promise.resolve([
          {
            id: 7,
            language: 'es',
            name: 'Bolivia residencial',
            content: 'Contrato {{contract_number}} unidad {{unit_number}}',
            is_active: true,
            created_at: new Date('2026-01-01'),
            updated_at: new Date('2026-01-01'),
          },
        ]);
      }
      if (sql.includes('units')) {
        return Promise.resolve([{ unit_number: '2B' }]);
      }
      if (sql.includes('UPDATE')) {
        return Promise.resolve([]);
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await service.generatePdf(1, 'acme');

    expect(
      mockContractTemplatesService.substituteVariables,
    ).toHaveBeenCalledWith(
      'Contrato {{contract_number}} unidad {{unit_number}}',
      expect.objectContaining({
        contract_number: 'CTR-2026-0001',
        landlord_name: 'ACME Rentals',
        unit_number: '2B',
        property_address: 'Av. Principal 123, La Paz, La Paz, Bolivia',
      }),
    );
    expect(mockPdfService.generateContractPdfFromTemplate).toHaveBeenCalledWith(
      'CTR-2026-0001',
      'populated contract',
    );
    expect(mockPdfService.generateContractPdf).not.toHaveBeenCalled();
  });

  it('en S3 devuelve URL firmada usando el storage path interno, no la ruta pública', async () => {
    mockStorageService.isS3Enabled.mockReturnValue(true);

    const result = await service.generatePdf(1, 'acme', 'https://api.test');

    expect(mockStorageService.getSignedReadUrl).toHaveBeenCalledWith(
      'storage/contracts/acme/1/contract.pdf',
      300,
    );
    expect(result).toEqual({
      path: undefined,
      url: '/storage/contracts/acme/1/contract.pdf',
      fullUrl: 'https://signed.example/contract.pdf',
    });
  });
});
