import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ViolationStatusEnum } from '../enums/violation-status.enum';

export class ViolationResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiPropertyOptional({ example: 7, nullable: true })
  unit_id: number | null;

  @ApiProperty({ example: 12 })
  tenant_id: number;

  @ApiProperty({ example: 'NOISE' })
  type: string;

  @ApiProperty({ example: 'Ruido excesivo después de medianoche.' })
  description: string;

  @ApiProperty({ enum: ViolationStatusEnum })
  status: ViolationStatusEnum;

  @ApiProperty({ type: String, isArray: true })
  evidence_photos: string[];

  @ApiProperty({ example: 'Departamento Centro' })
  property_title: string;

  @ApiProperty({ example: 'Luis Rojas' })
  tenant_name: string;

  @ApiProperty({ example: 'luis@example.com' })
  tenant_email: string;
}

export class PaginatedViolationsResponseDto {
  @ApiProperty({ type: ViolationResponseDto, isArray: true })
  data: ViolationResponseDto[];

  @ApiProperty({ example: 20 })
  total: number;
}

export class ViolationMessageResponseDto {
  @ApiProperty({ example: 'Notificación enviada al inquilino correctamente.' })
  message: string;
}
