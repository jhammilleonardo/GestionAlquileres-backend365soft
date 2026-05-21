import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '../enums/application-status.enum';
import { ScreeningFinalStatus } from '../enums/screening-final-status.enum';

export class BlacklistAlertResponseDto {
  @ApiProperty({ example: true })
  is_blacklisted: boolean;

  @ApiPropertyOptional({ example: 'Incumplimiento grave de contrato' })
  reason?: string;

  @ApiPropertyOptional({ example: 'Empresa Demo' })
  reported_by?: string;

  @ApiPropertyOptional({ example: 'Documento encontrado en blacklist' })
  message?: string;
}

export class ApplicationDocumentResponseDto {
  @ApiProperty({ example: 'carnet_anverso' })
  type: string;

  @ApiProperty({ example: '/storage/applications/mi-empresa/1/carnet.jpg' })
  url: string;

  @ApiProperty({ example: 'carnet.jpg' })
  name: string;
}

export class RentalApplicationResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 12 })
  property_id: number;

  @ApiProperty({ example: 7 })
  applicant_id: number;

  @ApiProperty({
    enum: ApplicationStatus,
    example: ApplicationStatus.PENDIENTE,
  })
  status: ApplicationStatus;

  @ApiProperty({ type: Object })
  personal_data: Record<string, unknown>;

  @ApiProperty({ type: Object })
  employment_data: Record<string, unknown>;

  @ApiProperty({ type: Object })
  rental_history: Record<string, unknown>;

  @ApiProperty({ type: Object })
  references: Record<string, unknown>;

  @ApiProperty({ type: Object })
  documents: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'Necesito mudarme en junio.' })
  additional_notes?: string;

  @ApiPropertyOptional({ example: 'Solicitud aprobada tras revisión.' })
  admin_feedback?: string;

  @ApiProperty({ example: '2026-05-20T15:30:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-05-20T15:30:00.000Z' })
  updated_at: Date;

  @ApiPropertyOptional({ example: 'Casa Central' })
  property_title?: string;

  @ApiPropertyOptional({ example: 'Luis Rojas' })
  applicant_name?: string;

  @ApiPropertyOptional({ example: 'luis@example.com' })
  applicant_email?: string;

  @ApiPropertyOptional({ type: () => BlacklistAlertResponseDto })
  blacklist_alert?: BlacklistAlertResponseDto;
}

export class GeneratedApplicationContractDto {
  @ApiProperty({ example: 44 })
  id: number;

  @ApiProperty({ example: 'CTR-2026-0001' })
  number: string;

  @ApiProperty({ example: 'BORRADOR' })
  status: string;

  @ApiProperty({ example: 3000 })
  monthly_rent: number;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ example: 3000 })
  deposit_amount: number;

  @ApiProperty({
    example:
      'Se ha creado un borrador de contrato automáticamente. El inquilino podrá firmarlo desde su portal.',
  })
  message: string;
}

export class ApprovedApplicationSummaryDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ enum: ApplicationStatus, example: ApplicationStatus.APROBADA })
  status: string;

  @ApiPropertyOptional({ example: 'Casa Central' })
  property?: string;

  @ApiPropertyOptional({ example: 'Luis Rojas' })
  applicant?: string;
}

export class ApplicationApprovalResponseDto {
  @ApiProperty({ example: 'Solicitud aprobada y contrato creado con éxito' })
  message: string;

  @ApiProperty({ type: () => ApprovedApplicationSummaryDto })
  application: ApprovedApplicationSummaryDto;

  @ApiProperty({ type: () => GeneratedApplicationContractDto })
  contract_generated: GeneratedApplicationContractDto;
}

export class ApplicationDocumentsUploadResponseDto {
  @ApiProperty({ example: 'Documentos subidos correctamente' })
  message: string;

  @ApiProperty({ type: () => ApplicationDocumentResponseDto, isArray: true })
  documents: ApplicationDocumentResponseDto[];
}

export class ScreeningChecklistResponseDto {
  @ApiProperty({ example: 3 })
  id: number;

  @ApiProperty({ example: 1 })
  application_id: number;

  @ApiProperty({ example: true })
  documents_verified: boolean;

  @ApiPropertyOptional({ example: 'RRHH Empresa', nullable: true })
  employer_call_name: string | null;

  @ApiPropertyOptional({ example: '+59170000000', nullable: true })
  employer_call_phone: string | null;

  @ApiPropertyOptional({ example: 'Ingresos verificados', nullable: true })
  employer_call_result: string | null;

  @ApiPropertyOptional({ example: 'Ana Perez', nullable: true })
  previous_landlord_name: string | null;

  @ApiPropertyOptional({ example: '+59171111111', nullable: true })
  previous_landlord_phone: string | null;

  @ApiPropertyOptional({ example: 'Buen historial', nullable: true })
  previous_landlord_result: string | null;

  @ApiProperty({ example: true })
  blacklist_checked: boolean;

  @ApiPropertyOptional({ example: 'Sin registros', nullable: true })
  blacklist_result: string | null;

  @ApiPropertyOptional({ example: 'Documentación completa', nullable: true })
  notes: string | null;

  @ApiPropertyOptional({ enum: ScreeningFinalStatus, nullable: true })
  final_status: ScreeningFinalStatus | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  reviewed_by: number | null;

  @ApiPropertyOptional({ example: '2026-05-20T15:30:00.000Z', nullable: true })
  reviewed_at: Date | null;

  @ApiProperty({ example: '2026-05-20T15:30:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-05-20T15:30:00.000Z' })
  updated_at: Date;
}

export class ApplicationScreeningResponseDto {
  @ApiProperty({ example: 'Checklist de screening actualizado' })
  message: string;

  @ApiProperty({ type: () => ScreeningChecklistResponseDto })
  screening: ScreeningChecklistResponseDto;

  @ApiPropertyOptional({ type: Object })
  contract?: Record<string, unknown>;
}

export class ApplicationMessageResponseDto {
  @ApiProperty({ example: 'Pago de screening registrado' })
  message: string;
}
