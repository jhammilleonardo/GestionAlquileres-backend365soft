import { Module } from '@nestjs/common';
import { ContractTemplatesService } from './contract-templates.service';
import { ContractTemplatesController } from './contract-templates.controller';

@Module({
  controllers: [ContractTemplatesController],
  providers: [ContractTemplatesService],
  exports: [ContractTemplatesService],
})
export class ContractTemplatesModule {}
