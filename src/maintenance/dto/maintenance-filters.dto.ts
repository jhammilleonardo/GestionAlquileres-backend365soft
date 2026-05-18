import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsPositive } from 'class-validator';

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
  @IsEnum(MAINTENANCE_STATUSES)
  @IsOptional()
  status?: MaintenanceStatus;

  @IsEnum(MAINTENANCE_PRIORITIES)
  @IsOptional()
  priority?: MaintenancePriority;

  @IsEnum(MAINTENANCE_REQUEST_TYPES)
  @IsOptional()
  request_type?: MaintenanceRequestType;

  @IsInt()
  @IsPositive()
  @Type(() => Number)
  @IsOptional()
  tenant_id?: number;

  @IsInt()
  @IsPositive()
  @Type(() => Number)
  @IsOptional()
  property_id?: number;

  @IsInt()
  @IsPositive()
  @Type(() => Number)
  @IsOptional()
  contract_id?: number;

  @IsInt()
  @IsPositive()
  @Type(() => Number)
  @IsOptional()
  assigned_to?: number;
}
