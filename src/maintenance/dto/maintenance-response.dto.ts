import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_REQUEST_TYPES,
  MAINTENANCE_STATUSES,
} from './maintenance-filters.dto';
import { MaintenanceStage } from '../enums/maintenance-stage.enum';

export class MaintenancePropertySummaryDto {
  @ApiProperty({ example: 12 })
  id: number;

  @ApiProperty({ example: 'Casa Central' })
  title: string;
}

export class MaintenanceContractSummaryDto {
  @ApiProperty({ example: 22 })
  id: number;

  @ApiProperty({ example: 'CTR-2026-0001' })
  contract_number: string;
}

export class MaintenanceTenantSummaryDto {
  @ApiProperty({ example: 7 })
  id: number;

  @ApiProperty({ example: 'Luis Rojas' })
  name: string;

  @ApiProperty({ example: 'luis@example.com' })
  email: string;

  @ApiPropertyOptional({ example: '+59171111111', nullable: true })
  phone: string | null;
}

export class MaintenanceAttachmentResponseDto {
  @ApiProperty({ example: 4 })
  id: number;

  @ApiPropertyOptional({ example: 10 })
  maintenance_request_id?: number;

  @ApiPropertyOptional({ example: 5, nullable: true })
  message_id?: number | null;

  @ApiProperty({ example: 'maintenance/mi-empresa/archivo.jpg' })
  file_url: string;

  @ApiProperty({ example: 'archivo.jpg' })
  file_name: string;

  @ApiProperty({ example: 'image/jpeg' })
  file_type: string;

  @ApiPropertyOptional({ example: 284928 })
  file_size?: number;

  @ApiPropertyOptional({ example: 7 })
  uploaded_by?: number;

  @ApiPropertyOptional({ example: '2026-05-20T15:30:00.000Z' })
  created_at?: Date | string;
}

export class MaintenanceMessageResponseDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ example: 10 })
  maintenance_request_id: number;

  @ApiProperty({ example: 7 })
  user_id: number;

  @ApiProperty({ example: 'El técnico llegará mañana por la tarde.' })
  message: string;

  @ApiProperty({ example: true })
  send_to_resident: boolean;

  @ApiProperty({ type: () => MaintenanceAttachmentResponseDto, isArray: true })
  attachments: MaintenanceAttachmentResponseDto[];

  @ApiPropertyOptional({ example: '2026-05-20T15:30:00.000Z' })
  created_at?: Date | string;
}

export class MaintenanceRequestResponseDto {
  @ApiProperty({ example: 10 })
  id: number;

  @ApiProperty({ example: 'MNT-2026-0010' })
  ticket_number: string;

  @ApiProperty({ enum: MAINTENANCE_REQUEST_TYPES, example: 'MAINTENANCE' })
  request_type: string;

  @ApiPropertyOptional({ example: 'PLOMERIA', nullable: true })
  category: string | null;

  @ApiProperty({ example: 'Fuga en el baño principal' })
  title: string;

  @ApiProperty({ example: 'Hay una fuga en el lavamanos del baño principal.' })
  description: string;

  @ApiProperty({ example: 'YES' })
  permission_to_enter: string;

  @ApiProperty({ example: false })
  has_pets: boolean;

  @ApiPropertyOptional({
    example: 'La llave está en portería.',
    nullable: true,
  })
  entry_notes: string | null;

  @ApiProperty({ enum: MAINTENANCE_STATUSES, example: 'NEW' })
  status: string;

  @ApiProperty({ enum: MAINTENANCE_PRIORITIES, example: 'NORMAL' })
  priority: string;

  @ApiPropertyOptional({ example: '2026-05-25', nullable: true })
  due_date: Date | string | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  assigned_to: number | null;

  @ApiPropertyOptional({ example: 3, nullable: true })
  vendor_id: number | null;

  @ApiProperty({ example: 7 })
  tenant_id: number;

  @ApiProperty({ example: 22 })
  contract_id: number;

  @ApiProperty({ example: 12 })
  property_id: number;

  @ApiProperty({ enum: MaintenanceStage, example: MaintenanceStage.REPORTED })
  current_stage: MaintenanceStage | string;

  @ApiProperty({ example: false })
  owner_authorized: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  completed_at: Date | string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  vendor_rating: number | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  vendor_rating_comment: string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  vendor_rated_at: Date | string | null;

  @ApiPropertyOptional({ example: null, nullable: true })
  vendor_rated_by: number | null;

  @ApiPropertyOptional({
    type: () => MaintenancePropertySummaryDto,
    nullable: true,
  })
  property?: MaintenancePropertySummaryDto | null;

  @ApiPropertyOptional({
    type: () => MaintenanceContractSummaryDto,
    nullable: true,
  })
  contract?: MaintenanceContractSummaryDto | null;

  @ApiPropertyOptional({
    type: () => MaintenanceTenantSummaryDto,
    nullable: true,
  })
  tenant?: MaintenanceTenantSummaryDto | null;

  @ApiPropertyOptional({
    type: () => MaintenanceMessageResponseDto,
    isArray: true,
  })
  messages?: MaintenanceMessageResponseDto[];

  @ApiPropertyOptional({
    type: () => MaintenanceAttachmentResponseDto,
    isArray: true,
  })
  attachments?: MaintenanceAttachmentResponseDto[];
}

export class MaintenanceStageHistoryResponseDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ example: 10 })
  request_id: number;

  @ApiPropertyOptional({ example: MaintenanceStage.REPORTED, nullable: true })
  from_stage: string | null;

  @ApiProperty({ enum: MaintenanceStage, example: MaintenanceStage.ASSIGNED })
  to_stage: string;

  @ApiProperty({ example: 1 })
  changed_by_user_id: number;

  @ApiPropertyOptional({ example: 'Ana Perez', nullable: true })
  changed_by_name?: string | null;

  @ApiPropertyOptional({
    example: 'Asignado a técnico interno',
    nullable: true,
  })
  notes?: string | null;

  @ApiProperty({ type: String, isArray: true, example: [] })
  photos: string[];

  @ApiPropertyOptional({ example: '2026-05-20T15:30:00.000Z' })
  created_at?: Date | string;
}

export class MaintenanceStatsResponseDto {
  @ApiProperty({ example: 24 })
  total: number;

  @ApiProperty({ example: { NEW: 4, IN_PROGRESS: 8, COMPLETED: 12 } })
  byStatus: Record<string, number>;

  @ApiProperty({ example: { LOW: 3, NORMAL: 15, HIGH: 6 } })
  byPriority: Record<string, number>;

  @ApiProperty({ example: 4 })
  newRequests: number;

  @ApiProperty({ example: 2 })
  urgentRequests: number;
}

export class TenantMaintenanceStatsResponseDto {
  @ApiProperty({ example: 5 })
  total: number;

  @ApiProperty({ example: 2 })
  active: number;

  @ApiProperty({ example: 3 })
  completed: number;
}

export class MaintenanceFileUrlResponseDto {
  @ApiProperty({ example: 'maintenance/mi-empresa/foto.jpg' })
  file_url: string;
}

export class MaintenanceActionMessageResponseDto {
  @ApiProperty({ example: 'Solicitud eliminada correctamente' })
  message: string;
}
