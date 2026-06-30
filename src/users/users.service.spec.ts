import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { BCRYPT_SALT_ROUNDS } from '../common/constants/security.constants';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('UsersService security rules', () => {
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let managerQuery: jest.Mock;
  let service: UsersService;

  beforeEach(() => {
    managerQuery = jest.fn().mockResolvedValue([]);
    dataSource = {
      query: jest.fn(),
      transaction: jest.fn((work: (manager: { query: jest.Mock }) => unknown) =>
        Promise.resolve(work({ query: managerQuery })),
      ),
    };
    service = new UsersService(dataSource as unknown as DataSource);
    jest.clearAllMocks();
  });

  it('blocks a non-privileged user from updating another profile', async () => {
    await expect(
      service.updateProfile(
        'tenant_demo',
        2,
        { name: 'Target User' },
        { userId: 1, role: 'INQUILINO' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('blocks an employee from resetting another user password', async () => {
    await expect(
      service.resetPassword('tenant_demo', 2, 'NewPassword123', undefined, {
        userId: 1,
        role: 'EMPLEADO',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('updates the current user profile with sanitized values', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 1,
        email: 'ana@example.com',
        name: 'Ana Perez',
        phone: null,
        role: 'ADMIN',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    const result = await service.updateProfile(
      'tenant_demo',
      1,
      { name: ' Ana Perez ', email: ' ANA@EXAMPLE.COM ', phone: ' ' },
      { userId: 1, role: 'ADMIN' },
    );

    expect(result.email).toBe('ana@example.com');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "tenant_demo"."user"'),
      ['Ana Perez', 'ana@example.com', null, 1],
    );
  });

  it('requires current password when changing own password', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 1, password: 'stored-hash' },
    ]);

    await expect(
      service.resetPassword('tenant_demo', 1, 'NewPassword123', undefined, {
        userId: 1,
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it('rejects own password change when current password is wrong', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 1, password: 'stored-hash' },
    ]);
    jest.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

    await expect(
      service.resetPassword(
        'tenant_demo',
        1,
        'NewPassword123',
        'WrongPassword123',
        { userId: 1, role: 'ADMIN' },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  it('allows a privileged user to reset another user password', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 7, password: 'stored-hash', role: 'VENDOR' },
    ]);
    jest.mocked(bcrypt.hash).mockResolvedValueOnce('new-hash' as never);

    await service.resetPassword('tenant_demo', 7, 'NewPassword123', undefined, {
      userId: 1,
      role: 'ADMIN',
    });

    expect(bcrypt.hash).toHaveBeenCalledWith(
      'NewPassword123',
      BCRYPT_SALT_ROUNDS,
    );
    expect(managerQuery).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE "tenant_demo"."user"'),
      ['new-hash', 7],
    );
    expect(managerQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE public.refresh_tokens'),
      [7, 'tenant_demo', 'VENDOR'],
    );
  });

  it('returns not found when the target user does not exist', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.resetPassword('tenant_demo', 99, 'NewPassword123', undefined, {
        userId: 1,
        role: 'ADMIN',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('UsersService rent ledger', () => {
  let dataSource: { query: jest.Mock };
  let service: UsersService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    service = new UsersService(dataSource as unknown as DataSource);
  });

  it('computes running balance and summary exactly (no cent drift)', async () => {
    // 3 cargos pendientes de 333.33 + un pago aprobado de 100.00.
    dataSource.query.mockResolvedValueOnce([
      {
        id: 1,
        payment_date: '2026-01-05',
        due_date: '2026-01-05',
        payment_type: 'RENT',
        payment_method: 'transfer',
        status: 'APPROVED',
        amount: '100.00',
        currency: 'BOB',
        reference_number: 'A-1',
        contract_number: 'C-1',
      },
      {
        id: 2,
        payment_date: '2026-02-05',
        due_date: '2026-02-05',
        payment_type: 'RENT',
        payment_method: 'transfer',
        status: 'PENDING',
        amount: '333.33',
        currency: 'BOB',
        reference_number: null,
        contract_number: 'C-1',
      },
      {
        id: 3,
        payment_date: '2026-03-05',
        due_date: '2026-03-05',
        payment_type: 'RENT',
        payment_method: 'transfer',
        status: 'PENDING',
        amount: '333.33',
        currency: 'BOB',
        reference_number: null,
        contract_number: 'C-1',
      },
    ]);

    const ledger = await service.getTenantLedger('tenant_demo', 42);

    expect(ledger.tenant_id).toBe(42);
    expect(ledger.currency).toBe('BOB');
    expect(ledger.lines).toHaveLength(3);
    // El saldo acumulado solo crece con los pendientes.
    expect(ledger.lines[0].running_balance).toBe(0);
    expect(ledger.lines[1].running_balance).toBe(333.33);
    expect(ledger.lines[2].running_balance).toBe(666.66);
    expect(ledger.summary).toEqual({
      total_charged: 766.66,
      total_paid: 100,
      balance_due: 666.66,
      pending_count: 2,
    });
  });

  it('reverses paid totals on refunds', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 1,
        payment_date: '2026-01-05',
        due_date: null,
        payment_type: 'RENT',
        payment_method: 'card',
        status: 'APPROVED',
        amount: '500.00',
        currency: 'USD',
        reference_number: null,
        contract_number: null,
      },
      {
        id: 2,
        payment_date: '2026-01-10',
        due_date: null,
        payment_type: 'RENT',
        payment_method: 'card',
        status: 'REFUNDED',
        amount: '200.00',
        currency: 'USD',
        reference_number: null,
        contract_number: null,
      },
    ]);

    const ledger = await service.getTenantLedger('tenant_demo', 7);

    expect(ledger.currency).toBe('USD');
    expect(ledger.summary.total_paid).toBe(300);
    expect(ledger.summary.balance_due).toBe(-200);
  });
});
