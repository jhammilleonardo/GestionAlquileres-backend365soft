import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import {
  ContractTemplatesService,
  TemplateVariables,
} from './contract-templates.service';

// ─── Variables puras ──────────────────────────────────────────────────────────

describe('ContractTemplatesService.substituteVariables', () => {
  let service: ContractTemplatesService;

  const mockDataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractTemplatesService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ContractTemplatesService>(ContractTemplatesService);
  });

  const baseVars: TemplateVariables = {
    contract_number: 'CTR-2025-0001',
    tenant_name: 'Juan Pérez',
    tenant_email: 'juan@example.com',
    tenant_phone: '555-1234',
    property_title: 'Casa Verde',
    property_address: 'Av. Principal 123, La Paz',
    unit_number: '2B',
    rent_amount: '1500',
    currency: 'BOB',
    start_date: '01/01/2025',
    end_date: '31/12/2025',
    payment_day: '5',
    deposit_amount: '3000',
    late_fee_percentage: '2',
    grace_days: '5',
    jurisdiction: 'Bolivia',
    duration_months: '12',
    landlord_name: 'Inmobiliaria Acme',
    issue_date: '26/04/2025',
  };

  it('sustituye una variable simple', () => {
    const result = service.substituteVariables(
      'Contrato N°: {{contract_number}}',
      baseVars,
    );
    expect(result).toBe('Contrato N°: CTR-2025-0001');
  });

  it('sustituye múltiples variables en el mismo texto', () => {
    const result = service.substituteVariables(
      '{{tenant_name}} — {{property_title}}',
      baseVars,
    );
    expect(result).toBe('Juan Pérez — Casa Verde');
  });

  it('sustituye todas las variables del contrato', () => {
    const template = Object.keys(baseVars)
      .map((k) => `{{${k}}}`)
      .join(' ');
    const result = service.substituteVariables(template, baseVars);
    expect(result).toBe(Object.values(baseVars).join(' '));
  });

  it('deja vacío si la variable no tiene valor definido', () => {
    const vars = { ...baseVars, unit_number: '' };
    const result = service.substituteVariables('Unidad: {{unit_number}}', vars);
    expect(result).toBe('Unidad: ');
  });

  it('deja el placeholder original si la clave no existe en el mapa', () => {
    const result = service.substituteVariables(
      'Texto {{variable_desconocida}} aquí',
      baseVars,
    );
    expect(result).toBe('Texto {{variable_desconocida}} aquí');
  });

  it('no sustituye llaves mal formadas (sin doble llave)', () => {
    const result = service.substituteVariables(
      '{contract_number} y {tenant_name}',
      baseVars,
    );
    expect(result).toBe('{contract_number} y {tenant_name}');
  });

  it('sustituye variables repetidas más de una vez', () => {
    const result = service.substituteVariables(
      '{{currency}} {{rent_amount}} {{currency}}',
      baseVars,
    );
    expect(result).toBe('BOB 1500 BOB');
  });

  it('preserva texto sin variables intacto', () => {
    const plain = 'Sin variables aquí, solo texto.';
    expect(service.substituteVariables(plain, baseVars)).toBe(plain);
  });

  it('maneja plantilla vacía sin error', () => {
    expect(service.substituteVariables('', baseVars)).toBe('');
  });

  it('sustituye variables en plantilla multiline', () => {
    const template = `CONTRATO\nContrato N°: {{contract_number}}\nInquilino: {{tenant_name}}`;
    const result = service.substituteVariables(template, baseVars);
    expect(result).toBe(
      'CONTRATO\nContrato N°: CTR-2025-0001\nInquilino: Juan Pérez',
    );
  });
});

// ─── CRUD del servicio (mock DataSource) ──────────────────────────────────────

describe('ContractTemplatesService CRUD', () => {
  let service: ContractTemplatesService;
  const mockDataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContractTemplatesService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ContractTemplatesService>(ContractTemplatesService);
  });

  afterEach(() => jest.resetAllMocks());

  it('create devuelve la plantilla insertada', async () => {
    const expected = {
      id: 1,
      language: 'es',
      name: 'Plantilla ES',
      content: 'Hola {{tenant_name}}',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockDataSource.query.mockResolvedValueOnce([expected]);

    const result = await service.create({
      language: 'es',
      name: 'Plantilla ES',
      content: 'Hola {{tenant_name}}',
    });

    expect(result).toEqual(expected);
    expect(mockDataSource.query).toHaveBeenCalledTimes(1);
  });

  it('findOne lanza NotFoundException si no existe', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
  });

  it('findActiveForLanguage retorna null si no hay plantilla activa', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    const result = await service.findActiveForLanguage('en');
    expect(result).toBeNull();
  });

  it('findActiveForLanguage retorna la plantilla activa', async () => {
    const template = {
      id: 2,
      language: 'en',
      name: 'Standard EN',
      content: 'Hello {{tenant_name}}',
      is_active: true,
      created_at: new Date(),
      updated_at: new Date(),
    };
    mockDataSource.query.mockResolvedValueOnce([template]);

    const result = await service.findActiveForLanguage('en');
    expect(result).toEqual(template);
  });

  it('update lanza BadRequestException si no hay campos', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ id: 1 }]); // findOne

    await expect(service.update(1, {})).rejects.toThrow(BadRequestException);
  });

  it('remove llama a DELETE y no lanza si existe', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ id: 1 }]) // findOne
      .mockResolvedValueOnce([]); // DELETE

    await expect(service.remove(1)).resolves.not.toThrow();
    expect(mockDataSource.query).toHaveBeenCalledTimes(2);
  });
});
