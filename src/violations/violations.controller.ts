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
  Res,
  HttpCode,
  HttpStatus,
  BadRequestException,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ViolationsService } from './violations.service';
import { CreateViolationDto, UpdateViolationStatusDto, ViolationFiltersDto } from './dto';

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
  @ApiCreatedResponse({ description: 'Infracción registrada correctamente' })
  async create(@Body() dto: CreateViolationDto, @CurrentUser() user: JwtUser) {
    return this.violationsService.create(dto, user.userId);
  }

  @Get()
  @RequirePermission('violations', 'view')
  @ApiOperation({ summary: 'Listar infracciones con filtros opcionales' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Lista de infracciones' })
  async findAll(@Query() filters: ViolationFiltersDto) {
    return this.violationsService.findAll(filters);
  }

  @Patch(':id/status')
  @RequirePermission('violations', 'edit')
  @ApiOperation({ summary: 'Cambiar el estado de una infracción' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Estado actualizado' })
  @ApiNotFoundResponse({ description: 'Infracción no encontrada' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateViolationStatusDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.violationsService.updateStatus(id, dto, user.userId);
  }

  @Post(':id/notify')
  @RequirePermission('violations', 'edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enviar notificación formal al inquilino' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Notificación enviada y estado actualizado a notified' })
  @ApiNotFoundResponse({ description: 'Infracción no encontrada' })
  async notifyTenant(@Param('id', ParseIntPipe) id: number) {
    await this.violationsService.notifyTenant(id);
    return { message: 'Notificación enviada al inquilino correctamente.' };
  }

  @Get(':id/pdf')
  @RequirePermission('violations', 'view')
  @ApiOperation({ summary: 'Descargar carta formal de notificación en PDF' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'PDF de la carta de notificación' })
  @ApiNotFoundResponse({ description: 'Infracción no encontrada' })
  async getPdf(
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
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
