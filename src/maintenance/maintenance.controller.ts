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
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { maintenanceMulterConfig } from '../common/utils/multer.config';
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
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Maintenance - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller(':slug/admin/maintenance')
export class AdminMaintenanceController {
  constructor(private readonly maintenanceService: MaintenanceService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener todas las solicitudes' })
  @ApiParam({ name: 'slug', description: 'Tenant slug', example: 'mi-empresa' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'priority', required: false })
  @ApiQuery({ name: 'request_type', required: false })
  @ApiQuery({ name: 'tenant_id', required: false })
  @ApiQuery({ name: 'property_id', required: false })
  @ApiQuery({ name: 'contract_id', required: false })
  async findAll(@Param('slug') slug: string, @Query() filters: any) {
    return this.maintenanceService.findAll(filters);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de mantenimiento' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getStats(@Param('slug') slug: string) {
    return this.maintenanceService.getAdminStats();
  }

  @Get('new')
  @ApiOperation({ summary: 'Obtener solicitudes nuevas' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getNewRequests(@Param('slug') slug: string) {
    return this.maintenanceService.findAll({ status: 'NEW' });
  }

  @Get('urgent')
  @ApiOperation({ summary: 'Obtener solicitudes urgentes' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getUrgentRequests(@Param('slug') slug: string) {
    return this.maintenanceService.findAll({ priority: 'HIGH' });
  }

  @Get('property/:propertyId')
  @ApiOperation({ summary: 'Obtener solicitudes por propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'propertyId', type: Number })
  async findByProperty(
    @Param('slug') slug: string,
    @Param('propertyId') propertyId: string,
  ) {
    return this.maintenanceService.findAll({ property_id: +propertyId });
  }

  @Get('contract/:contractId')
  @ApiOperation({ summary: 'Obtener solicitudes por contrato' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'contractId', type: Number })
  async findByContract(
    @Param('slug') slug: string,
    @Param('contractId') contractId: string,
  ) {
    return this.maintenanceService.findAll({ contract_id: +contractId });
  }

  @Get('tenant/:tenantId')
  @ApiOperation({ summary: 'Obtener solicitudes por inquilino' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'tenantId', type: Number })
  async findByTenant(
    @Param('slug') slug: string,
    @Param('tenantId') tenantId: string,
  ) {
    return this.maintenanceService.findByTenant(+tenantId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async findOne(@Param('slug') slug: string, @Param('id') id: string) {
    return this.maintenanceService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Actualizar una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() updateMaintenanceDto: UpdateMaintenanceDto,
  ) {
    return this.maintenanceService.update(+id, updateMaintenanceDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async remove(@Param('slug') slug: string, @Param('id') id: string) {
    await this.maintenanceService.remove(+id);
    return { message: 'Solicitud eliminada correctamente' };
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Obtener mensajes de una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async getMessages(@Param('slug') slug: string, @Param('id') id: string) {
    return this.maintenanceService.getMessages(+id);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Enviar mensaje a una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async addMessage(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() createMessageDto: CreateMessageDto,
    @Request() req,
  ) {
    return this.maintenanceService.addMessage(
      +id,
      createMessageDto,
      req.user.userId,
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
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron archivos');
    }
    return this.maintenanceService.saveUploadedFiles(
      +id,
      files,
      req.user.userId,
      slug,
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
  async getMyRequests(@Param('slug') slug: string, @Request() req) {
    return this.maintenanceService.findByTenant(req.user.userId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Obtener mis estadísticas' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getStats(@Param('slug') slug: string, @Request() req) {
    return this.maintenanceService.getTenantStats(req.user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async findOne(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    const request = await this.maintenanceService.findOne(+id);
    // Verificar que la solicitud pertenezca al inquilino
    if (request.tenant_id !== req.user.userId) {
      throw new Error('No tienes permiso para ver esta solicitud');
    }
    return request;
  }

  @Post()
  @ApiOperation({ summary: 'Crear una nueva solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async create(
    @Param('slug') slug: string,
    @Body() createMaintenanceDto: CreateMaintenanceDto,
    @Request() req,
  ) {
    // El backend busca automáticamente el contrato activo del tenant
    // No es necesario enviar contract_id ni tenant_id
    const assignedTo = 1; // Por defecto al admin con ID 1

    return this.maintenanceService.create(
      createMaintenanceDto,
      req.user.userId,
      undefined, // contract_id se busca automáticamente
      assignedTo,
    );
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'Obtener mensajes de una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async getMessages(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Request() req,
  ) {
    const request = await this.maintenanceService.findOne(+id);
    if (request.tenant_id !== req.user.userId) {
      throw new Error('No tienes permiso para ver esta solicitud');
    }
    return this.maintenanceService.getMessages(+id, req.user.userId);
  }

  @Post(':id/messages')
  @ApiOperation({ summary: 'Enviar mensaje a una solicitud' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async addMessage(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() createMessageDto: CreateMessageDto,
    @Request() req,
  ) {
    const request = await this.maintenanceService.findOne(+id);
    if (request.tenant_id !== req.user.userId) {
      throw new Error(
        'No tienes permiso para enviar mensajes en esta solicitud',
      );
    }
    return this.maintenanceService.addMessage(
      +id,
      createMessageDto,
      req.user.userId,
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
    @Param('id') id: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Request() req,
  ) {
    const request = await this.maintenanceService.findOne(+id);
    if (request.tenant_id !== req.user.userId) {
      throw new BadRequestException(
        'No tienes permiso para subir archivos en esta solicitud',
      );
    }
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron archivos');
    }
    return this.maintenanceService.saveUploadedFiles(
      +id,
      files,
      req.user.userId,
      slug,
    );
  }
}
