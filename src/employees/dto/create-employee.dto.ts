import {
  IsEmail,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  MinLength,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export const AVAILABLE_MODULES = [
  'properties',
  'units',
  'users',
  'contracts',
  'payments',
  'maintenance',
  'reports',
  'config',
  'employees',
  'owners',
  'inspections',
  'violations',
  'expenses',
  'vendors',
  'messages',
  'reservations',
] as const;

export type AvailableModule = (typeof AVAILABLE_MODULES)[number];

export class ModulePermissionsDto {
  @ApiProperty({
    description: 'Nombre del módulo',
    enum: AVAILABLE_MODULES,
    example: 'properties',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(AVAILABLE_MODULES)
  module: AvailableModule;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  can_view?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  can_create?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  can_edit?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  can_delete?: boolean;
}

export class CreateEmployeeDto {
  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'juan.perez@empresa.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Contraseña123', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({ example: '+591 70000000' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Permisos iniciales por módulo',
    type: [ModulePermissionsDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModulePermissionsDto)
  @IsOptional()
  permissions?: ModulePermissionsDto[];
}
