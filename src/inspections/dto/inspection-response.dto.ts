import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InspectionResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiPropertyOptional({ example: 7, nullable: true })
  unit_id?: number | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  contract_id?: number | null;

  @ApiProperty({ example: 'move_in' })
  type: string;

  @ApiProperty({ example: 'scheduled' })
  status: string;

  @ApiPropertyOptional({ example: '2026-05-20T10:00:00.000Z', nullable: true })
  scheduled_date?: Date | string | null;

  @ApiPropertyOptional({ example: 'Departamento Centro' })
  property_title?: string;
}

export class InspectionDetailResponseDto extends InspectionResponseDto {
  @ApiProperty({ type: Object, isArray: true })
  items: Record<string, unknown>[];
}

export class InspectionCompareResponseDto {
  @ApiProperty({ type: Object })
  move_in: Record<string, unknown>;

  @ApiProperty({ type: Object })
  move_out: Record<string, unknown>;

  @ApiProperty({ type: Object, isArray: true })
  differences: Record<string, unknown>[];
}

export class InspectionPhotosResponseDto {
  @ApiProperty({ type: String, isArray: true })
  photos: string[];
}
