import { PartialType } from '@nestjs/swagger';
import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateRentalOwnerDto } from './create-rental-owner.dto';

export class UpdateRentalOwnerDto extends PartialType(CreateRentalOwnerDto) {
  /**
   * Solo el admin puede reactivar manualmente un propietario.
   * Para desactivar, usar el endpoint DELETE (aplica validación de propiedades activas).
   */
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
