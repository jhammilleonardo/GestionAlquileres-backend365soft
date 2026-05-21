import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApplicationStatus } from '../enums/application-status.enum';

export class UpdateApplicationStatusDto {
  @ApiProperty({
    enum: ApplicationStatus,
    example: ApplicationStatus.EN_REVISION,
  })
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;

  @ApiPropertyOptional({ example: 'Documentación recibida, pasa a revisión.' })
  @IsOptional()
  @IsString()
  admin_feedback?: string;
}
