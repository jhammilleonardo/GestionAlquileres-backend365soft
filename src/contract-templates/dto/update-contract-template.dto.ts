import { PartialType } from '@nestjs/mapped-types';
import { CreateContractTemplateDto } from './create-contract-template.dto';

export class UpdateContractTemplateDto extends PartialType(
  CreateContractTemplateDto,
) {}
