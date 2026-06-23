import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationAction } from '../enums/reservation-action.enum';

/**
 * Acción de transición de estado de una reserva (admin). La validez del cambio
 * (estado origen permitido) la decide la máquina de estados en el servicio.
 */
export class UpdateReservationStatusDto {
  @ApiProperty({
    enum: ReservationAction,
    example: ReservationAction.CONFIRM,
    description: 'Acción a aplicar sobre la reserva',
  })
  @IsEnum(ReservationAction)
  action: ReservationAction;

  @ApiPropertyOptional({
    example: 'Huésped no se presentó tras 24h',
    description: 'Motivo/nota opcional del cambio de estado',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
