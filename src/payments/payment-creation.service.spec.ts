import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentStatus } from './enums';
import { PaymentCreationNotificationService } from './payment-creation-notification.service';
import { PaymentCreationService } from './payment-creation.service';
import { PaymentCreationValidationService } from './payment-creation-validation.service';

describe('PaymentCreationService', () => {
  let service: PaymentCreationService;
  let queryRunner: {
    connect: jest.Mock<Promise<void>, []>;
    startTransaction: jest.Mock<Promise<void>, []>;
    commitTransaction: jest.Mock<Promise<void>, []>;
    rollbackTransaction: jest.Mock<Promise<void>, []>;
    release: jest.Mock<Promise<void>, []>;
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  };
  let dataSource: {
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
    createQueryRunner: jest.Mock;
  };
  let tenantsService: {
    findBySlug: jest.Mock;
  };
  let notificationsService: {
    createForUserInSchema: jest.Mock<Promise<unknown>, unknown[]>;
    createForUser: jest.Mock<Promise<unknown>, unknown[]>;
  };
  let paymentCreationNotificationService: PaymentCreationNotificationService;
  let paymentCreationValidationService: PaymentCreationValidationService;

  beforeEach(() => {
    queryRunner = {
      connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
      startTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      commitTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      rollbackTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      release: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
      query: jest.fn<Promise<unknown>, [string, unknown[]?]>(),
    };
    dataSource = {
      query: jest.fn<Promise<unknown>, [string, unknown[]?]>(),
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    tenantsService = {
      findBySlug: jest.fn().mockResolvedValue({
        slug: 'acme',
        schema_name: 'tenant_acme',
      }),
    };
    notificationsService = {
      createForUserInSchema: jest
        .fn<Promise<unknown>, unknown[]>()
        .mockResolvedValue({}),
      createForUser: jest
        .fn<Promise<unknown>, unknown[]>()
        .mockResolvedValue({}),
    };
    paymentCreationNotificationService = new PaymentCreationNotificationService(
      notificationsService as unknown as NotificationsService,
    );
    paymentCreationValidationService = new PaymentCreationValidationService();

    service = new PaymentCreationService(
      dataSource as unknown as DataSource,
      tenantsService as unknown as TenantsService,
      paymentCreationValidationService,
      paymentCreationNotificationService,
    );
  });

  it('createPayment usa contrato activo, schema calificado y notifica admins', async () => {
    const payment = { id: 33, tenant_id: 7, status: PaymentStatus.PENDING };
    queryRunner.query
      .mockResolvedValueOnce([{ id: 10, property_id: 20 }])
      .mockResolvedValueOnce([payment]);
    dataSource.query.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    await expect(
      service.createPayment(
        7,
        {
          amount: 100,
          payment_type: 'RENT',
          payment_method: 'CASH',
          payment_date: '2026-05-17',
        },
        'acme',
        undefined,
        undefined,
        'proof.jpg',
      ),
    ).resolves.toBe(payment);

    expect(tenantsService.findBySlug).toHaveBeenCalledWith('acme');
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM "tenant_acme".contracts'),
      [7],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO "tenant_acme".payments'),
      expect.any(Array),
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "tenant_acme"."user"'),
      undefined,
    );
    expect(notificationsService.createForUserInSchema).toHaveBeenCalledTimes(2);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });

  it('createPayment hace rollback cuando no hay contrato activo', async () => {
    queryRunner.query.mockResolvedValueOnce([]);

    await expect(
      service.createPayment(7, {
        amount: 100,
        payment_type: 'RENT',
        payment_method: 'CASH',
        payment_date: '2026-05-17',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('createPaymentAsAdmin valida contrato e inserta pago con schema calificado', async () => {
    const payment = { id: 44, tenant_id: 7, status: PaymentStatus.PENDING };
    queryRunner.query
      .mockResolvedValueOnce([
        { id: 10, tenant_id: 7, property_id: 20, status: 'ACTIVO' },
      ])
      .mockResolvedValueOnce([payment]);

    await expect(
      service.createPaymentAsAdmin(
        {
          tenant_id: 7,
          contract_id: 10,
          property_id: 20,
          amount: 100,
          payment_type: 'RENT',
          payment_method: 'CASH',
          payment_date: '2026-05-17',
        },
        99,
        'tenant_acme',
      ),
    ).resolves.toBe(payment);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id, tenant_id, property_id, status FROM "tenant_acme".contracts WHERE id = $1',
      [10],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO "tenant_acme".payments'),
      expect.any(Array),
    );
    expect(queryRunner.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('createPaymentAsAdmin rechaza contrato inexistente', async () => {
    queryRunner.query.mockResolvedValueOnce([]);

    await expect(
      service.createPaymentAsAdmin(
        {
          tenant_id: 7,
          contract_id: 10,
          property_id: 20,
          amount: 100,
          payment_type: 'RENT',
          payment_method: 'CASH',
          payment_date: '2026-05-17',
        },
        99,
        'tenant_acme',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });
});
