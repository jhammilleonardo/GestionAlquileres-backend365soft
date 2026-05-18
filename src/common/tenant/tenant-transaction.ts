import type { DataSource, QueryRunner } from 'typeorm';
import { tenantConnectionStore } from './tenant-connection.store';

export async function runTenantTransaction<T>(
  dataSource: DataSource,
  work: (queryRunner: QueryRunner) => Promise<T>,
): Promise<T> {
  const activeRunner = tenantConnectionStore.getStore()?.queryRunner ?? null;
  const queryRunner = activeRunner ?? dataSource.createQueryRunner();
  const shouldRelease = !activeRunner;
  const shouldStartTransaction = !queryRunner.isTransactionActive;

  if (shouldRelease) {
    await queryRunner.connect();
  }

  if (shouldStartTransaction) {
    await queryRunner.startTransaction();
  }

  try {
    const result = await work(queryRunner);
    if (shouldStartTransaction) {
      await queryRunner.commitTransaction();
    }
    return result;
  } catch (error) {
    if (shouldStartTransaction) {
      await queryRunner.rollbackTransaction();
    }
    throw error;
  } finally {
    if (shouldRelease) {
      await queryRunner.release();
    }
  }
}
