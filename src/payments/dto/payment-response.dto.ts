import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Currency,
  PaymentMethod,
  PaymentProcessor,
  PaymentStatus,
  PaymentType,
} from '../enums';

export class PaymentTenantReferenceDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiPropertyOptional({ example: 'Luis Rojas' })
  name?: string;

  @ApiPropertyOptional({ example: 'Luis' })
  first_name?: string;

  @ApiPropertyOptional({ example: 'Rojas' })
  last_name?: string;

  @ApiProperty({ example: 'luis@example.com' })
  email: string;
}

export class PaymentPropertyReferenceDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Casa Central' })
  title: string;

  @ApiPropertyOptional({ example: 'Av. Siempre Viva 123' })
  address?: string;
}

export class PaymentContractReferenceDto {
  @ApiProperty({ example: 22 })
  id: number;

  @ApiProperty({ example: 'CTR-2026-0001' })
  contract_number: string;

  @ApiProperty({ example: '2026-05-01' })
  start_date: string;

  @ApiProperty({ example: '2027-04-30' })
  end_date: string;

  @ApiProperty({ example: 'ACTIVO' })
  status: string;
}

export class PaymentResponseDto {
  @ApiProperty({ example: 33 })
  id: number;

  @ApiProperty({ example: 7 })
  tenant_id: number;

  @ApiProperty({ example: 22 })
  contract_id: number;

  @ApiProperty({ example: 12 })
  property_id: number;

  @ApiProperty({ example: 1250.5 })
  amount: number;

  @ApiProperty({ enum: Currency, example: Currency.BOB })
  currency: Currency;

  @ApiProperty({ enum: PaymentType, example: PaymentType.RENT })
  payment_type: PaymentType;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.TRANSFER })
  payment_method: PaymentMethod;

  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.PENDING })
  status: PaymentStatus;

  @ApiProperty({ example: '2026-05-20' })
  payment_date: string | Date;

  @ApiPropertyOptional({ example: '2026-05-25' })
  due_date?: string | Date;

  @ApiPropertyOptional({ example: '2026-05-20T15:30:00.000Z' })
  processed_date?: string | Date;

  @ApiPropertyOptional({ example: 'TRX-123456' })
  reference_number?: string;

  @ApiPropertyOptional({ example: 'pi_test_123' })
  transaction_id?: string;

  @ApiPropertyOptional({ example: '000123' })
  check_number?: string;

  @ApiProperty({ enum: PaymentProcessor, example: PaymentProcessor.MANUAL })
  payment_processor: PaymentProcessor;

  @ApiPropertyOptional({ example: 29.3 })
  processor_fee?: number;

  @ApiPropertyOptional({ example: 'receipts/mi-empresa/comprobante.pdf' })
  proof_file?: string;

  @ApiPropertyOptional({ example: 'receipts/mi-empresa/recibo.pdf' })
  receipt_file?: string;

  @ApiPropertyOptional({ example: 'Pago alquiler mayo 2026' })
  notes?: string;

  @ApiPropertyOptional({ example: 'Verificado contra extracto bancario' })
  admin_notes?: string;

  @ApiPropertyOptional({ example: 'Comprobante ilegible' })
  rejection_reason?: string;

  @ApiProperty({ example: false })
  is_partial_payment: boolean;

  @ApiPropertyOptional({ example: 31 })
  parent_payment_id?: number;

  @ApiProperty({ example: false })
  is_recurring: boolean;

  @ApiPropertyOptional({ example: 2 })
  recurring_schedule_id?: number;

  @ApiProperty({ example: false })
  is_autopay: boolean;

  @ApiPropertyOptional({ example: 1 })
  created_by?: number;

  @ApiPropertyOptional({ example: 1 })
  approved_by?: number;

  @ApiPropertyOptional({ example: '2026-05-20T15:35:00.000Z' })
  approved_at?: string | Date;

  @ApiPropertyOptional({ example: { source: 'tenant_portal' } })
  metadata?: Record<string, unknown>;

  @ApiProperty({ example: '2026-05-20T15:30:00.000Z' })
  created_at: string | Date;

  @ApiProperty({ example: '2026-05-20T15:30:00.000Z' })
  updated_at: string | Date;

  @ApiPropertyOptional({ type: () => PaymentTenantReferenceDto })
  tenant?: PaymentTenantReferenceDto;

  @ApiPropertyOptional({ type: () => PaymentPropertyReferenceDto })
  property?: PaymentPropertyReferenceDto;

  @ApiPropertyOptional({ type: () => PaymentContractReferenceDto })
  contract?: PaymentContractReferenceDto;
}

export class PaginatedPaymentsResponseDto {
  @ApiProperty({ type: () => PaymentResponseDto, isArray: true })
  payments: PaymentResponseDto[];

  @ApiProperty({ example: 120 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 50 })
  limit: number;
}

export class PaymentStatsResponseDto {
  @ApiProperty({ example: 40 })
  total_payments: number;

  @ApiProperty({ example: 5 })
  total_pending: number;

  @ApiProperty({ example: 2 })
  total_processing: number;

  @ApiProperty({ example: 30 })
  total_approved: number;

  @ApiProperty({ example: 2 })
  total_rejected: number;

  @ApiProperty({ example: 1 })
  total_failed: number;

  @ApiProperty({ example: 4500 })
  total_amount_pending: number;

  @ApiProperty({ example: 38000 })
  total_amount_approved: number;

  @ApiProperty({ example: 300 })
  total_amount_failed: number;

  @ApiPropertyOptional({ example: { BOB: { count: 20, total_amount: 25000 } } })
  by_currency?: Record<string, { count: number; total_amount: number }>;

  @ApiPropertyOptional({ example: { RENT: 28, DEPOSIT: 2 } })
  by_type?: Record<string, number>;

  @ApiPropertyOptional({ example: { TRANSFER: 15, QR_MC4: 10 } })
  by_method?: Record<string, number>;
}

export class PaymentMethodOptionDto {
  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.TRANSFER })
  method: string;

  @ApiProperty({ example: 'Transferencia Bancaria' })
  label: string;
}

export class PaymentMessageResponseDto {
  @ApiProperty({ example: 'Pago eliminado exitosamente' })
  message: string;
}
