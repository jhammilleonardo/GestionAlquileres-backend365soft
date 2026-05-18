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
import {
  maintenanceMulterConfig,
  stagePhotoMulterConfig,
} from '../common/utils/multer.config';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { MaintenanceService } from './maintenance.service';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { UpdateStageDto } from './dto/update-stage.dto';
import { AssignVendorDto } from './dto/assign-vendor.dto';
import { RateVendorDto } from './dto/rate-vendor.dto';
import { MaintenanceFiltersDto } from './dto/maintenance-filters.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';

@ApiTags('Maintenance - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller(':slug/admin/maintenance')
export class AdminMaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

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
  async findAll(
    @Param('slug') _slug: string,
    @Query() filters: MaintenanceFiltersDto,
  ) {
    return this.maintenanceService.findAll(filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de mantenimiento' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getStats() {
    return this.maintenanceService.getAdminStats();
  }

  @Get('new')
  @ApiOperation({ summary: 'Obtener solicitudes nuevas' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getNewRequests() {
    return this.maintenanceService.findAll({ status: 'NEW' });
  }

  @Get('urgent')
  @ApiOperation({ summary: 'Obtener solicitudes urgentes' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getUrgentRequests() {
    return this.maintenanceService.findAll({ priority: 'HIGH' });
  }

  @Get('property/:propertyId')
  @ApiOperation({ summary: 'Obtener solicitudes por propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'propertyId', type: Number })
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
  async findOne(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.maintenanceService.findOne(id);
  }

  @Patch(':id')
  @Roles('ADMIN', 'TECNICO')
  @ApiOperation({ summary: 'Actualizar una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateMaintenanceDto: UpdateMaintenanceDto,
  ) {
    return this.maintenanceService.update(id, updateMaintenanceDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
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
  async getMessages(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.maintenanceService.getMessages(id);
  }

  @Post(':id/messages')
  @Roles('ADMIN', 'TECNICO')
  @ApiOperation({ summary: 'Enviar mensaje a una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async addMessage(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() createMessageDto: CreateMessageDto,
    @Request() req: TenantRequest,
  ) {
    return this.maintenanceService.addMessage(
      id,
      createMessageDto,
      req.user!.userId,
    );
  }

  @Post(':id/upload')
  @Roles('ADMIN', 'TECNICO')
  @ApiOperation({
    summary: 'Subir archivos adjuntos a una solicitud (máx. 3, 10MB c/u)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @UseInterceptors(FilesInterceptor('files', 3, maintenanceMulterConfig))
  async uploadFiles(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: TenantRequest,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron archivos');
    }
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
  async getStageHistory(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.maintenanceService.getStageHistory(id);
  }

  @Patch(':id/stage')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'Cambiar etapa (admin — cualquier transición válida)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
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
  async getMyRequests(
    @Param('slug') _slug: string,
    @Request() req: TenantRequest,
  ) {
    return this.maintenanceService.findByTenant(req.user!.userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener mis estadísticas' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getStats(@Param('slug') _slug: string, @Request() req: TenantRequest) {
    return this.maintenanceService.getTenantStats(req.user!.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
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
  @ApiOperation({ summary: 'Crear una nueva solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
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
  @ApiOperation({ summary: 'Enviar mensaje a una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
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
  @ApiOperation({
    summary: 'Subir archivos adjuntos a una solicitud (máx. 3, 10MB c/u)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
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

  @Get()
  @ApiOperation({ summary: 'Solicitudes asignadas al técnico' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
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
  async findOne(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.maintenanceService.findOne(id);
  }

  @Get(':id/stage-history')
  @ApiOperation({ summary: 'Historial de etapas' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async getStageHistory(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.maintenanceService.getStageHistory(id);
  }

  @Patch(':id/stage')
  @ApiOperation({
    summary: 'Avanzar etapa (técnico — solo IN_PROGRESS o COMPLETED)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async changeStage(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStageDto,
    @Request() req: TenantRequest,
  ) {
    return this.maintenanceService.changeStageAsTechnician(
      id,
      dto.to_stage,
      req.user!.userId,
      dto.notes,
    );
  }

  @Post(':id/photos')
  @ApiOperation({ summary: 'Subir fotos del trabajo (máx. 5, solo imágenes)' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @UseInterceptors(FilesInterceptor('files', 5, stagePhotoMulterConfig))
  async uploadStagePhotos(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req: TenantRequest,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron fotos');
    }
    return this.maintenanceService.saveStagePhotos(
      id,
      files,
      req.user!.userId,
      slug,
    );
  }
}
