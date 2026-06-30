import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class MatchBankTransactionDto {
  @ApiProperty({ example: 15 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  bank_transaction_id: number;

  @ApiProperty({ example: 40 })
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  journal_line_id: number;
}
