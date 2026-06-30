import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  ExpensePaymentStatusEnum,
  ExpenseResponsibilityEnum,
} from '../../expenses/enums/expense-category.enum';

export class CreateMaintenanceExpenseDto {
  @ApiProperty({ example: 250, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ example: 'BOB', default: 'BOB' })
  @IsString()
  @IsOptional()
  currency?: string = 'BOB';

  @ApiProperty({ example: '2026-06-26' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: '2026-07-05' })
  @IsDateString()
  @IsOptional()
  due_date?: string;

  @ApiPropertyOptional({
    enum: ExpensePaymentStatusEnum,
    default: ExpensePaymentStatusEnum.PENDING,
  })
  @IsEnum(ExpensePaymentStatusEnum)
  @IsOptional()
  payment_status?: ExpensePaymentStatusEnum = ExpensePaymentStatusEnum.PENDING;

  @ApiPropertyOptional({
    enum: ExpenseResponsibilityEnum,
    default: ExpenseResponsibilityEnum.OWNER,
  })
  @IsEnum(ExpenseResponsibilityEnum)
  @IsOptional()
  responsibility?: ExpenseResponsibilityEnum = ExpenseResponsibilityEnum.OWNER;

  @ApiPropertyOptional({ example: 'FAC-1001' })
  @IsString()
  @IsOptional()
  invoice_number?: string;

  @ApiPropertyOptional({ example: 'Cambio de bomba de agua' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  affects_owner_statement?: boolean = true;
}
