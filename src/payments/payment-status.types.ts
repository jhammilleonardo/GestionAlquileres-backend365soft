import { quoteIdent } from '../common/utils/sql-identifier';
import { PaymentStatus } from './enums';

export interface PaymentStatusRow {
  id: number;
  tenant_id: number;
  property_id: number;
  amount: string | number;
  currency: string;
  payment_date: string | Date;
  status: PaymentStatus;
  admin_notes?: string | null;
  rejection_reason?: string | null;
}

export function paymentTable(schemaName?: string): string {
  return `${quoteIdent(schemaName || 'public')}.payments`;
}
