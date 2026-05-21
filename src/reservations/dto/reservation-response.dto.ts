import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AvailabilityStatus } from '../enums/availability-status.enum';
import { ReservationStatus } from '../enums/reservation-status.enum';

export class DayAvailabilityResponseDto {
  @ApiProperty({ example: '2026-05-20' })
  date: string;

  @ApiProperty({ enum: AvailabilityStatus })
  status: AvailabilityStatus;
}

export class BlockDatesResponseDto {
  @ApiProperty({ example: 3 })
  blocked: number;
}

export class ReservationResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 7 })
  unit_id: number;

  @ApiProperty({ example: 12 })
  tenant_id: number;

  @ApiProperty({ example: '2026-05-10' })
  checkin_date: string;

  @ApiProperty({ example: '2026-05-15' })
  checkout_date: string;

  @ApiProperty({ example: 5 })
  nights: number;

  @ApiProperty({ example: '80.00' })
  price_per_night: string;

  @ApiPropertyOptional({ example: '30.00', nullable: true })
  cleaning_fee: string | null;

  @ApiProperty({ example: '430.00' })
  total_amount: string;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ enum: ReservationStatus })
  status: ReservationStatus;

  @ApiPropertyOptional({ example: 'Llegamos a las 15:00', nullable: true })
  notes: string | null;
}
