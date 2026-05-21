import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RentalType } from '../enums/rental-type.enum';
import { UnitStatus } from '../enums/unit-status.enum';

export class UnitResponseDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: '2A' })
  unit_number: string;

  @ApiPropertyOptional({ example: 2, nullable: true })
  floor: number | null;

  @ApiPropertyOptional({ example: 2, nullable: true })
  bedrooms: number | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  bathrooms: number | null;

  @ApiPropertyOptional({ example: 65.5, nullable: true })
  square_meters: number | null;

  @ApiProperty({ enum: UnitStatus, example: UnitStatus.AVAILABLE })
  status: UnitStatus;

  @ApiPropertyOptional({ enum: RentalType, example: RentalType.LONG_TERM })
  rental_type: RentalType | null;

  @ApiPropertyOptional({ example: 3000, nullable: true })
  price_per_month: number | null;

  @ApiPropertyOptional({ example: 80, nullable: true })
  price_per_night: number | null;

  @ApiPropertyOptional({ example: 3000, nullable: true })
  deposit_amount: number | null;

  @ApiPropertyOptional({ example: 2, nullable: true })
  min_nights: number | null;

  @ApiPropertyOptional({ example: 30, nullable: true })
  max_nights: number | null;

  @ApiPropertyOptional({ example: '14:00', nullable: true })
  checkin_time: string | null;

  @ApiPropertyOptional({ example: '11:00', nullable: true })
  checkout_time: string | null;

  @ApiPropertyOptional({ example: 30, nullable: true })
  cleaning_fee: number | null;

  @ApiPropertyOptional({ example: { has_balcony: true }, nullable: true })
  features: Record<string, unknown> | null;
}

export class UnitDeleteResponseDto {
  @ApiProperty({ example: 'Unit deleted successfully' })
  message: string;

  @ApiProperty({ example: 7 })
  id: number;
}
