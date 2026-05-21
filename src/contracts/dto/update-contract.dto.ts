import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CreateContractDto } from './create-contract.dto';
import { IsOptional, IsEnum, IsString } from 'class-validator';
import { ContractStatus } from '../enums/contract-status.enum';

export class UpdateContractDto extends PartialType(CreateContractDto) {
  @ApiPropertyOptional({
    enum: ContractStatus,
    example: ContractStatus.ACTIVO,
  })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;

  @ApiPropertyOptional({
    example: 'Actualización solicitada por administración.',
  })
  @IsOptional()
  @IsString()
  update_reason?: string;
}
