import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { ModulePermissionsDto } from './create-employee.dto';

export class UpdatePermissionsDto {
  @ApiProperty({
    description: 'Lista de permisos por módulo',
    type: [ModulePermissionsDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModulePermissionsDto)
  permissions: ModulePermissionsDto[];
}
