import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '../enums';

/**
 * DTO para que un inquilino/huésped pague una reserva de corto plazo. No lleva
 * `contract_id`: el pago se vincula a la reserva (`reservation_id`) en el
 * servicio. La moneda se hereda de la reserva, no se acepta del cliente.
 */
export class CreateReservationPaymentDto {
  @ApiProperty({ example: 420.0, minimum: 0.01 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  amount: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.TRANSFER })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  payment_method: PaymentMethod;

  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  @IsNotEmpty()
  payment_date: string;

  @ApiPropertyOptional({ example: 'TRX-998877', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference_number?: string;

  @ApiPropertyOptional({ example: 'Pago estadía junio', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;
}
