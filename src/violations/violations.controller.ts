import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  HttpException,
  Logger,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { violationMulterConfig } from '../common/utils/multer.config';
import { assertUploadedFilesMatchContent } from '../common/utils/upload-content-validation';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ViolationsService } from './violations.service';
import {
  AddViolationNoteDto,
  ChargeFineDto,
  CreateViolationDto,
  UpdateViolationStatusDto,
  ViolationFiltersDto,
} from './dto';
import {
  PaginatedViolationsResponseDto,
  ViolationMessageResponseDto,
  ViolationResponseDto,
  ViolationStatsResponseDto,
} from './dto/violation-response.dto';

interface JwtUser {
  userId: number;
  role: string;
  tenantSlug: string;
}

@ApiTags('Violations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/violations')
export class ViolationsController {
  private readonly logger = new Logger(ViolationsController.name);

  constructor(private readonly violationsService: ViolationsService) {}

  @Post()
  @RequirePermission('violations', 'create')
  @ApiOperation({ summary: 'Registrar una nueva infracción con evidencia' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiBody({ type: CreateViolationDto })
  @ApiCreatedResponse({ type: ViolationResponseDto })
  async create(@Body() dto: CreateViolationDto, @CurrentUser() user: JwtUser) {
    return this.violationsService.create(dto, user.userId);
  }

  @Get()
  @RequirePermission('violations', 'view')
  @ApiOperation({ summary: 'Listar infracciones con filtros opcionales' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ type: PaginatedViolationsResponseDto })
  async findAll(@Query() filters: ViolationFiltersDto) {
    return this.violationsService.findAll(filters);
  }

  @Get('stats')
  @RequirePermission('violations', 'view')
  @ApiOperation({ summary: 'Métricas resumen de infracciones' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ type: ViolationStatsResponseDto })
  async getStats() {
    return this.violationsService.getStats();
  }

  @Get(':id')
  @RequirePermission('violations', 'view')
  @ApiOperation({ summary: 'Detalle de una infracción con su línea de tiempo' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ViolationResponseDto })
  @ApiNotFoundResponse({ description: 'Infracción no encontrada' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.violationsService.findDetail(id);
  }

  @Patch(':id/status')
  @RequirePermission('violations', 'edit')
  @ApiOperation({ summary: 'Cambiar el estado de una infracción' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateViolationStatusDto })
  @ApiOkResponse({ type: ViolationResponseDto })
  @ApiBadRequestResponse({ description: 'Transición de estado inválida' })
  @ApiNotFoundResponse({ description: 'Infracción no encontrada' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateViolationStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.violationsService.updateStatus(id, dto, user.userId);
  }

  @Post(':id/notes')
  @RequirePermission('violations', 'edit')
  @ApiOperation({ summary: 'Agregar una nota interna a la línea de tiempo' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: AddViolationNoteDto })
  @ApiCreatedResponse({ description: 'Línea de tiempo actualizada' })
  @ApiNotFoundResponse({ description: 'Infracción no encontrada' })
  async addNote(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AddViolationNoteDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.violationsService.addNote(id, dto, user.userId);
  }

  @Post(':id/fine')
  @RequirePermission('violations', 'edit')
  @ApiOperation({ summary: 'Aplicar o actualizar una multa' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: ChargeFineDto })
  @ApiOkResponse({ type: ViolationResponseDto })
  @ApiBadRequestResponse({ description: 'La multa ya fue pagada' })
  @ApiNotFoundResponse({ description: 'Infracción no encontrada' })
  async chargeFine(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ChargeFineDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.violationsService.chargeFine(id, dto, user.userId);
  }

  @Post(':id/fine/waive')
  @RequirePermission('violations', 'edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Condonar la multa pendiente' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ViolationResponseDto })
  @ApiBadRequestResponse({ description: 'No hay multa pendiente' })
  async waiveFine(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.violationsService.waiveFine(id, user.userId);
  }

  @Post(':id/fine/pay')
  @RequirePermission('violations', 'edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marcar la multa como pagada' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ViolationResponseDto })
  @ApiBadRequestResponse({ description: 'No hay multa pendiente' })
  async payFine(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.violationsService.payFine(id, user.userId);
  }

  @Post(':id/notify')
  @RequirePermission('violations', 'edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar notificación formal al inquilino' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ViolationMessageResponseDto })
  @ApiNotFoundResponse({ description: 'Infracción no encontrada' })
  async notifyTenant(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    await this.violationsService.notifyTenant(id, user.userId);
    return { message: 'Notificación enviada al inquilino correctamente.' };
  }

  @Post(':id/upload')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @RequirePermission('violations', 'edit')
  @ApiOperation({ summary: 'Subir fotos de evidencia (máx. 5, 10MB c/u)' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
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
  @ApiCreatedResponse({ description: 'URLs de las fotos almacenadas' })
  @UseInterceptors(FilesInterceptor('files', 5, violationMulterConfig))
  async uploadEvidence(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtUser,
  ): Promise<{ evidence_photos: string[] }> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron archivos');
    }
    await assertUploadedFilesMatchContent(files);
    const evidence_photos = await this.violationsService.addEvidencePhotos(
      id,
      files,
      slug,
      user.userId,
    );
    return { evidence_photos };
  }

  @Get(':id/pdf')
  @RequirePermission('violations', 'view')
  @ApiOperation({ summary: 'Descargar carta formal de notificación en PDF' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'PDF de la carta de notificación' })
  @ApiNotFoundResponse({ description: 'Infracción no encontrada' })
  async getPdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    try {
      const filePath = await this.violationsService.generatePdf(id);
      res.download(filePath, `violacion_${id}.pdf`, (err) => {
        if (err) {
          this.logger.error(`Error al descargar PDF de violación ${id}`, err);
        }
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        `Error generando PDF: ${error instanceof Error ? error.message : 'Error desconocido'}`,
      );
    }
  }
}
