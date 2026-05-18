import { BadRequestException } from '@nestjs/common';
import { SplitPaymentService } from './split-payment.service';
import { DataSource } from 'typeorm';

// ─── Helper ───────────────────────────────────────────────────────────────────

function buildService(queryMock?: jest.Mock): SplitPaymentService {
  const ds = {
    createQueryRunner: jest.fn(),
    query: queryMock ?? jest.fn(),
  } as unknown as DataSource;
  return new SplitPaymentService(ds);
}

// ─── calculateSplit ────────────────────────────────────────────────────────────

describe('SplitPaymentService — calculateSplit (lógica pura)', () => {
  let service: SplitPaymentService;

  beforeEach(() => {
    service = buildService();
  });

  it('1 — calcula correctamente con comisión del 10%', () => {
    const result = service.calculateSplit(10000, 10, 0);

    expect(result.grossRent).toBe(10000);
    expect(result.commissionAmount).toBe(1000);
    expect(result.maintenanceDeductions).toBe(0);
    expect(result.netAmount).toBe(9000);
  });

  it('2 — calcula correctamente con comisión del 15%', () => {
    const result = service.calculateSplit(10000, 15, 0);

    expect(result.commissionAmount).toBe(1500);
    expect(result.netAmount).toBe(8500);
  });

  it('3 — calcula correctamente con deducción de mantenimiento', () => {
    // comisión 10% de 5000 = 500; mantenimiento = 300; net = 5000 - 500 - 300 = 4200
    const result = service.calculateSplit(5000, 10, 300);

    expect(result.commissionAmount).toBe(500);
    expect(result.maintenanceDeductions).toBe(300);
    expect(result.netAmount).toBe(4200);
  });

  it('5 — redondea a 2 decimales correctamente', () => {
    // 3333.33 * 10% = 333.333 → round2 = 333.33
    // net = 3333.33 - 333.33 - 0 = 3000.00
    const result = service.calculateSplit(3333.33, 10, 0);

    expect(result.commissionAmount).toBe(333.33);
    expect(result.netAmount).toBe(3000);
    // Verificar que el resultado tiene exactamente 2 decimales como máximo
    expect(Number(result.commissionAmount.toFixed(2))).toBe(
      result.commissionAmount,
    );
  });

  it('6 — comisión 0%: propietario recibe todo (menos mantenimiento)', () => {
    const result = service.calculateSplit(8000, 0, 200);

    expect(result.commissionAmount).toBe(0);
    expect(result.netAmount).toBe(7800);
  });

  it('7 — deducción mayor que la renta produce net_amount negativo (caso límite)', () => {
    // Escenario real: reparación urgente supera el alquiler del mes
    const result = service.calculateSplit(2000, 10, 3000);

    expect(result.commissionAmount).toBe(200);
    // net = 2000 - 200 - 3000 = -1200 (deuda del propietario)
    expect(result.netAmount).toBe(-1200);
  });
});

// ─── extractPeriod ────────────────────────────────────────────────────────────

describe('SplitPaymentService — extractPeriod', () => {
  let service: SplitPaymentService;

  beforeEach(() => {
    service = buildService();
  });

  it('8a — extrae período de enero correctamente (mes=1)', () => {
    const date = new Date('2026-01-15');
    const { month, year } = service.extractPeriod(date);

    expect(month).toBe(1);
    expect(year).toBe(2026);
  });

  it('8b — extrae período de diciembre correctamente (mes=12)', () => {
    const date = new Date('2026-12-31');
    const { month, year } = service.extractPeriod(date);

    expect(month).toBe(12);
    expect(year).toBe(2026);
  });
});

// ─── validatePaymentStatus ────────────────────────────────────────────────────

describe('SplitPaymentService — validatePaymentStatus', () => {
  let service: SplitPaymentService;

  beforeEach(() => {
    service = buildService();
  });

  it('10 — pago rechazado no genera split (lanza BadRequestException)', () => {
    expect(() => service.validatePaymentStatus('REJECTED')).toThrow(
      BadRequestException,
    );
    expect(() => service.validatePaymentStatus('PENDING')).toThrow(
      BadRequestException,
    );
    expect(() => service.validatePaymentStatus('PROCESSING')).toThrow(
      BadRequestException,
    );
  });

  it('pago APPROVED no lanza excepción', () => {
    expect(() => service.validatePaymentStatus('APPROVED')).not.toThrow();
  });
});

// ─── executeSplit ─────────────────────────────────────────────────────────────

describe('SplitPaymentService — executeSplit (transacción atómica)', () => {
  let service: SplitPaymentService;
  let ds: jest.Mocked<Pick<DataSource, 'createQueryRunner'>>;

  const BASE_PARAMS = {
    paymentId: 1,
    totalAmount: 10000,
    propertyId: 5,
    paymentDate: new Date('2026-04-10'),
    currency: 'BOB',
    schemaName: 'tenant_empresa1',
  };

  const OWNER_ROW = {
    rental_owner_id: 3,
    owner_name: 'Carlos López',
    ownership_percentage: 100,
  };

  it('4 — rollback completo cuando falla el registro del split', async () => {
    // Secuencia: tenant_config, maintenance, owners -> luego falla en payment_splits
    let call = 0;
    const qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve([{ commission_percentage: 10 }]); // config
        if (call === 2) return Promise.resolve([{ total: '0' }]); // maintenance
        if (call === 3) return Promise.resolve([OWNER_ROW]); // owners
        // Falla en el INSERT de payment_splits
        return Promise.reject(new Error('DB constraint error'));
      }),
    };

    ds = {
      createQueryRunner: jest.fn().mockReturnValue(qr),
    } as unknown as jest.Mocked<Pick<DataSource, 'createQueryRunner'>>;
    service = new SplitPaymentService(ds as unknown as DataSource);

    await expect(service.executeSplit(BASE_PARAMS)).rejects.toThrow(
      'DB constraint error',
    );

    expect(qr.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(qr.release).toHaveBeenCalledTimes(1);
  });

  it('9 — múltiples pagos en el mismo período acumulan en el statement existente', async () => {
    // El primer call de SELECT owner_statements devuelve una fila existente → UPDATE
    const qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('tenant_config'))
          return Promise.resolve([{ commission_percentage: 10 }]);
        if (sql.includes('maintenance_requests'))
          return Promise.resolve([{ total: '0' }]);
        if (sql.includes('property_owners'))
          return Promise.resolve([OWNER_ROW]);
        if (sql.includes('payment_splits')) return Promise.resolve([]);
        if (
          sql.includes('SELECT id FROM') &&
          sql.includes('owner_statements')
        ) {
          // Existe un statement previo
          return Promise.resolve([{ id: 42 }]);
        }
        if (sql.includes('UPDATE') && sql.includes('owner_statements')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    };

    ds = {
      createQueryRunner: jest.fn().mockReturnValue(qr),
    } as unknown as jest.Mocked<Pick<DataSource, 'createQueryRunner'>>;
    service = new SplitPaymentService(ds as unknown as DataSource);

    await service.executeSplit(BASE_PARAMS);

    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);

    // Verificar que se usó UPDATE, no INSERT
    const queryCalls = qr.query.mock.calls as Array<[string, ...unknown[]]>;
    const updateCall = queryCalls.find(
      ([sql]: [string]) =>
        sql.includes('UPDATE') && sql.includes('owner_statements'),
    );
    expect(updateCall).toBeDefined();

    const insertCall = queryCalls.find(
      ([sql]: [string]) =>
        sql.includes('INSERT INTO') && sql.includes('owner_statements'),
    );
    expect(insertCall).toBeUndefined();
  });

  it('sin propietarios registrados termina sin error ni commit de datos', async () => {
    let call = 0;
    const qr = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockImplementation(() => {
        call++;
        if (call === 1) return Promise.resolve([{ commission_percentage: 5 }]); // config
        if (call === 2) return Promise.resolve([{ total: '0' }]); // maintenance
        return Promise.resolve([]); // property_owners → vacío
      }),
    };

    ds = {
      createQueryRunner: jest.fn().mockReturnValue(qr),
    } as unknown as jest.Mocked<Pick<DataSource, 'createQueryRunner'>>;
    service = new SplitPaymentService(ds as unknown as DataSource);

    await expect(service.executeSplit(BASE_PARAMS)).resolves.toBeUndefined();
    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
    expect(qr.rollbackTransaction).not.toHaveBeenCalled();
  });
});

// ─── round2 ───────────────────────────────────────────────────────────────────

describe('SplitPaymentService — round2', () => {
  let service: SplitPaymentService;

  beforeEach(() => {
    service = buildService();
  });

  it('redondea correctamente la tercera cifra decimal', () => {
    // 1.006 * 100 = 100.6 → Math.round(100.6) = 101 → /100 = 1.01
    expect(service.round2(1.006)).toBe(1.01);
    // 1.004 * 100 = 100.4 → Math.round(100.4) = 100 → /100 = 1.00
    expect(service.round2(1.004)).toBe(1);
  });

  it('no modifica valores ya con 2 decimales', () => {
    expect(service.round2(123.45)).toBe(123.45);
  });

  it('maneja enteros', () => {
    expect(service.round2(500)).toBe(500);
  });
});
