import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StripeProcessor } from './stripe.processor';
import { ProcessorPaymentInput } from './payment-processor.interface';

const mockStripeInstance = {
  paymentIntents: {
    create: jest.fn(),
    capture: jest.fn(),
  },
  refunds: {
    create: jest.fn(),
  },
  webhooks: {
    constructEvent: jest.fn(),
  },
};

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => mockStripeInstance);
});

describe('StripeProcessor', () => {
  let processor: StripeProcessor;
  let loggerErrorSpy: jest.SpyInstance;

  const baseInput: ProcessorPaymentInput = {
    amount: 1200,
    currency: 'USD',
    tenantId: 1,
    contractId: 10,
    propertyId: 5,
    reference_number: 'REF-001',
  };

  beforeEach(async () => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeProcessor,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, def = '') => {
              const cfg: Record<string, string> = {
                STRIPE_SECRET_KEY: 'sk_test_mock',
                STRIPE_WEBHOOK_SECRET: 'whsec_mock',
              };
              return cfg[key] ?? def;
            },
          },
        },
      ],
    }).compile();

    processor = module.get(StripeProcessor);

    jest.clearAllMocks();
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('debe tener processorName = "stripe"', () => {
    expect(processor.processorName).toBe('stripe');
  });

  describe('createPayment', () => {
    it('debe crear un PaymentIntent y devolver status PROCESSING', async () => {
      mockStripeInstance.paymentIntents.create.mockResolvedValue({
        id: 'pi_test_123',
        status: 'requires_capture',
      });

      const result = await processor.createPayment(baseInput);

      expect(mockStripeInstance.paymentIntents.create).toHaveBeenCalledWith({
        amount: 120000, // 1200 * 100
        currency: 'usd',
        metadata: {
          tenantId: '1',
          contractId: '10',
          propertyId: '5',
          reference: 'REF-001',
        },
      });

      expect(result.success).toBe(true);
      expect(result.transaction_id).toBe('pi_test_123');
      expect(result.status).toBe('PROCESSING');
      expect(result.processor_fee).toBeGreaterThan(0);
    });

    it('debe calcular la tarifa del procesador correctamente (2.9% + $0.30)', async () => {
      mockStripeInstance.paymentIntents.create.mockResolvedValue({
        id: 'pi_test',
      });

      const result = await processor.createPayment({
        ...baseInput,
        amount: 1000,
      });

      // 1000 * 0.029 + 0.30 = 29 + 0.30 = 29.30
      expect(result.processor_fee).toBe(29.3);
    });
  });

  describe('confirmPayment', () => {
    it('debe capturar el PaymentIntent y devolver APPROVED si succeeded', async () => {
      mockStripeInstance.paymentIntents.capture.mockResolvedValue({
        id: 'pi_test_123',
        status: 'succeeded',
      });

      const result = await processor.confirmPayment('pi_test_123');

      expect(result.success).toBe(true);
      expect(result.status).toBe('APPROVED');
    });

    it('debe devolver FAILED si la captura no fue succeeded', async () => {
      mockStripeInstance.paymentIntents.capture.mockResolvedValue({
        id: 'pi_test_123',
        status: 'canceled',
      });

      const result = await processor.confirmPayment('pi_test_123');

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
    });
  });

  describe('refundPayment', () => {
    it('debe crear un reembolso y devolver APPROVED si succeeded', async () => {
      mockStripeInstance.refunds.create.mockResolvedValue({
        id: 're_test_456',
        status: 'succeeded',
      });

      const result = await processor.refundPayment('pi_test_123', 500);

      expect(mockStripeInstance.refunds.create).toHaveBeenCalledWith({
        payment_intent: 'pi_test_123',
        amount: 50000, // 500 * 100
      });

      expect(result.success).toBe(true);
      expect(result.transaction_id).toBe('re_test_456');
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('handleWebhook', () => {
    it('debe devolver APPROVED para payment_intent.succeeded', async () => {
      const mockEvent = {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_test_123' } },
      };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = await processor.handleWebhook(
        Buffer.from('{}'),
        'signature',
      );

      expect(result.status).toBe('APPROVED');
      expect(result.transaction_id).toBe('pi_test_123');
    });

    it('debe devolver FAILED para payment_intent.payment_failed', async () => {
      const mockEvent = {
        type: 'payment_intent.payment_failed',
        data: { object: { id: 'pi_test_999' } },
      };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = await processor.handleWebhook(Buffer.from('{}'), 'sig');

      expect(result.status).toBe('FAILED');
      expect(result.transaction_id).toBe('pi_test_999');
    });

    it('debe devolver REFUNDED para charge.refunded', async () => {
      const mockEvent = {
        type: 'charge.refunded',
        data: { object: { id: 'ch_test', payment_intent: 'pi_test_123' } },
      };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = await processor.handleWebhook(Buffer.from('{}'), 'sig');

      expect(result.status).toBe('REFUNDED');
      expect(result.transaction_id).toBe('pi_test_123');
    });

    it('debe lanzar BadRequestException si la firma es inválida', async () => {
      mockStripeInstance.webhooks.constructEvent.mockImplementation(() => {
        throw new Error(
          'No signatures found matching the expected signature for payload',
        );
      });

      await expect(
        processor.handleWebhook(Buffer.from('{}'), 'bad_signature'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe manejar eventos no conocidos sin lanzar error', async () => {
      const mockEvent = {
        type: 'customer.created',
        data: { object: {} },
      };
      mockStripeInstance.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = await processor.handleWebhook(Buffer.from('{}'), 'sig');

      expect(result.status).toBe('IGNORED');
    });
  });
});
