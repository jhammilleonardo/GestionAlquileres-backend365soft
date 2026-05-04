import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { of } from 'rxjs';
import { createHash } from 'crypto';
import { PayUProcessor } from './payu.processor';
import { ProcessorPaymentInput } from './payment-processor.interface';

describe('PayUProcessor', () => {
  let processor: PayUProcessor;
  let httpService: jest.Mocked<HttpService>;

  const TEST_API_KEY = 'test_api_key_12345';
  const TEST_MERCHANT_ID = '508029';

  const baseInput: ProcessorPaymentInput = {
    amount: 650,
    currency: 'GTQ',
    tenantId: 3,
    contractId: 30,
    propertyId: 12,
    reference_number: 'REF-GT-001',
    notes: 'Pago de alquiler',
    metadata: { country: 'GT' },
  };

  const mockConfig = (key: string, def = '') => {
    const cfg: Record<string, string> = {
      PAYU_BASE_URL:
        'https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi',
      PAYU_MERCHANT_ID: TEST_MERCHANT_ID,
      PAYU_API_KEY: TEST_API_KEY,
      PAYU_API_LOGIN: 'test_api_login',
      PAYU_ACCOUNT_ID: '512321',
      NODE_ENV: 'test',
    };
    return cfg[key] ?? def;
  };

  beforeEach(async () => {
    const mockHttpService = { post: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayUProcessor,
        { provide: ConfigService, useValue: { get: mockConfig } },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    processor = module.get(PayUProcessor);
    httpService = module.get(HttpService);
    jest.clearAllMocks();
  });

  it('debe tener processorName = "payu"', () => {
    expect(processor.processorName).toBe('payu');
  });

  describe('createPayment', () => {
    it('debe enviar la transacción y devolver APPROVED si el estado es APPROVED', async () => {
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({
          data: {
            transactionResponse: {
              state: 'APPROVED',
              transactionId: 'TXN_GT_001',
            },
          },
        }),
      );

      const result = await processor.createPayment(baseInput);

      expect(result.success).toBe(true);
      expect(result.transaction_id).toBe('TXN_GT_001');
      expect(result.status).toBe('APPROVED');
    });

    it('debe devolver PROCESSING si el estado es PENDING', async () => {
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({
          data: {
            transactionResponse: {
              state: 'PENDING',
              transactionId: 'TXN_PEND',
            },
          },
        }),
      );

      const result = await processor.createPayment(baseInput);

      expect(result.success).toBe(true);
      expect(result.status).toBe('PROCESSING');
    });

    it('debe devolver FAILED si el estado es DECLINED', async () => {
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({
          data: {
            transactionResponse: {
              state: 'DECLINED',
              transactionId: 'TXN_FAIL',
              responseMessage: 'Fondos insuficientes',
            },
          },
        }),
      );

      const result = await processor.createPayment(baseInput);

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
      expect(result.error).toBe('Fondos insuficientes');
    });

    it('debe devolver FAILED si PayU no devuelve transactionResponse', async () => {
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({ data: {} }),
      );

      const result = await processor.createPayment(baseInput);

      expect(result.success).toBe(false);
      expect(result.status).toBe('FAILED');
    });

    it('debe incluir test=true cuando NODE_ENV != production', async () => {
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({ data: { transactionResponse: { state: 'APPROVED', transactionId: 'X' } } }),
      );

      await processor.createPayment(baseInput);

      const body = (httpService.post as jest.Mock).mock.calls[0][1];
      expect(body.test).toBe(true);
    });
  });

  describe('refundPayment', () => {
    it('debe enviar REFUND y devolver APPROVED', async () => {
      (httpService.post as jest.Mock).mockReturnValueOnce(
        of({
          data: {
            transactionResponse: {
              state: 'APPROVED',
              transactionId: 'TXN_REFUND_001',
            },
          },
        }),
      );

      const result = await processor.refundPayment('TXN_GT_001', 200);

      const body = (httpService.post as jest.Mock).mock.calls[0][1];
      expect(body.transaction.type).toBe('REFUND');
      expect(result.success).toBe(true);
      expect(result.status).toBe('APPROVED');
    });
  });

  describe('handleWebhook (IPN)', () => {
    const buildIpnBody = (
      statePol: string,
      referenceCode: string,
      amount: string,
      currency: string,
    ): Record<string, string> => {
      const rawAmount = Number(amount).toFixed(1);
      const raw = `${TEST_API_KEY}~${TEST_MERCHANT_ID}~${referenceCode}~${rawAmount}~${currency}~${statePol}`;
      const sign = createHash('md5').update(raw).digest('hex');
      return {
        state_pol: statePol,
        reference_pol: referenceCode,
        transaction_id: 'TXN_IPN_001',
        amount_pol: amount,
        currency,
        sign,
      };
    };

    it('debe devolver APPROVED para state_pol=4 (APPROVED)', async () => {
      const body = buildIpnBody('4', 'REF-GT-001', '650.00', 'GTQ');
      const result = await processor.handleWebhook(body);
      expect(result.status).toBe('APPROVED');
      expect(result.transaction_id).toBe('TXN_IPN_001');
    });

    it('debe devolver FAILED para state_pol=6 (DECLINED)', async () => {
      const body = buildIpnBody('6', 'REF-GT-001', '650.00', 'GTQ');
      const result = await processor.handleWebhook(body);
      expect(result.status).toBe('FAILED');
    });

    it('debe devolver FAILED para state_pol=5 (EXPIRED)', async () => {
      const body = buildIpnBody('5', 'REF-GT-001', '650.00', 'GTQ');
      const result = await processor.handleWebhook(body);
      expect(result.status).toBe('FAILED');
    });

    it('debe devolver FAILED si la firma es inválida', async () => {
      const body = {
        state_pol: '4',
        reference_pol: 'REF-001',
        transaction_id: 'TXN_001',
        amount_pol: '100.00',
        currency: 'GTQ',
        sign: 'firma_incorrecta',
      };

      const result = await processor.handleWebhook(body);
      expect(result.status).toBe('FAILED');
    });

    it('debe aceptar IPN sin firma (sandbox)', async () => {
      const body = {
        state_pol: '4',
        reference_pol: 'REF-001',
        transaction_id: 'TXN_001',
        amount_pol: '100.00',
        currency: 'GTQ',
      };

      const result = await processor.handleWebhook(body);
      expect(result.status).toBe('APPROVED');
    });
  });
});
