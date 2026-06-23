import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import {
  ContractTemplatesService,
  ContractTemplateRow,
} from './contract-templates.service';
import { CreateContractTemplateDto } from './dto/create-contract-template.dto';
import { UpdateContractTemplateDto } from './dto/update-contract-template.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@ApiTags('Contract Templates')
@ApiBearerAuth()
@Controller(':slug/admin/contract-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContractTemplatesController {
  constructor(
    private readonly contractTemplatesService: ContractTemplatesService,
  ) {}

  @Post()
  @RequirePermission('contracts', 'create')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  create(@Body() dto: CreateContractTemplateDto): Promise<ContractTemplateRow> {
    return this.contractTemplatesService.create(dto);
  }

  @Get()
  @RequirePermission('contracts', 'view')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  findAll(
    @Query('language') language?: string,
  ): Promise<ContractTemplateRow[]> {
    return this.contractTemplatesService.findAll(language);
  }

  @Get(':id')
  @RequirePermission('contracts', 'view')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<ContractTemplateRow> {
    return this.contractTemplatesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('contracts', 'edit')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateContractTemplateDto,
  ): Promise<ContractTemplateRow> {
    return this.contractTemplatesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('contracts', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.contractTemplatesService.remove(id);
  }
}
