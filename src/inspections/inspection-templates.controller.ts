import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';
import { InspectionTemplatesService } from './inspection-templates.service';
import {
  CreateInspectionTemplateDto,
  UpdateInspectionTemplateDto,
} from './dto/inspection-template.dto';

@ApiTags('Inspection Templates')
@ApiBearerAuth()
@Controller(':slug/admin/inspection-templates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InspectionTemplatesController {
  constructor(private readonly templatesService: InspectionTemplatesService) {}

  @Get()
  @RequirePermission('inspections', 'view')
  @ApiOperation({ summary: 'Listar plantillas de inspección' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  findAll(@Req() req: TenantRequest) {
    return this.templatesService.findAll(req.tenant!.schema_name);
  }

  @Post()
  @RequirePermission('inspections', 'create')
  @ApiOperation({ summary: 'Crear plantilla de inspección' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiCreatedResponse({ description: 'Plantilla creada' })
  create(
    @Req() req: TenantRequest,
    @Body() dto: CreateInspectionTemplateDto,
  ) {
    return this.templatesService.create(
      req.tenant!.schema_name,
      dto,
      req.user!.userId,
    );
  }

  @Get(':id')
  @RequirePermission('inspections', 'view')
  @ApiOperation({ summary: 'Obtener una plantilla' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiNotFoundResponse({ description: 'Plantilla no encontrada' })
  findOne(@Req() req: TenantRequest, @Param('id', ParseIntPipe) id: number) {
    return this.templatesService.findOne(req.tenant!.schema_name, id);
  }

  @Patch(':id')
  @RequirePermission('inspections', 'edit')
  @ApiOperation({ summary: 'Actualizar plantilla' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Plantilla actualizada' })
  @ApiNotFoundResponse({ description: 'Plantilla no encontrada' })
  update(
    @Req() req: TenantRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInspectionTemplateDto,
  ) {
    return this.templatesService.update(req.tenant!.schema_name, id, dto);
  }

  @Delete(':id')
  @RequirePermission('inspections', 'edit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar plantilla' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiNotFoundResponse({ description: 'Plantilla no encontrada' })
  remove(@Req() req: TenantRequest, @Param('id', ParseIntPipe) id: number) {
    return this.templatesService.remove(req.tenant!.schema_name, id);
  }
}
