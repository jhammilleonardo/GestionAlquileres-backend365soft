import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Request,
  Query,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  ForbiddenException,
  ParseIntPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  maintenanceMulterConfig,
  stagePhotoMulterConfig,
} from '../common/utils/multer.config';
import { assertUploadedFilesMatchContent } from '../common/utils/upload-content-validation';
import {
  ApiBadRequestResponse,
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { MaintenanceStage } from './enums/maintenance-stage.enum';
import { AssignVendorDto } from './dto/assign-vendor.dto';
import { RateVendorDto } from './dto/rate-vendor.dto';
import { CreateMaintenanceExpenseDto } from './dto/create-maintenance-expense.dto';
import { MaintenanceFiltersDto } from './dto/maintenance-filters.dto';
import {
  MaintenanceActionMessageResponseDto,
  MaintenanceAttachmentResponseDto,
  MaintenanceFileUrlResponseDto,
  MaintenanceMessageResponseDto,
  MaintenanceRequestResponseDto,
  MaintenanceStageHistoryResponseDto,
  MaintenanceStatsResponseDto,
  TenantMaintenanceStatsResponseDto,
} from './dto/maintenance-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { VendorPortalGuard } from '../common/guards/vendor-portal.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';
import { ExpensesService } from '../expenses/expenses.service';
import {
  ExpenseCategoryEnum,
  ExpenseScopeEnum,
} from '../expenses/enums/expense-category.enum';

@ApiTags('Maintenance - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller(':slug/admin/maintenance')
export class AdminMaintenanceController {
  constructor(
    private readonly maintenanceService: MaintenanceService,
    private readonly expensesService: ExpensesService,
  ) {}

  private async assertTechnicianAssignment(
    requestId: number,
    req: TenantRequest,
  ) {
    const request = await this.maintenanceService.findOne(requestId);

    if (
      req.user?.role === 'TECNICO' &&
      request.assigned_to !== req.user.userId
    ) {
      throw new ForbiddenException(
        'Esta solicitud no está asignada a tu cuenta',
      );
    }

    return request;
  }

  @Get()
  @Roles('ADMIN', 'TECNICO')
  @ApiOperation({ summary: 'Obtener todas las solicitudes' })
  @ApiParam({ name: 'slug', description: 'Tenant slug', example: 'mi-empresa' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'request_type', required: false })
  @ApiQuery({ name: 'tenant_id', required: false })
  @ApiQuery({ name: 'property_id', required: false })
  @ApiQuery({ name: 'contract_id', required: false })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'JWT inválido o ausente' })
  @ApiForbiddenResponse({
    description: 'Rol sin permiso para maintenance admin',
  })
  async findAll(
    @Param('slug') _slug: string,
    @Query() filters: MaintenanceFiltersDto,
    @Request() req: TenantRequest,
  ) {
    const scopedFilters =
      req.user?.role === 'TECNICO'
        ? { ...filters, assigned_to: req.user.userId }
        : filters;
    return this.maintenanceService.findAll(scopedFilters);
  }

  @Post(':id/expense')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crear gasto/factura desde una orden de mantenimiento' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CreateMaintenanceExpenseDto })
  async createExpenseFromMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMaintenanceExpenseDto,
    @Request() req: TenantRequest,
  ) {
    const request = await this.maintenanceService.findOne(id);
    const userId = req.user?.userId;
    const expenseScope = request.reservation_id
      ? ExpenseScopeEnum.SHORT_TERM
      : request.contract_id
        ? ExpenseScopeEnum.LONG_TERM
        : ExpenseScopeEnum.GENERAL;

    return this.expensesService.createExpense(
      {
        property_id: request.property_id,
        contract_id: request.contract_id ?? undefined,
        reservation_id: request.reservation_id ?? undefined,
        maintenance_request_id: request.id,
        vendor_id: request.vendor_id ?? undefined,
        category:
          String(request.request_type) === 'CLEANING'
            ? ExpenseCategoryEnum.CLEANING
            : ExpenseCategoryEnum.MAINTENANCE,
        expense_scope: expenseScope,
        responsibility: dto.responsibility,
        payment_status: dto.payment_status,
        amount: dto.amount,
        currency: dto.currency,
        date: dto.date,
        due_date: dto.due_date,
        invoice_number: dto.invoice_number,
        description: dto.description ?? request.title,
        affects_owner_statement: dto.affects_owner_statement,
        notes: `Mantenimiento ${request.ticket_number}`,
      },
      userId,
    );
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de mantenimiento' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: MaintenanceStatsResponseDto })
  async getStats() {
    return this.maintenanceService.getAdminStats();
  }

  @Get('new')
  @ApiOperation({ summary: 'Obtener solicitudes nuevas' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto, isArray: true })
  async getNewRequests() {
    return this.maintenanceService.findAll({ status: 'NEW' });
  }

  @Get('urgent')
  @ApiOperation({ summary: 'Obtener solicitudes urgentes' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto, isArray: true })
  async getUrgentRequests() {
    return this.maintenanceService.findAll({ priority: 'HIGH' });
  }

  @Get('property/:propertyId')
  @ApiOperation({ summary: 'Obtener solicitudes por propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'propertyId', type: Number })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto, isArray: true })
  async findByProperty(
    @Param('slug') _slug: string,
    @Param('propertyId', ParseIntPipe) propertyId: number,
  ) {
    return this.maintenanceService.findAll({ property_id: propertyId });
  }

  @Get('contract/:contractId')
  @ApiOperation({ summary: 'Obtener solicitudes por contrato' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'contractId', type: Number })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto, isArray: true })
  async findByContract(
    @Param('slug') _slug: string,
    @Param('contractId', ParseIntPipe) contractId: number,
  ) {
    return this.maintenanceService.findAll({ contract_id: contractId });
  }

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: 'Obtener solicitudes por inquilino' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'tenantId', type: Number })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto, isArray: true })
  async findByTenant(
    @Param('slug') _slug: string,
    @Param('tenantId', ParseIntPipe) tenantId: number,
  ) {
    return this.maintenanceService.findByTenant(tenantId);
  }

  @Get(':id')
  @Roles('ADMIN', 'TECNICO')
  @ApiOperation({ summary: 'Obtener detalle de una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async findOne(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    return this.assertTechnicianAssignment(id, req);
  }

  @Patch(':id')
  @Roles('ADMIN', 'TECNICO')
  @ApiOperation({ summary: 'Actualizar una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateMaintenanceDto })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async update(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMaintenanceDto: UpdateMaintenanceDto,
    @Request() req: TenantRequest,
  ) {
    await this.assertTechnicianAssignment(id, req);
    return this.maintenanceService.update(id, updateMaintenanceDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceActionMessageResponseDto })
  async remove(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.maintenanceService.remove(id);
    return { message: 'Solicitud eliminada correctamente' };
  }

  @Get(':id/messages')
  @Roles('ADMIN', 'TECNICO')
  @ApiOperation({ summary: 'Obtener mensajes de una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceMessageResponseDto, isArray: true })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async getMessages(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    await this.assertTechnicianAssignment(id, req);
    return this.maintenanceService.getMessages(id);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Roles('ADMIN', 'TECNICO')
  @ApiOperation({ summary: 'Enviar mensaje a una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CreateMessageDto })
  @ApiCreatedResponse({ type: MaintenanceMessageResponseDto })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async addMessage(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() createMessageDto: CreateMessageDto,
    @Request() req: TenantRequest,
  ) {
    await this.assertTechnicianAssignment(id, req);
    return this.maintenanceService.addMessage(
      id,
      createMessageDto,
      req.user!.userId,
    );
  }

  @Post(':id/upload')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Roles('ADMIN', 'TECNICO')
  @ApiOperation({
    summary: 'Subir archivos adjuntos a una solicitud (máx. 3, 10MB c/u)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string', format: 'binary' },
          description: 'Hasta 3 archivos, máximo 10 MB cada uno.',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: MaintenanceAttachmentResponseDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'No se enviaron archivos o archivo inválido',
  })
  @UseInterceptors(FilesInterceptor('files', 3, maintenanceMulterConfig))
  async uploadFiles(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: TenantRequest,
  ) {
    await this.assertTechnicianAssignment(id, req);
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron archivos');
    }
    await assertUploadedFilesMatchContent(files);
    return this.maintenanceService.saveUploadedFiles(
      id,
      files,
      req.user!.userId,
      slug,
    );
  }

  @Get(':id/stage-history')
  @Roles('ADMIN', 'TECNICO')
  @ApiOperation({ summary: 'Historial de etapas de una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceStageHistoryResponseDto, isArray: true })
  async getStageHistory(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    await this.assertTechnicianAssignment(id, req);
    return this.maintenanceService.getStageHistory(id);
  }

  @Patch(':id/stage')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Cambiar etapa (admin — cualquier transición válida)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateStageDto })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto })
  @ApiBadRequestResponse({ description: 'Transición de etapa inválida' })
  async changeStage(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStageDto,
    @Request() req: TenantRequest,
  ) {
    return this.maintenanceService.changeStage(
      id,
      dto.to_stage,
      req.user!.userId,
      dto.notes,
    );
  }

  @Patch(':id/authorize')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Admin autoriza el gasto en nombre del propietario',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceActionMessageResponseDto })
  @ApiBadRequestResponse({ description: 'La orden no puede autorizarse' })
  async authorizeWork(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    await this.maintenanceService.authorizeWork(id, req.user!.userId);
    return { message: 'Trabajo autorizado correctamente' };
  }

  @Patch(':id/assign-vendor')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Asignar proveedor externo o técnico interno a la orden',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: AssignVendorDto })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto })
  @ApiBadRequestResponse({
    description: 'Debe asignarse proveedor externo o técnico interno válido',
  })
  async assignVendor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AssignVendorDto,
  ) {
    return this.maintenanceService.assignVendor(
      id,
      dto.vendor_id ?? null,
      dto.assigned_to ?? null,
    );
  }

  @Post(':id/rate-vendor')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Calificar al proveedor externo al cerrar la orden (1-5)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: RateVendorDto })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto })
  @ApiBadRequestResponse({
    description: 'Rating fuera de rango o solicitud inválida',
  })
  async rateVendor(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RateVendorDto,
    @Request() req: TenantRequest,
  ) {
    return this.maintenanceService.rateVendor(
      id,
      dto.rating,
      dto.comment,
      req.user!.userId,
    );
  }
}

@ApiTags('Maintenance - Tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(':slug/tenant/maintenance')
export class TenantMaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get('my-requests')
  @ApiOperation({ summary: 'Obtener mis solicitudes' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'JWT inválido o ausente' })
  async getMyRequests(
    @Param('slug') _slug: string,
    @Request() req: TenantRequest,
  ) {
    return this.maintenanceService.findByTenant(req.user!.userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener mis estadísticas' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: TenantMaintenanceStatsResponseDto })
  async getStats(@Param('slug') _slug: string, @Request() req: TenantRequest) {
    return this.maintenanceService.getTenantStats(req.user!.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto })
  @ApiForbiddenResponse({
    description: 'La solicitud no pertenece al inquilino',
  })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async findOne(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    const request = await this.maintenanceService.findOne(id);
    // Verificar que la solicitud pertenezca al inquilino
    if (request.tenant_id !== req.user!.userId) {
      throw new ForbiddenException('No tienes permiso para ver esta solicitud');
    }
    return request;
  }

  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Crear una nueva solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiBody({ type: CreateMaintenanceDto })
  @ApiCreatedResponse({ type: MaintenanceRequestResponseDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o sin contrato activo',
  })
  async create(
    @Param('slug') _slug: string,
    @Body() createMaintenanceDto: CreateMaintenanceDto,
    @Request() req: TenantRequest,
  ) {
    // Si contract_id viene en el DTO, se usa; caso contrario se busca contrato activo.
    const assignedTo = 1; // Por defecto al admin con ID 1

    return this.maintenanceService.create(
      createMaintenanceDto,
      req.user!.userId,
      createMaintenanceDto.contract_id,
      assignedTo,
    );
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Obtener mensajes de una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceMessageResponseDto, isArray: true })
  @ApiForbiddenResponse({
    description: 'La solicitud no pertenece al inquilino',
  })
  async getMessages(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    const request = await this.maintenanceService.findOne(id);
    if (request.tenant_id !== req.user!.userId) {
      throw new ForbiddenException('No tienes permiso para ver esta solicitud');
    }
    return this.maintenanceService.getMessages(id, req.user!.userId);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Enviar mensaje a una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CreateMessageDto })
  @ApiCreatedResponse({ type: MaintenanceMessageResponseDto })
  @ApiForbiddenResponse({
    description: 'La solicitud no pertenece al inquilino',
  })
  async addMessage(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() createMessageDto: CreateMessageDto,
    @Request() req: TenantRequest,
  ) {
    const request = await this.maintenanceService.findOne(id);
    if (request.tenant_id !== req.user!.userId) {
      throw new ForbiddenException(
        'No tienes permiso para enviar mensajes en esta solicitud',
      );
    }
    return this.maintenanceService.addMessage(
      id,
      createMessageDto,
      req.user!.userId,
    );
  }

  @Post(':id/upload')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Subir archivos adjuntos a una solicitud (máx. 3, 10MB c/u)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string', format: 'binary' },
          description: 'Hasta 3 archivos, máximo 10 MB cada uno.',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: MaintenanceAttachmentResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'Sin archivos o solicitud ajena' })
  @UseInterceptors(FilesInterceptor('files', 3, maintenanceMulterConfig))
  async uploadFiles(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: TenantRequest,
  ) {
    const request = await this.maintenanceService.findOne(id);
    if (request.tenant_id !== req.user!.userId) {
      throw new BadRequestException(
        'No tienes permiso para subir archivos en esta solicitud',
      );
    }
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron archivos');
    }
    await assertUploadedFilesMatchContent(files);
    return this.maintenanceService.saveUploadedFiles(
      id,
      files,
      req.user!.userId,
      slug,
    );
  }
}

@ApiTags('Maintenance - Técnico')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('TECNICO', 'ADMIN')
@Controller(':slug/tecnico/maintenance')
export class TecnicoMaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  private async assertTechnicianAssignment(
    requestId: number,
    req: TenantRequest,
  ) {
    const request = await this.maintenanceService.findOne(requestId);

    if (
      req.user?.role === 'TECNICO' &&
      request.assigned_to !== req.user.userId
    ) {
      throw new ForbiddenException(
        'Esta solicitud no está asignada a tu cuenta',
      );
    }

    return request;
  }

  @Get()
  @ApiOperation({ summary: 'Solicitudes asignadas al técnico' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'JWT inválido o ausente' })
  @ApiForbiddenResponse({ description: 'Rol distinto de TECNICO/ADMIN' })
  async findAssigned(
    @Param('slug') _slug: string,
    @Request() req: TenantRequest,
  ) {
    return this.maintenanceService.findAll({ assigned_to: req.user!.userId });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una solicitud asignada' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto })
  @ApiNotFoundResponse({ description: 'Solicitud no encontrada' })
  async findOne(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    return this.assertTechnicianAssignment(id, req);
  }

  @Get(':id/stage-history')
  @ApiOperation({ summary: 'Historial de etapas' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceStageHistoryResponseDto, isArray: true })
  async getStageHistory(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    await this.assertTechnicianAssignment(id, req);
    return this.maintenanceService.getStageHistory(id);
  }

  @Patch(':id/stage')
  @ApiOperation({
    summary: 'Avanzar etapa (técnico — solo IN_PROGRESS o COMPLETED)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateStageDto })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto })
  @ApiBadRequestResponse({
    description: 'Técnico solo puede avanzar a IN_PROGRESS o COMPLETED',
  })
  async changeStage(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStageDto,
    @Request() req: TenantRequest,
  ) {
    await this.assertTechnicianAssignment(id, req);
    return this.maintenanceService.changeStageAsTechnician(
      id,
      dto.to_stage,
      req.user!.userId,
      dto.notes,
    );
  }

  @Post(':id/photos')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Subir fotos del trabajo (máx. 5, solo imágenes)' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', format: 'binary' },
          description: 'Hasta 5 imágenes del avance del trabajo.',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: MaintenanceFileUrlResponseDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'No se enviaron fotos o formato inválido',
  })
  @UseInterceptors(FilesInterceptor('files', 5, stagePhotoMulterConfig))
  async uploadStagePhotos(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: TenantRequest,
  ) {
    await this.assertTechnicianAssignment(id, req);
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron fotos');
    }
    await assertUploadedFilesMatchContent(files);
    return this.maintenanceService.saveStagePhotos(
      id,
      files,
      req.user!.userId,
      slug,
    );
  }
}

@ApiTags('Maintenance - Proveedor')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, VendorPortalGuard)
@Controller(':slug/vendor/maintenance')
export class VendorMaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  /**
   * Verifica que la orden pertenezca al proveedor autenticado.
   * El portal del proveedor solo opera sobre sus propias órdenes.
   */
  private async assertOwnership(
    requestId: number,
    vendorId: number,
  ): Promise<void> {
    const request = await this.maintenanceService.findOne(requestId);
    if (request.vendor_id !== vendorId) {
      throw new ForbiddenException('Esta orden no está asignada a tu cuenta');
    }
  }

  @Get()
  @ApiOperation({ summary: 'Órdenes asignadas al proveedor' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto, isArray: true })
  @ApiForbiddenResponse({ description: 'Rol distinto de VENDOR' })
  async findAssigned(
    @Param('slug') _slug: string,
    @Request() req: TenantRequest,
  ) {
    return this.maintenanceService.findAll({ vendor_id: req.user!.vendorId! });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una orden asignada al proveedor' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto })
  @ApiNotFoundResponse({ description: 'Orden no encontrada' })
  async findOne(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    await this.assertOwnership(id, req.user!.vendorId!);
    return this.maintenanceService.findOne(id);
  }

  @Get(':id/stage-history')
  @ApiOperation({ summary: 'Historial de etapas de la orden' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceStageHistoryResponseDto, isArray: true })
  async getStageHistory(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    await this.assertOwnership(id, req.user!.vendorId!);
    return this.maintenanceService.getStageHistory(id);
  }

  @Patch(':id/stage')
  @ApiOperation({
    summary: 'Avanzar etapa (proveedor — solo IN_PROGRESS o COMPLETED)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateStageDto })
  @ApiOkResponse({ type: MaintenanceRequestResponseDto })
  @ApiBadRequestResponse({
    description: 'Solo se puede avanzar a IN_PROGRESS o COMPLETED',
  })
  async changeStage(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStageDto,
    @Request() req: TenantRequest,
  ) {
    await this.assertOwnership(id, req.user!.vendorId!);
    // El proveedor avanza el ESTADO de la orden (NEW→IN_PROGRESS→COMPLETED),
    // igual que el técnico, en vez del pipeline granular de etapas.
    if (
      dto.to_stage !== MaintenanceStage.IN_PROGRESS &&
      dto.to_stage !== MaintenanceStage.COMPLETED
    ) {
      throw new BadRequestException(
        'Solo se puede avanzar a IN_PROGRESS o COMPLETED',
      );
    }
    return this.maintenanceService.update(id, {
      status: dto.to_stage as 'IN_PROGRESS' | 'COMPLETED',
    });
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Mensajes de la orden' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: MaintenanceMessageResponseDto, isArray: true })
  async getMessages(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    await this.assertOwnership(id, req.user!.vendorId!);
    return this.maintenanceService.getMessages(id, req.user!.userId);
  }

  @Post(':id/messages')
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @ApiOperation({ summary: 'Agregar un mensaje/nota a la orden' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CreateMessageDto })
  @ApiCreatedResponse({ type: MaintenanceMessageResponseDto })
  async addMessage(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateMessageDto,
    @Request() req: TenantRequest,
  ) {
    await this.assertOwnership(id, req.user!.vendorId!);
    return this.maintenanceService.addMessage(id, dto, req.user!.userId);
  }

  @Post(':id/upload')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Subir archivos adjuntos para un mensaje del chat' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string', format: 'binary' },
        },
      },
    },
  })
  @ApiCreatedResponse({ type: MaintenanceAttachmentResponseDto, isArray: true })
  @ApiBadRequestResponse({ description: 'No se enviaron archivos' })
  @UseInterceptors(FilesInterceptor('files', 3, maintenanceMulterConfig))
  async uploadFiles(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: TenantRequest,
  ) {
    await this.assertOwnership(id, req.user!.vendorId!);
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron archivos');
    }
    await assertUploadedFilesMatchContent(files);
    return this.maintenanceService.saveUploadedFiles(
      id,
      files,
      req.user!.userId,
      slug,
    );
  }

  @Post(':id/photos')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Subir fotos del trabajo (máx. 5, solo imágenes)' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['files'],
      properties: {
        files: {
          type: 'array',
          maxItems: 5,
          items: { type: 'string', format: 'binary' },
          description: 'Hasta 5 imágenes del avance del trabajo.',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: MaintenanceFileUrlResponseDto, isArray: true })
  @ApiBadRequestResponse({
    description: 'No se enviaron fotos o formato inválido',
  })
  @UseInterceptors(FilesInterceptor('files', 5, stagePhotoMulterConfig))
  async uploadStagePhotos(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: TenantRequest,
  ) {
    await this.assertOwnership(id, req.user!.vendorId!);
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron fotos');
    }
    await assertUploadedFilesMatchContent(files);
    return this.maintenanceService.saveStagePhotos(
      id,
      files,
      req.user!.userId,
      slug,
    );
  }
}
