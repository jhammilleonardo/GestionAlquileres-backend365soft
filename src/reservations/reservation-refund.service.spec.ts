import { ReservationRefundService } from './reservation-refund.service';
import { QueryRunner } from 'typeorm';

describe('ReservationRefundService', () => {
  let service: ReservationRefundService;
  const query = jest.fn();
  const queryRunner = { query } as unknown as QueryRunner;

  beforeEach(() => {
    service = new ReservationRefundService();
    query.mockReset();
  });

  it('no hace nada si el porcentaje es 0', async () => {
    const total = await service.refundApprovedPayments(queryRunner, 5, 0, 42);

    expect(total).toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('reembolsa el porcentaje de cada pago aprobado y lo marca REFUNDED', async () => {
    query
      .mockResolvedValueOnce([
        { id: 1, amount: '200.00' },
        { id: 2, amount: '100.00' },
      ]) // SELECT pagos aprobados
      .mockResolvedValue(undefined); // INSERT refund + UPDATE payment (x2 c/u)

    const total = await service.refundApprovedPayments(queryRunner, 5, 50, 42);

    // 50% de 200 = 100; 50% de 100 = 50 → total 150
    expect(total).toBe(150);
    // 1 SELECT + (INSERT + UPDATE) por cada uno de los 2 pagos = 5 queries
    expect(query).toHaveBeenCalledTimes(5);
  });

  it('omite pagos cuyo reembolso redondea a 0', async () => {
    query.mockResolvedValueOnce([]); // sin pagos aprobados

    const total = await service.refundApprovedPayments(queryRunner, 5, 100, 42);

    expect(total).toBe(0);
    expect(query).toHaveBeenCalledTimes(1); // solo el SELECT
  });

  describe('refundAbsoluteAmount', () => {
    it('reparte el monto sobre los pagos sin exceder su importe', async () => {
      query
        .mockResolvedValueOnce([
          { id: 1, amount: '200.00' },
          { id: 2, amount: '370.00' },
        ]) // SELECT aprobados
        .mockResolvedValue(undefined);

      // reembolsar 360: 200 del pago 1 + 160 del pago 2
      const total = await service.refundAbsoluteAmount(queryRunner, 5, 360, 42);

      expect(total).toBe(360);
      const calls = query.mock.calls as Array<[string, unknown[]]>;
      const refunds = calls.filter((c) =>
        c[0].includes('INSERT INTO payment_refunds'),
      );
      expect(refunds).toHaveLength(2);
      expect(refunds[1][1][1]).toBe(160); // segundo refund = 160
    });

    it('no reembolsa nada si el monto es 0', async () => {
      const total = await service.refundAbsoluteAmount(queryRunner, 5, 0, 42);
      expect(total).toBe(0);
      expect(query).not.toHaveBeenCalled();
    });

    it('se detiene cuando el monto se agota', async () => {
      query
        .mockResolvedValueOnce([
          { id: 1, amount: '100.00' },
          { id: 2, amount: '100.00' },
        ])
        .mockResolvedValue(undefined);

      // reembolsar 80 → solo toca el primer pago
      const total = await service.refundAbsoluteAmount(queryRunner, 5, 80, 42);

      expect(total).toBe(80);
      const calls = query.mock.calls as Array<[string, unknown[]]>;
      const refunds = calls.filter((c) =>
        c[0].includes('INSERT INTO payment_refunds'),
      );
      expect(refunds).toHaveLength(1);
    });
  });
});
