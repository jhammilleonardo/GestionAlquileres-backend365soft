import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { PayPalProcessor } from './paypal.processor';
import { ProcessorPaymentInput } from './payment-processor.interface';

const TOKEN_RESP = { data: { access_token: 'mock_token' } };

describe('PayPalProcessor', () => {
  let processor: PayPalProcessor;
  let httpPost: jest.Mock;

  const baseInput: ProcessorPaymentInput = {
    amount: 800,
    currency: 'USD',
    tenantId: 2,
    contractId: 20,
    propertyId: 8,
    reference_number: 'REF-PAY-001',
    notes: 'Pago de alquiler enero',
  };

  const mockConfig = (key: string, def = '') => {
    const cfg: Record<string, string> = {
      PAYPAL_BASE_URL: 'https://api-m.sandbox.paypal.com',
      PAYPAL_CLIENT_ID: 'test_client_id',
      PAYPAL_CLIENT_SECRET: 'test_client_secret',
      PAYPAL_WEBHOOK_ID: '',
    };
    return cfg[key] ?? def;
  };

  beforeEach(async () => {
    httpPost = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayPalProcessor,
        { provide: ConfigService, useValue: { get: mockConfig } },
        { provide: HttpService, useValue: { post: httpPost } },
      ],
    }).compile();

    processor = module.get(PayPalProcessor);
  });

  it('debe tener processorName = "paypal"', () => {
    expect(processor.processorName).toBe('paypal');
  });

  describe('createPayment', () => {
    it('debe crear una Order de PayPal y devolver status PROCESSING', async () => {
      httpPost
        .mockReturnValueOnce(of(TOKEN_RESP))
        .mockReturnValueOnce(
          of({ data: { id: 'ORDER_123', status: 'CREATED' } }),
        );

      const result = await processor.createPayment(baseInput);

      expect(result.success).toBe(true);
      expect(result.transaction_id).toBe('ORDER_123');
      expect(result.status).toBe('PROCESSING');
      expect(result.processor_fee).toBeGreaterThan(0);
    });

    it('debe calcular la tarifa correctamente (3.49% + $0.49)', async () => {
      httpPost
        .mockReturnValueOnce(of(TOKEN_RESP))
        .mockReturnValueOnce(of({ data: { id: 'ORDER_X' } }));

      const result = await processor.createPayment({
        ...baseInput,
        amount: 1000,
      });

      // 1000 * 0.0349 + 0.49 = 34.9 + 0.49 = 35.39
      expect(result.processor_fee).toBe(35.39);
    });
  });

  describe('confirmPayment', () => {
    it('debe capturar la Order y devolver APPROVED si COMPLETED', async () => {
      httpPost.mockReturnValueOnce(of(TOKEN_RESP)).mockReturnValueOnce(
        of({
          data: {
            status: 'COMPLETED',
            purchase_units: [
              { payments: { captures: [{ id: 'CAPTURE_456' }] } },
            ],
          },
        }),
      );

      const result = await processor.confirmPayment('ORDER_123');

      expect(result.success).toBe(true);
      expect(result.transaction_id).toBe('CAPTURE_456');
      expect(result.status).toBe('APPROVED');
    });

    it('debe devolver FAILED si la captura no es COMPLETED', async () => {
      httpPost
        .mockReturnValueOnce(of(TOKEN_RESP))
        .mockReturnValueOnce(
          of({ data: { status: 'VOIDED', purchase_units: [] } }),
        );

      const result = await processor.confirmPayment('ORDER_FAIL');

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
    });
  });

  describe('refundPayment', () => {
    it('debe reembolsar la captura y devolver APPROVED si COMPLETED', async () => {
      httpPost
        .mockReturnValueOnce(of(TOKEN_RESP))
        .mockReturnValueOnce(
          of({ data: { id: 'REFUND_789', status: 'COMPLETED' } }),
        );

      const result = await processor.refundPayment('CAPTURE_456', 200);

      expect(result.success).toBe(true);
      expect(result.transaction_id).toBe('REFUND_789');
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('handleWebhook', () => {
    it('debe devolver APPROVED para PAYMENT.CAPTURE.COMPLETED', async () => {
      const payload = {
        event_type: 'PAYMENT.CAPTURE.COMPLETED',
        resource: { id: 'CAPTURE_XYZ' },
      };

      const result = await processor.handleWebhook(payload);

      expect(result.status).toBe('APPROVED');
      expect(result.transaction_id).toBe('CAPTURE_XYZ');
    });

    it('debe devolver FAILED para PAYMENT.CAPTURE.DENIED', async () => {
      const payload = {
        event_type: 'PAYMENT.CAPTURE.DENIED',
        resource: { id: 'CAPTURE_XYZ' },
      };

      const result = await processor.handleWebhook(payload);

      expect(result.status).toBe('FAILED');
    });

    it('debe devolver APPROVED para PAYMENT.CAPTURE.REFUNDED', async () => {
      const payload = {
        event_type: 'PAYMENT.CAPTURE.REFUNDED',
        resource: { id: 'REFUND_XYZ' },
      };

      const result = await processor.handleWebhook(payload);

      expect(result.status).toBe('APPROVED');
    });

    it('debe manejar eventos desconocidos sin error', async () => {
      const payload = {
        event_type: 'CHECKOUT.ORDER.APPROVED',
        resource: { id: 'X' },
      };

      const result = await processor.handleWebhook(payload);

      expect(result.status).toBe('APPROVED');
    });
  });
});
