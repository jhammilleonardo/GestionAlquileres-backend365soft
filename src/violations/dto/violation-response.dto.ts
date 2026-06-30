import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ViolationStatusEnum } from '../enums/violation-status.enum';
import { ViolationSeverityEnum } from '../enums/violation-severity.enum';
import { ViolationFineStatusEnum } from '../enums/violation-fine-status.enum';
import { ViolationEventTypeEnum } from '../enums/violation-event-type.enum';

export class ViolationEventDto {
  @ApiProperty({ example: 5 })
  id: number;

  @ApiProperty({ enum: ViolationEventTypeEnum })
  event_type: ViolationEventTypeEnum;

  @ApiPropertyOptional({ example: 'Se envió aviso formal.', nullable: true })
  note: string | null;

  @ApiProperty({ type: Object, example: { from: 'open', to: 'notified' } })
  metadata: Record<string, unknown>;

  @ApiPropertyOptional({ example: 3, nullable: true })
  created_by: number | null;

  @ApiPropertyOptional({ example: 'Ana Pérez', nullable: true })
  created_by_name: string | null;

  @ApiProperty({ example: '2026-06-26T18:00:00.000Z' })
  created_at: string;
}

export class ViolationResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiPropertyOptional({ example: 7, nullable: true })
  unit_id: number | null;

  @ApiProperty({ example: 12 })
  tenant_id: number;

  @ApiProperty({ example: 'noise' })
  type: string;

  @ApiProperty({ enum: ViolationSeverityEnum })
  severity: ViolationSeverityEnum;

  @ApiProperty({ example: 'Ruido excesivo después de medianoche.' })
  description: string;

  @ApiProperty({ enum: ViolationStatusEnum })
  status: ViolationStatusEnum;

  @ApiPropertyOptional({ example: '2026-07-05', nullable: true })
  due_date: string | null;

  @ApiProperty({ type: String, isArray: true })
  evidence_photos: string[];

  @ApiPropertyOptional({ example: 150.0, nullable: true })
  fine_amount: number | null;

  @ApiPropertyOptional({ example: 'BOB', nullable: true })
  fine_currency: string | null;

  @ApiProperty({ enum: ViolationFineStatusEnum })
  fine_status: ViolationFineStatusEnum;

  @ApiPropertyOptional({ example: '2026-06-30T12:00:00.000Z', nullable: true })
  fine_paid_at: string | null;

  @ApiPropertyOptional({ example: '2026-06-26T18:00:00.000Z', nullable: true })
  notice_sent_at: string | null;

  @ApiProperty({ example: '2026-06-26T17:00:00.000Z' })
  created_at: string;

  @ApiPropertyOptional({ example: '2026-07-02T10:00:00.000Z', nullable: true })
  resolved_at: string | null;

  @ApiPropertyOptional({ nullable: true })
  resolved_notes: string | null;

  @ApiProperty({ example: 'Departamento Centro' })
  property_title: string;

  @ApiProperty({ example: 'Luis Rojas' })
  tenant_name: string;

  @ApiProperty({ example: 'luis@example.com' })
  tenant_email: string;

  @ApiPropertyOptional({ example: 'A-101', nullable: true })
  unit_number: string | null;

  @ApiPropertyOptional({ type: ViolationEventDto, isArray: true })
  events?: ViolationEventDto[];
}

export class PaginatedViolationsResponseDto {
  @ApiProperty({ type: ViolationResponseDto, isArray: true })
  data: ViolationResponseDto[];

  @ApiProperty({ example: 20 })
  total: number;
}

export class ViolationStatsResponseDto {
  @ApiProperty({ example: 12 })
  total: number;

  @ApiProperty({ example: 4 })
  open: number;

  @ApiProperty({ example: 2 })
  overdue: number;

  @ApiProperty({ example: 3 })
  escalated: number;

  @ApiProperty({ example: 450.0 })
  fines_outstanding: number;
}

export class ViolationMessageResponseDto {
  @ApiProperty({ example: 'Notificación enviada al inquilino correctamente.' })
  message: string;
}
