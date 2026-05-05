import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  Req,
  Res,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiParam, ApiBearerAuth } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  ContractsService,
  ContractResult,
  ContractPdfResult,
} from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ContractStatus } from './enums/contract-status.enum';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';

@ApiTags('Contracts - Admin')
@ApiBearerAuth()
@Controller(':slug/admin/contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'EMPLEADO')
export class AdminContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get('dashboard')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getDashboard(@Param('slug') slug: string) {
    return this.contractsService.getMetrics(slug);
  }

  @Get()
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async findAll(
    @Param('slug') slug: string,
    @Query('status') status?: ContractStatus,
    @Query('tenant_id') tenant_id?: string,
    @Query('property_id') property_id?: string,
  ): Promise<ContractResult[]> {
    const parsedTenantId = tenant_id ? parseInt(tenant_id, 10) : undefined;
    const parsedPropertyId = property_id
      ? parseInt(property_id, 10)
      : undefined;
    return this.contractsService.findAll(
      {
        status,
        tenant_id: parsedTenantId,
        property_id: parsedPropertyId,
      },
      slug,
    );
  }

  @Post()
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async create(
    @Param('slug') slug: string,
    @Body() createContractDto: CreateContractDto,
    @Req() req: TenantRequest,
  ): Promise<ContractResult> {
    const currentUserId = req.user?.userId || 0;
    return this.contractsService.create(createContractDto, currentUserId, slug);
  }

  @Patch(':id/status')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async updateStatus(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: ContractStatus,
    @Body('reason') reason: string,
    @Req() req: TenantRequest,
  ) {
    const currentUserId = req.user?.userId || 0;
    return this.contractsService.update(
      id,
      { status, update_reason: reason },
      currentUserId,
      slug,
    );
  }

  @Get(':id/pdf')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async getPdf(
    @Param() slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
    @Res() res: Response,
  ) {
    const tenantSlug = req.tenant?.slug || 'default';
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const result = (await this.contractsService.generatePdf(
      id,
      tenantSlug,
      baseUrl,
    )) as ContractPdfResult;
    if (result.path) {
      res.download(result.path);
      return;
    }
    res.redirect(result.fullUrl);
  }

  @Get(':id/pdf-url')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async getPdfUrl(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
  ) {
    const tenantSlug = req.tenant?.slug || 'default';
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${String(protocol)}://${String(host)}`;

    return this.contractsService.generatePdf(id, tenantSlug, baseUrl);
  }

  @Post(':id/renew')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async renew(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() renewDto: RenewContractDto,
    @Req() req: TenantRequest,
  ) {
    const currentUserId = req.user?.userId || 0;
    return this.contractsService.renew(id, renewDto, currentUserId, slug);
  }

  @Get(':id/history')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async getHistory(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ContractResult[]> {
    return this.contractsService.getContractHistory(id, slug);
  }

  @Patch(':id')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateContractDto: UpdateContractDto,
    @Req() req: TenantRequest,
  ) {
    const currentUserId = req.user?.userId || 0;
    return this.contractsService.update(id, updateContractDto, currentUserId, slug);
  }

  @Get(':id')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.contractsService.findOne(id, slug);
  }
}

@ApiTags('Contracts - Tenant')
@ApiBearerAuth()
@Controller(':slug/tenant/contracts')
@UseGuards(JwtAuthGuard)
export class TenantContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get('current')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async findCurrentContract(
    @Param('slug') slug: string,
    @Req() req: TenantRequest,
  ) {
    const currentUserId = req.user?.userId || 0;
    const contracts = await this.contractsService.findAll(
      {
        tenant_id: currentUserId,
        status: ContractStatus.ACTIVO,
      },
      slug,
    );

    if (contracts.length === 0) {
      return {
        message: 'No tienes un contrato activo en este momento',
        contract: null,
      };
    }

    return contracts[0];
  }

  @Get()
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async findMyContracts(
    @Param('slug') slug: string,
    @Req() req: TenantRequest,
    @Query('status') status?: ContractStatus,
  ) {
    const currentUserId = req.user?.userId || 0;
    return this.contractsService.findAll(
      { tenant_id: currentUserId, status },
      slug,
    );
  }

  @Post(':id/sign')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async sign(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
  ) {
    const currentUserId = req.user?.userId || 0;
    const ip = req.ip || '0.0.0.0';
    return this.contractsService.signContract(id, currentUserId, ip, slug);
  }

  @Get(':id/pdf')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async getMyPdf(
    @Param() slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
    @Res() res: Response,
  ) {
    const contract = await this.contractsService.findOne(id, req.tenant?.slug);
    if (contract.tenant_id !== req.user?.userId) {
      throw new ForbiddenException('No tienes permiso para ver este contrato');
    }

    const tenantSlug = req.tenant?.slug || 'default';
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    const result = await this.contractsService.generatePdf(
      id,
      tenantSlug,
      baseUrl,
    );
    if (result.path) {
      res.download(result.path);
      return;
    }
    res.redirect(result.fullUrl);
  }

  @Get(':id/pdf-url')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async getMyPdfUrl(
    @Param() slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
  ) {
    const contract = await this.contractsService.findOne(id, req.tenant?.slug);
    if (contract.tenant_id !== req.user?.userId) {
      throw new ForbiddenException('No tienes permiso para ver este contrato');
    }

    const tenantSlug = req.tenant?.slug || 'default';
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    return await this.contractsService.generatePdf(id, tenantSlug, baseUrl);
  }

  @Get(':id')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
  ) {
    const contract = await this.contractsService.findOne(id, slug);
    if (contract.tenant_id !== req.user?.userId) {
      throw new ForbiddenException('No tienes permiso para ver este contrato');
    }
    return contract;
  }
}
