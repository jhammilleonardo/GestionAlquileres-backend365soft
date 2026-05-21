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
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { ContractsService, ContractResult } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { RenewContractDto } from './dto/renew-contract.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ContractStatus } from './enums/contract-status.enum';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';
import type { ContractMetrics } from './contract-queries.service';
import type { ContractPdfResult } from './contract-pdf.service';
import {
  ContractMetricsResponseDto,
  ContractPdfResponseDto,
  ContractResponseDto,
  ContractStatusUpdateDto,
  CurrentContractEmptyResponseDto,
} from './dto/contract-response.dto';

@ApiTags('Contracts - Admin')
@ApiBearerAuth()
@Controller(':slug/admin/contracts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'EMPLEADO')
export class AdminContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Obtener métricas de contratos del tenant' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: ContractMetricsResponseDto })
  @ApiUnauthorizedResponse({ description: 'JWT inválido o ausente' })
  async getDashboard(@Param('slug') slug: string): Promise<ContractMetrics> {
    return this.contractsService.getMetrics(slug);
  }

  @Get()
  @ApiOperation({ summary: 'Listar contratos del tenant como administrador' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiQuery({ name: 'status', enum: ContractStatus, required: false })
  @ApiQuery({ name: 'tenant_id', type: Number, required: false })
  @ApiQuery({ name: 'property_id', type: Number, required: false })
  @ApiOkResponse({ type: ContractResponseDto, isArray: true })
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
  @ApiOperation({ summary: 'Crear contrato manualmente como administrador' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiBody({ type: CreateContractDto })
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiBadRequestResponse({
    description: 'Inquilino, solicitud, propiedad o contrato activo inválido',
  })
  async create(
    @Param('slug') slug: string,
    @Body() createContractDto: CreateContractDto,
    @Req() req: TenantRequest,
  ): Promise<ContractResult> {
    const currentUserId = req.user?.userId || 0;
    return this.contractsService.create(createContractDto, currentUserId, slug);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Actualizar estado de un contrato' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: ContractStatusUpdateDto })
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiBadRequestResponse({ description: 'Transición o estado inválido' })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async updateStatus(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: ContractStatus,
    @Body('reason') reason: string,
    @Req() req: TenantRequest,
  ): Promise<ContractResult> {
    const currentUserId = req.user?.userId || 0;
    return this.contractsService.update(
      id,
      { status, update_reason: reason },
      currentUserId,
      slug,
    );
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Descargar PDF de contrato como administrador' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Archivo PDF o redirección a URL firmada' })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async getPdf(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
    @Res() res: Response,
  ) {
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
  @ApiOperation({ summary: 'Generar u obtener URL del PDF del contrato' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ContractPdfResponseDto })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async getPdfUrl(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
  ): Promise<ContractPdfResult> {
    const tenantSlug = req.tenant?.slug || 'default';
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${String(protocol)}://${String(host)}`;

    return this.contractsService.generatePdf(id, tenantSlug, baseUrl);
  }

  @Post(':id/renew')
  @ApiOperation({ summary: 'Renovar contrato activo o por vencer' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: RenewContractDto })
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiBadRequestResponse({
    description: 'Contrato no renovable o datos inválidos',
  })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async renew(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() renewDto: RenewContractDto,
    @Req() req: TenantRequest,
  ): Promise<ContractResult> {
    const currentUserId = req.user?.userId || 0;
    return this.contractsService.renew(id, renewDto, currentUserId, slug);
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Obtener historial cronológico de renovaciones' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ContractResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async getHistory(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ContractResult[]> {
    return this.contractsService.getContractHistory(id, slug);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar datos de contrato' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateContractDto })
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiBadRequestResponse({ description: 'Payload o transición inválida' })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async update(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateContractDto: UpdateContractDto,
    @Req() req: TenantRequest,
  ): Promise<ContractResult> {
    const currentUserId = req.user?.userId || 0;
    return this.contractsService.update(
      id,
      updateContractDto,
      currentUserId,
      slug,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de contrato como administrador' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ContractResult> {
    return this.contractsService.findOne(id, slug);
  }
}

@ApiTags('Contracts - Tenant')
@ApiBearerAuth()
@ApiExtraModels(ContractResponseDto)
@Controller(':slug/tenant/contracts')
@UseGuards(JwtAuthGuard)
export class TenantContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get('current')
  @ApiOperation({
    summary: 'Obtener contrato activo del inquilino autenticado',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({
    schema: {
      oneOf: [
        { $ref: getSchemaPath(ContractResponseDto) },
        {
          type: 'object',
          required: ['message', 'contract'],
          properties: {
            message: {
              type: 'string',
              example: 'No tienes un contrato activo en este momento',
            },
            contract: {
              type: 'object',
              nullable: true,
              example: null,
            },
          },
        },
      ],
    },
  })
  async findCurrentContract(
    @Param('slug') slug: string,
    @Req() req: TenantRequest,
  ): Promise<ContractResult | CurrentContractEmptyResponseDto> {
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
  @ApiOperation({ summary: 'Listar contratos del inquilino autenticado' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiQuery({ name: 'status', enum: ContractStatus, required: false })
  @ApiOkResponse({ type: ContractResponseDto, isArray: true })
  async findMyContracts(
    @Param('slug') slug: string,
    @Req() req: TenantRequest,
    @Query('status') status?: ContractStatus,
  ): Promise<ContractResult[]> {
    const currentUserId = req.user?.userId || 0;
    return this.contractsService.findAll(
      { tenant_id: currentUserId, status },
      slug,
    );
  }

  @Post(':id/sign')
  @ApiOperation({ summary: 'Firmar contrato como inquilino' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiBadRequestResponse({ description: 'Contrato no está en estado firmable' })
  @ApiForbiddenResponse({ description: 'Contrato pertenece a otro inquilino' })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async sign(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
  ): Promise<ContractResult> {
    const currentUserId = req.user?.userId || 0;
    const ip = req.ip || '0.0.0.0';
    return this.contractsService.signContract(id, currentUserId, ip, slug);
  }

  @Get(':id/pdf')
  @ApiOperation({ summary: 'Descargar PDF propio como inquilino' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Archivo PDF o redirección a URL firmada' })
  @ApiForbiddenResponse({ description: 'Contrato pertenece a otro inquilino' })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async getMyPdf(
    @Param('slug') slug: string,
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
  @ApiOperation({ summary: 'Obtener URL del PDF propio como inquilino' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ContractPdfResponseDto })
  @ApiForbiddenResponse({ description: 'Contrato pertenece a otro inquilino' })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async getMyPdfUrl(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
  ): Promise<ContractPdfResult> {
    const contract = await this.contractsService.findOne(id, req.tenant?.slug);
    if (contract.tenant_id !== req.user?.userId) {
      throw new ForbiddenException('No tienes permiso para ver este contrato');
    }

    const tenantSlug = req.tenant?.slug || 'default';
    const protocol = req.protocol;
    const host = req.get('host');
    const baseUrl = `${protocol}://${host}`;

    return this.contractsService.generatePdf(id, tenantSlug, baseUrl);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de contrato propio' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ContractResponseDto })
  @ApiForbiddenResponse({ description: 'Contrato pertenece a otro inquilino' })
  @ApiNotFoundResponse({ description: 'Contrato no encontrado' })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: TenantRequest,
  ): Promise<ContractResult> {
    const contract = await this.contractsService.findOne(id, slug);
    if (contract.tenant_id !== req.user?.userId) {
      throw new ForbiddenException('No tienes permiso para ver este contrato');
    }
    return contract;
  }
}
