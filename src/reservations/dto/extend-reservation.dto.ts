import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class ExtendReservationDto {
  @ApiProperty({ example: '2027-01-20', description: 'Nueva fecha de salida' })
  @IsDateString()
  checkout_date: string;
}
