import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExpenseResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiPropertyOptional({ example: 7, nullable: true })
  unit_id: number | null;

  @ApiProperty({ example: 'MAINTENANCE' })
  category: string;

  @ApiProperty({ example: 250 })
  amount: number;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiPropertyOptional({ example: 'Reparación de grifo', nullable: true })
  description: string | null;

  @ApiProperty({ example: '2026-05-20' })
  date: Date;

  @ApiPropertyOptional({ example: 3, nullable: true })
  vendor_id: number | null;

  @ApiPropertyOptional({ example: 'Plomería Central', nullable: true })
  vendor_name: string | null;

  @ApiPropertyOptional({ example: '/receipts/expense-1.pdf', nullable: true })
  receipt_url: string | null;

  @ApiProperty({ example: false })
  is_recurring: boolean;
}

export class PaginatedExpensesResponseDto {
  @ApiProperty({ type: ExpenseResponseDto, isArray: true })
  data: ExpenseResponseDto[];

  @ApiProperty({ example: 40 })
  total: number;
}

export class ExpenseSummaryResponseDto {
  @ApiProperty({ example: '1200.00' })
  total_expenses: string;

  @ApiProperty({ example: { MAINTENANCE: '800.00', UTILITIES: '400.00' } })
  by_category: Record<string, string>;

  @ApiProperty({ example: 5 })
  expense_count: number;

  @ApiPropertyOptional({ example: { '7': '400.00' } })
  by_unit?: Record<string, string>;
}
