import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ChargeFineDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  /** ISO 4217 (USD, BOB, ...). Si se omite se toma de la config del tenant. */
  @IsString()
  @IsOptional()
  @Length(3, 3)
  currency?: string;

  /** Plazo de pago opcional (YYYY-MM-DD). */
  @IsDateString()
  @IsOptional()
  due_date?: string;
}
