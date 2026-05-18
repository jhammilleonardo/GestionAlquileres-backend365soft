import { PaymentsService } from './payments.service';
import { DataSource } from 'typeorm';
import { PaymentQueriesService } from './payment-queries.service';
import { PaymentStatusService } from './payment-status.service';
import { PaymentRefundsService } from './payment-refunds.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { PaymentCreationService } from './payment-creation.service';
import { PaymentMethodsService } from './payment-methods.service';

/**
 * Tests unitarios para la lógica de negocio de PaymentsService.
 * Solo se testean métodos puros que no requieren DB (calculateLateFee, applyDiscount,
 * isValidStatusTransition). Los métodos que hacen queries se cubren en tests e2e.
 */
describe('PaymentsService — lógica de negocio', () => {
  let service: PaymentsService;

  beforeEach(() => {
    // Mocks mínimos — los métodos testeados no usan dependencias externas
    service = new PaymentsService(
      {} as DataSource,
      {} as PaymentQueriesService,
      {} as PaymentStatusService,
      {} as PaymentRefundsService,
      {} as PaymentWebhookService,
      {} as PaymentCreationService,
      {} as PaymentMethodsService,
    );
  });

  // ─── calculateLateFee ────────────────────────────────────────────────────

  describe('calculateLateFee', () => {
    it('debe retornar 0 cuando no hay días de mora', () => {
      expect(service.calculateLateFee(5000, 0, 2)).toBe(0);
    });

    it('debe retornar 0 dentro del período de gracia', () => {
      expect(service.calculateLateFee(5000, 3, 2, 5)).toBe(0);
    });

    it('debe retornar 0 exactamente en el límite del período de gracia', () => {
      expect(service.calculateLateFee(5000, 5, 2, 5)).toBe(0);
    });

    it('debe calcular mora al superar el período de gracia', () => {
      // 5000 * 2% = 100
      expect(service.calculateLateFee(5000, 6, 2, 5)).toBe(100);
    });

    it('debe calcular mora sin período de gracia (graceDays = 0 por defecto)', () => {
      // 1000 * 5% = 50
      expect(service.calculateLateFee(1000, 1, 5)).toBe(50);
    });

    it('debe redondear a 2 decimales', () => {
      // 333.33 * 3% = 9.9999 → 10
      expect(service.calculateLateFee(333.33, 1, 3)).toBe(10);
    });

    it('debe retornar 0 cuando el porcentaje es 0', () => {
      expect(service.calculateLateFee(5000, 10, 0)).toBe(0);
    });

    it('debe manejar montos grandes correctamente', () => {
      // 100000 * 2% = 2000
      expect(service.calculateLateFee(100000, 1, 2)).toBe(2000);
    });
  });

  // ─── applyDiscount ────────────────────────────────────────────────────────

  describe('applyDiscount', () => {
    it('debe retornar el monto original con 0% de descuento', () => {
      expect(service.applyDiscount(1000, 0)).toBe(1000);
    });

    it('debe retornar 0 con 100% de descuento', () => {
      expect(service.applyDiscount(1000, 100)).toBe(0);
    });

    it('debe retornar 0 con descuento mayor a 100%', () => {
      expect(service.applyDiscount(1000, 150)).toBe(0);
    });

    it('debe calcular descuento del 10% correctamente', () => {
      expect(service.applyDiscount(1000, 10)).toBe(900);
    });

    it('debe calcular descuento del 50% correctamente', () => {
      expect(service.applyDiscount(800, 50)).toBe(400);
    });

    it('debe redondear a 2 decimales', () => {
      // 333.33 * (1 - 0.1) = 299.997 → 300
      expect(service.applyDiscount(333.33, 10)).toBe(300);
    });

    it('debe manejar descuento con decimales', () => {
      // 1000 * (1 - 0.155) = 845
      expect(service.applyDiscount(1000, 15.5)).toBe(845);
    });
  });

  // ─── isValidStatusTransition ─────────────────────────────────────────────

  describe('isValidStatusTransition', () => {
    it('debe permitir PENDING → APPROVED', () => {
      expect(service.isValidStatusTransition('PENDING', 'APPROVED')).toBe(true);
    });

    it('debe permitir PENDING → PROCESSING', () => {
      expect(service.isValidStatusTransition('PENDING', 'PROCESSING')).toBe(
        true,
      );
    });

    it('debe permitir PENDING → REJECTED', () => {
      expect(service.isValidStatusTransition('PENDING', 'REJECTED')).toBe(true);
    });

    it('debe permitir PENDING → FAILED', () => {
      expect(service.isValidStatusTransition('PENDING', 'FAILED')).toBe(true);
    });

    it('debe permitir PROCESSING → APPROVED', () => {
      expect(service.isValidStatusTransition('PROCESSING', 'APPROVED')).toBe(
        true,
      );
    });

    it('debe permitir PROCESSING → FAILED', () => {
      expect(service.isValidStatusTransition('PROCESSING', 'FAILED')).toBe(
        true,
      );
    });

    it('debe permitir APPROVED → REFUNDED', () => {
      expect(service.isValidStatusTransition('APPROVED', 'REFUNDED')).toBe(
        true,
      );
    });

    it('debe permitir APPROVED → DISPUTED', () => {
      expect(service.isValidStatusTransition('APPROVED', 'DISPUTED')).toBe(
        true,
      );
    });

    it('debe rechazar REJECTED → APPROVED (estado terminal)', () => {
      expect(service.isValidStatusTransition('REJECTED', 'APPROVED')).toBe(
        false,
      );
    });

    it('debe rechazar FAILED → APPROVED (estado terminal)', () => {
      expect(service.isValidStatusTransition('FAILED', 'APPROVED')).toBe(false);
    });

    it('debe rechazar REFUNDED → PENDING (estado terminal)', () => {
      expect(service.isValidStatusTransition('REFUNDED', 'PENDING')).toBe(
        false,
      );
    });

    it('debe rechazar PENDING → REFUNDED (saltar estados)', () => {
      expect(service.isValidStatusTransition('PENDING', 'REFUNDED')).toBe(
        false,
      );
    });

    it('debe rechazar transiciones con estado desconocido', () => {
      expect(service.isValidStatusTransition('UNKNOWN', 'APPROVED')).toBe(
        false,
      );
    });
  });
});

describe('PaymentsService — schema-qualified reads', () => {
  let service: PaymentsService;
  let paymentQueriesService: {
    getTenantPayments: jest.Mock;
    getPaymentById: jest.Mock;
  };
  let paymentStatusService: {
    updatePaymentStatus: jest.Mock;
    approvePayment: jest.Mock;
    rejectPayment: jest.Mock;
  };
  let paymentRefundsService: {
    createRefund: jest.Mock;
  };
  let paymentWebhookService: {
    handleWebhookResult: jest.Mock;
  };
  let paymentCreationService: {
    createPayment: jest.Mock;
    createPaymentAsAdmin: jest.Mock;
  };
  let paymentMethodsService: {
    getAvailablePaymentMethods: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
  };
  let dataSource: {
    query: jest.Mock;
    createQueryRunner: jest.Mock;
  };

  beforeEach(() => {
    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
    };
    dataSource = {
      query: jest.fn(),
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    paymentQueriesService = {
      getTenantPayments: jest.fn(),
      getPaymentById: jest.fn(),
    };
    paymentStatusService = {
      updatePaymentStatus: jest.fn(),
      approvePayment: jest.fn(),
      rejectPayment: jest.fn(),
    };
    paymentRefundsService = {
      createRefund: jest.fn(),
    };
    paymentWebhookService = {
      handleWebhookResult: jest.fn(),
    };
    paymentCreationService = {
      createPayment: jest.fn(),
      createPaymentAsAdmin: jest.fn(),
    };
    paymentMethodsService = {
      getAvailablePaymentMethods: jest.fn(),
    };
    service = new PaymentsService(
      dataSource as unknown as DataSource,
      paymentQueriesService as unknown as PaymentQueriesService,
      paymentStatusService as unknown as PaymentStatusService,
      paymentRefundsService as unknown as PaymentRefundsService,
      paymentWebhookService as unknown as PaymentWebhookService,
      paymentCreationService as unknown as PaymentCreationService,
      paymentMethodsService as unknown as PaymentMethodsService,
    );
  });

  it('getTenantPayments usa tablas calificadas por schema', async () => {
    paymentQueriesService.getTenantPayments.mockResolvedValueOnce([]);

    await service.getTenantPayments(7, 'acme');

    expect(paymentQueriesService.getTenantPayments).toHaveBeenCalledWith(
      7,
      'acme',
    );
  });

  it('getPaymentById usa schema explícito cuando se recibe desde controller', async () => {
    const payment = { id: 12, tenant_id: 7 };
    paymentQueriesService.getPaymentById.mockResolvedValueOnce(payment);

    await expect(service.getPaymentById(12, 7, 'tenant_acme')).resolves.toBe(
      payment,
    );

    expect(paymentQueriesService.getPaymentById).toHaveBeenCalledWith(
      12,
      7,
      'tenant_acme',
    );
  });

  it('createPaymentAsAdmin delega creación con schema explícito', async () => {
    const payment = { id: 33, tenant_id: 7, status: 'PENDING' };
    paymentCreationService.createPaymentAsAdmin.mockResolvedValueOnce(payment);
    const dto = {
      tenant_id: 7,
      contract_id: 10,
      property_id: 20,
      amount: 100,
      payment_type: 'RENT',
      payment_method: 'CASH',
      payment_date: '2026-05-16',
    };

    await expect(
      service.createPaymentAsAdmin(dto, 99, 'tenant_acme'),
    ).resolves.toBe(payment);

    expect(paymentCreationService.createPaymentAsAdmin).toHaveBeenCalledWith(
      dto,
      99,
      'tenant_acme',
    );
  });

  it('createPayment delega creación tenant con contrato y comprobante', async () => {
    const payment = { id: 55, tenant_id: 7, status: 'PENDING' };
    paymentCreationService.createPayment.mockResolvedValueOnce(payment);
    const dto = {
      amount: 100,
      payment_type: 'RENT',
      payment_method: 'CASH',
      payment_date: '2026-05-16',
    };

    await expect(
      service.createPayment(7, dto, 'acme', 10, 20, 'proof.jpg'),
    ).resolves.toBe(payment);

    expect(paymentCreationService.createPayment).toHaveBeenCalledWith(
      7,
      dto,
      'acme',
      10,
      20,
      'proof.jpg',
    );
  });

  it('createRefund delega al servicio de reembolsos con schema explícito', async () => {
    paymentRefundsService.createRefund.mockResolvedValueOnce(undefined);

    await expect(
      service.createRefund(
        33,
        {
          amount: 75,
          reason: 'Devolución final',
          refund_method: 'TRANSFER',
          refund_date: '2026-05-16',
        },
        99,
        'tenant_acme',
      ),
    ).resolves.toBeUndefined();

    expect(paymentRefundsService.createRefund).toHaveBeenCalledWith(
      33,
      {
        amount: 75,
        reason: 'Devolución final',
        refund_method: 'TRANSFER',
        refund_date: '2026-05-16',
      },
      99,
      'tenant_acme',
    );
  });

  it('handleWebhookResult delega idempotencia y actualización al servicio de webhooks', async () => {
    const result = {
      event_id: 'evt_1',
      transaction_id: 'tx_1',
      status: 'APPROVED' as const,
      raw_event: { id: 'evt_1' },
    };
    paymentWebhookService.handleWebhookResult.mockResolvedValueOnce(undefined);

    await service.handleWebhookResult('acme', result, 'stripe');

    expect(paymentWebhookService.handleWebhookResult).toHaveBeenCalledWith(
      'acme',
      result,
      'stripe',
    );
  });

  it('getAvailablePaymentMethods delega al servicio de métodos', async () => {
    const methods = [{ method: 'CASH', label: 'Efectivo' }];
    paymentMethodsService.getAvailablePaymentMethods.mockResolvedValueOnce(
      methods,
    );

    await expect(service.getAvailablePaymentMethods('acme')).resolves.toBe(
      methods,
    );

    expect(
      paymentMethodsService.getAvailablePaymentMethods,
    ).toHaveBeenCalledWith('acme');
  });
});
