import { Test, TestingModule } from '@nestjs/testing';
import { NotImplementedException } from '@nestjs/common';
import { QRBoliviaProcessor } from './qr-bolivia.processor';
import { QrPaymentService } from '../qr/qr-payment.service';
import { ProcessorPaymentInput } from './payment-processor.interface';

const mockQrService = {
  generarQrDinamico: jest.fn(),
  verificarEstadoQr: jest.fn(),
};

describe('QRBoliviaProcessor', () => {
  let processor: QRBoliviaProcessor;

  const baseInput: ProcessorPaymentInput = {
    amount: 1500,
    currency: 'BOB',
    tenantId: 4,
    contractId: 40,
    propertyId: 15,
    reference_number: 'REF-BO-001',
    notes: 'Alquiler mayo 2026',
    metadata: { tenantSlug: 'inmobiliaria-cochabamba', payment_type: 'RENT' },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QRBoliviaProcessor,
        { provide: QrPaymentService, useValue: mockQrService },
      ],
    }).compile();

    processor = module.get(QRBoliviaProcessor);
    jest.clearAllMocks();
  });

  it('debe tener processorName = "qr_bolivia"', () => {
    expect(processor.processorName).toBe('qr_bolivia');
  });

  describe('createPayment', () => {
    it('debe generar un QR dinámico y devolver status PENDING', async () => {
      mockQrService.generarQrDinamico.mockResolvedValue({
        id: 77,
        status: 'PENDIENTE',
        qr_image: 'base64...',
      });

      const result = await processor.createPayment(baseInput);

      expect(mockQrService.generarQrDinamico).toHaveBeenCalledWith(
        'inmobiliaria-cochabamba',
        expect.objectContaining({
          tenant_id: 4,
          amount: 1500,
          currency: 'BOB',
          contract_id: 40,
          payment_type: 'RENT',
        }),
      );

      expect(result.success).toBe(true);
      expect(result.transaction_id).toBe('77@inmobiliaria-cochabamba');
      expect(result.status).toBe('PENDING');
      expect(result.processor_fee).toBe(0);
    });
  });

  describe('confirmPayment', () => {
    it('debe verificar el estado del QR y devolver APPROVED si PAGADO', async () => {
      mockQrService.verificarEstadoQr.mockResolvedValue({ status: 'PAGADO' });

      const result = await processor.confirmPayment(
        '77@inmobiliaria-cochabamba',
      );

      expect(mockQrService.verificarEstadoQr).toHaveBeenCalledWith(
        'inmobiliaria-cochabamba',
        { qr_id: 77 },
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('APPROVED');
    });

    it('debe devolver PENDING si el QR no ha sido pagado aún', async () => {
      mockQrService.verificarEstadoQr.mockResolvedValue({
        status: 'PENDIENTE',
      });

      const result = await processor.confirmPayment(
        '77@inmobiliaria-cochabamba',
      );

      expect(result.success).toBe(false);
      expect(result.status).toBe('PENDING');
    });
  });

  describe('refundPayment', () => {
    it('debe lanzar NotImplementedException', async () => {
      await expect(processor.refundPayment('77@slug', 500)).rejects.toThrow(
        NotImplementedException,
      );
    });
  });

  describe('handleWebhook', () => {
    it('debe devolver APPROVED con el alias si el payload lo contiene', async () => {
      const payload = {
        alias: 'QR365T4T20260504abc12345',
        monto: 1500,
      };

      const result = await processor.handleWebhook(payload);

      expect(result.status).toBe('APPROVED');
      expect(result.transaction_id).toBe('QR365T4T20260504abc12345');
    });

    it('debe devolver FAILED si el payload no tiene alias', async () => {
      const result = await processor.handleWebhook({ monto: 100 });

      expect(result.status).toBe('FAILED');
    });
  });
});
