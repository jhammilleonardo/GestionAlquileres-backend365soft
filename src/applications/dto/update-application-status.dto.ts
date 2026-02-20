import { IsEnum, IsString, IsOptional } from 'class-validator';
import { ApplicationStatus } from '../enums/application-status.enum';

export class UpdateApplicationStatusDto {
  @IsEnum(ApplicationStatus)
  status: ApplicationStatus;

  @IsOptional()
  @IsString()
  admin_feedback?: string;
}
