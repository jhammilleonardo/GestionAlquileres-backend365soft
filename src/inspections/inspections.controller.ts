import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  Res,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiConsumes,
  ApiBody,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { InspectionsService } from './inspections.service';
import { CreateInspectionDto } from './dto/create-inspection.dto';
import { UpdateInspectionItemsDto } from './dto/update-inspection-items.dto';
import { FilterInspectionsDto } from './dto/filter-inspections.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { inspectionPhotoMulterConfig } from '../common/utils/multer.config';
import { assertUploadedFilesMatchContent } from '../common/utils/upload-content-validation';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';
import {
  InspectionCompareResponseDto,
  InspectionDetailResponseDto,
  InspectionPhotosResponseDto,
  InspectionResponseDto,
} from './dto/inspection-response.dto';

@ApiTags('Inspections')
@ApiBearerAuth()
@Controller(':slug/admin/inspections')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class InspectionsController {
  constructor(private readonly inspectionsService: InspectionsService) {}

  @Post()
  @RequirePermission('inspections', 'create')
  @ApiOperation({ summary: 'Crear nueva inspección' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiBody({ type: CreateInspectionDto })
  @ApiCreatedResponse({ type: InspectionResponseDto })
  create(@Req() req: TenantRequest, @Body() dto: CreateInspectionDto) {
    return this.inspectionsService.create(
      req.tenant!.schema_name,
      dto,
      req.user!.userId,
    );
  }

  // IMPORTANTE: /compare debe ir ANTES de /:id para que Express no lo trate como ID
  @Get('compare')
  @RequirePermission('inspections', 'view')
  @ApiOperation({ summary: 'Comparar inspección de entrada vs salida' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiQuery({ name: 'move_in', type: Number })
  @ApiQuery({ name: 'move_out', type: Number })
  @ApiOkResponse({ type: InspectionCompareResponseDto })
  @ApiNotFoundResponse({ description: 'Inspección no encontrada' })
  compare(
    @Req() req: TenantRequest,
    @Query('move_in', ParseIntPipe) moveInId: number,
    @Query('move_out', ParseIntPipe) moveOutId: number,
  ) {
    return this.inspectionsService.compare(
      req.tenant!.schema_name,
      moveInId,
      moveOutId,
    );
  }

  @Get()
  @RequirePermission('inspections', 'view')
  @ApiOperation({ summary: 'Listar inspecciones con filtros' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: InspectionResponseDto, isArray: true })
  findAll(@Req() req: TenantRequest, @Query() filters: FilterInspectionsDto) {
    return this.inspectionsService.findAll(req.tenant!.schema_name, filters);
  }

  @Get(':id')
  @RequirePermission('inspections', 'view')
  @ApiOperation({ summary: 'Obtener inspección con ítems' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: InspectionDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Inspección no encontrada' })
  findOne(@Req() req: TenantRequest, @Param('id', ParseIntPipe) id: number) {
    return this.inspectionsService.findOne(req.tenant!.schema_name, id);
  }

  @Patch(':id/items')
  @RequirePermission('inspections', 'edit')
  @ApiOperation({ summary: 'Completar / actualizar ítems del checklist' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateInspectionItemsDto })
  @ApiOkResponse({ type: InspectionDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Inspección no encontrada' })
  updateItems(
    @Req() req: TenantRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateInspectionItemsDto,
  ) {
    return this.inspectionsService.updateItems(
      req.tenant!.schema_name,
      id,
      dto,
      req.user!.userId,
    );
  }

  @Post(':id/photos')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @RequirePermission('inspections', 'edit')
  @UseInterceptors(FilesInterceptor('files', 5, inspectionPhotoMulterConfig))
  @ApiOperation({ summary: 'Subir fotos a un ítem de la inspección' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiQuery({
    name: 'item_id',
    type: Number,
    description: 'ID del ítem al que se asocian las fotos',
  })
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
        },
      },
    },
  })
  @ApiOkResponse({ type: InspectionPhotosResponseDto })
  @ApiBadRequestResponse({ description: 'No se enviaron archivos' })
  @ApiNotFoundResponse({ description: 'Inspección o ítem no encontrado' })
  async uploadPhotos(
    @Req() req: TenantRequest,
    @Param('id', ParseIntPipe) id: number,
    @Query('item_id', ParseIntPipe) itemId: number,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) {
      throw new BadRequestException('No se enviaron archivos');
    }
    await assertUploadedFilesMatchContent(files);
    return this.inspectionsService.addPhotosToItem(
      req.tenant!.schema_name,
      id,
      itemId,
      files,
      req.tenant!.slug,
    );
  }

  @Get(':id/pdf')
  @RequirePermission('inspections', 'view')
  @ApiOperation({ summary: 'Generar reporte PDF de la inspección' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Archivo PDF de inspección' })
  @ApiNotFoundResponse({ description: 'Inspección no encontrada' })
  async generatePdf(
    @Req() req: TenantRequest,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.inspectionsService.generatePdf(
      req.tenant!.schema_name,
      id,
    );
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="inspeccion-${id}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }
}
