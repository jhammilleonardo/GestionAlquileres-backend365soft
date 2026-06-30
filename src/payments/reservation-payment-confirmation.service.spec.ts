import { ConflictException } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { ReservationPaymentConfirmationService } from './reservation-payment-confirmation.service';

describe('ReservationPaymentConfirmationService', () => {
  const service = new ReservationPaymentConfirmationService();
  const query = jest.fn<Promise<unknown>, [string, unknown[]?]>();
  const queryRunner = {
    query,
  } as unknown as QueryRunner;

  beforeEach(() => query.mockReset());

  it('confirma atómicamente una retención cubierta por pagos aprobados', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 8,
          status: 'pending_payment',
          total_amount: '150.00',
          hold_expired: false,
        },
      ])
      .mockResolvedValueOnce([{ approved_total: '150.00' }])
      .mockResolvedValueOnce([{ id: 8 }]);

    await expect(
      service.confirmIfFullyPaid(queryRunner, 'tenant_acme', 8),
    ).resolves.toBe(true);
    const updateCall = query.mock.calls[2] as [string, unknown[]];
    expect(updateCall[0]).toContain("status = 'confirmed'");
    expect(updateCall[0]).toContain('expires_at = NULL');
  });

  it('mantiene la retención si el pago aprobado es parcial', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 8,
          status: 'pending_payment',
          total_amount: '150.00',
          hold_expired: false,
        },
      ])
      .mockResolvedValueOnce([{ approved_total: '80.00' }]);

    await expect(
      service.confirmIfFullyPaid(queryRunner, 'tenant_acme', 8),
    ).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('confirma con el anticipo requerido aunque el total de la reserva quede con saldo', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 8,
          status: 'pending_payment',
          total_amount: '1000.00',
          deposit_required: '300.00',
          hold_expired: false,
        },
      ])
      .mockResolvedValueOnce([{ approved_total: '300.00' }])
      .mockResolvedValueOnce([{ id: 8 }]);

    await expect(
      service.confirmIfFullyPaid(queryRunner, 'tenant_acme', 8),
    ).resolves.toBe(true);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('tolera diferencias menores a un centavo al comparar anticipo requerido', async () => {
    query
      .mockResolvedValueOnce([
        {
          id: 8,
          status: 'pending_payment',
          total_amount: '1000.00',
          deposit_required: '300.00',
          hold_expired: false,
        },
      ])
      .mockResolvedValueOnce([{ approved_total: '299.995' }])
      .mockResolvedValueOnce([{ id: 8 }]);

    await expect(
      service.confirmIfFullyPaid(queryRunner, 'tenant_acme', 8),
    ).resolves.toBe(true);
  });

  it('rechaza aprobar pagos de una retención vencida', async () => {
    query.mockResolvedValueOnce([
      {
        id: 8,
        status: 'pending_payment',
        total_amount: '150.00',
        hold_expired: true,
      },
    ]);

    await expect(
      service.confirmIfFullyPaid(queryRunner, 'tenant_acme', 8),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('no modifica reservas que no esperan pago', async () => {
    query.mockResolvedValueOnce([
      {
        id: 8,
        status: 'confirmed',
        total_amount: '150.00',
        hold_expired: false,
      },
    ]);

    await expect(
      service.confirmIfFullyPaid(queryRunner, 'tenant_acme', 8),
    ).resolves.toBe(false);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
