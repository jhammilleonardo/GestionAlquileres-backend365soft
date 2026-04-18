import { PaymentsService } from './payments.service';
import { DataSource } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OwnerStatementsService } from '../owner-statements/owner-statements.service';
import { SplitPaymentService } from '../split-payment/split-payment.service';

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
      {} as TenantsService,
      {} as NotificationsService,
      {} as OwnerStatementsService,
      {} as SplitPaymentService,
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
      expect(service.isValidStatusTransition('PENDING', 'PROCESSING')).toBe(true);
    });

    it('debe permitir PENDING → REJECTED', () => {
      expect(service.isValidStatusTransition('PENDING', 'REJECTED')).toBe(true);
    });

    it('debe permitir PENDING → FAILED', () => {
      expect(service.isValidStatusTransition('PENDING', 'FAILED')).toBe(true);
    });

    it('debe permitir PROCESSING → APPROVED', () => {
      expect(service.isValidStatusTransition('PROCESSING', 'APPROVED')).toBe(true);
    });

    it('debe permitir PROCESSING → FAILED', () => {
      expect(service.isValidStatusTransition('PROCESSING', 'FAILED')).toBe(true);
    });

    it('debe permitir APPROVED → REFUNDED', () => {
      expect(service.isValidStatusTransition('APPROVED', 'REFUNDED')).toBe(true);
    });

    it('debe permitir APPROVED → DISPUTED', () => {
      expect(service.isValidStatusTransition('APPROVED', 'DISPUTED')).toBe(true);
    });

    it('debe rechazar REJECTED → APPROVED (estado terminal)', () => {
      expect(service.isValidStatusTransition('REJECTED', 'APPROVED')).toBe(false);
    });

    it('debe rechazar FAILED → APPROVED (estado terminal)', () => {
      expect(service.isValidStatusTransition('FAILED', 'APPROVED')).toBe(false);
    });

    it('debe rechazar REFUNDED → PENDING (estado terminal)', () => {
      expect(service.isValidStatusTransition('REFUNDED', 'PENDING')).toBe(false);
    });

    it('debe rechazar PENDING → REFUNDED (saltar estados)', () => {
      expect(service.isValidStatusTransition('PENDING', 'REFUNDED')).toBe(false);
    });

    it('debe rechazar transiciones con estado desconocido', () => {
      expect(service.isValidStatusTransition('UNKNOWN', 'APPROVED')).toBe(false);
    });
  });
});
