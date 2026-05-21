import { IsInt, IsOptional, IsPositive, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignVendorDto {
  @ApiPropertyOptional({
    example: 3,
    description: 'ID del proveedor externo a asignar (excluye técnico interno)',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  vendor_id?: number;

  @ApiPropertyOptional({
    example: 5,
    description: 'ID del técnico interno a asignar (excluye vendor externo)',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  assigned_to?: number;

  @ValidateIf((o: AssignVendorDto) => !o.vendor_id && !o.assigned_to)
  protected _requiresOne: never;
}
