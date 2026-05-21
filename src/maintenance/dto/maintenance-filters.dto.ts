import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const MAINTENANCE_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'COMPLETED',
  'DEFERRED',
  'CLOSED',
] as const;

export const MAINTENANCE_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;
export const MAINTENANCE_REQUEST_TYPES = ['MAINTENANCE', 'GENERAL'] as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];
export type MaintenanceRequestType = (typeof MAINTENANCE_REQUEST_TYPES)[number];

export class MaintenanceFiltersDto {
  @ApiPropertyOptional({ enum: MAINTENANCE_STATUSES, example: 'NEW' })
  @IsEnum(MAINTENANCE_STATUSES)
  @IsOptional()
  status?: MaintenanceStatus;

  @ApiPropertyOptional({ enum: MAINTENANCE_PRIORITIES, example: 'HIGH' })
  @IsEnum(MAINTENANCE_PRIORITIES)
  @IsOptional()
  priority?: MaintenancePriority;

  @ApiPropertyOptional({
    enum: MAINTENANCE_REQUEST_TYPES,
    example: 'MAINTENANCE',
  })
  @IsEnum(MAINTENANCE_REQUEST_TYPES)
  @IsOptional()
  request_type?: MaintenanceRequestType;

  @ApiPropertyOptional({ example: 7, type: Number })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  @IsOptional()
  tenant_id?: number;

  @ApiPropertyOptional({ example: 12, type: Number })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  @IsOptional()
  property_id?: number;

  @ApiPropertyOptional({ example: 22, type: Number })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  @IsOptional()
  contract_id?: number;

  @ApiPropertyOptional({ example: 5, type: Number })
  @IsInt()
  @IsPositive()
  @Type(() => Number)
  @IsOptional()
  assigned_to?: number;
}
