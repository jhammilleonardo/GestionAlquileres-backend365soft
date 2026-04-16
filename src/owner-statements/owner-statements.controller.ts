import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  ParseIntPipe,
  UseGuards,
  Res,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiOkResponse, ApiNotFoundResponse, ApiQuery } from '@nestjs/swagger';
import { OwnerStatementsService } from './owner-statements.service';
import {
  CreateOwnerStatementDto,
  UpdateOwnerStatementDto,
  OwnerStatementResponseDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Admin endpoints for managing owner statements
 */
@ApiTags('Owner Statements - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller(':slug/admin/owner-statements')
export class AdminOwnerStatementsController {
  private readonly logger = new Logger(AdminOwnerStatementsController.name);

  constructor(private readonly ownerStatementsService: OwnerStatementsService) {}

  /**
   * GET /:slug/admin/owner-statements/:id
   * Obtener un estado de cuenta por ID
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener estado de cuenta por ID',
    description: 'Retorna los detalles de un estado de cuenta específico',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del estado de cuenta' })
  @ApiOkResponse({
    description: 'Detalles del estado de cuenta',
    type: OwnerStatementResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Estado de cuenta no encontrado' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.ownerStatementsService.findOne(id);
  }

  /**
   * GET /:slug/admin/owner-statements/:id/pdf
   * Descargar PDF del estado de cuenta - ADMIN
   */
  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Descargar PDF de liquidación (Admin)',
    description: 'El administrador descarga el PDF del estado de cuenta del propietario',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del estado de cuenta' })
  @ApiQuery({ name: 'lang', enum: ['es', 'en'], required: false, description: 'Idioma del PDF' })
  async downloadPdfAdmin(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('lang') lang?: 'es' | 'en',
    @Res() res?: Response,
  ) {
    const language = (lang === 'en' ? 'en' : 'es') as 'es' | 'en';

    try {
      const filePath = await this.ownerStatementsService.generatePdf(id, language);

      if (!res) {
        throw new BadRequestException('Response object unavailable');
      }

      res.download(filePath, `liquidacion_${id}.pdf`, (err) => {
        if (err) {
          this.logger.error('Error al descargar archivo', err);
        }
      });
    } catch (error) {
      throw new BadRequestException(
        `Error generando PDF: ${error instanceof Error ? error.message : 'Error desconocido'}`,
      );
    }
  }

  /**
   * POST /:slug/admin/owner-statements
   * Crear un estado de cuenta manualmente (normalmente se crea automáticamente)
   */
  @Post()
  @ApiOperation({
    summary: 'Crear estado de cuenta (uso interno)',
    description:
      'Crear un estado de cuenta manualmente. Normalmente se genera automáticamente al confirmar pagos.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  async create(@Param('slug') _slug: string, @Body() dto: CreateOwnerStatementDto) {
    return this.ownerStatementsService.create(dto);
  }

  /**
   * PATCH /:slug/admin/owner-statements/:id
   * Actualizar un estado de cuenta
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar estado de cuenta',
    description: 'Actualiza los datos de un estado de cuenta específico',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del estado de cuenta' })
  async update(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOwnerStatementDto,
  ) {
    return this.ownerStatementsService.update(id, dto);
  }

  /**
   * DELETE /:slug/admin/owner-statements/:id
   * Eliminar un estado de cuenta
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Eliminar estado de cuenta',
    description: 'Elimina un estado de cuenta específico',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del estado de cuenta' })
  async delete(@Param('slug') _slug: string, @Param('id', ParseIntPipe) id: number) {
    return this.ownerStatementsService.delete(id);
  }
}

/**
 * Owner endpoints for accessing their own statements
 */
@ApiTags('Owner Statements - Portal Propietario')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(':slug/owner/statements')
export class OwnerStatementPortalController {
  private readonly logger = new Logger(OwnerStatementPortalController.name);

  constructor(private readonly ownerStatementsService: OwnerStatementsService) {}

  /**
   * GET /:slug/owner/statements/:id/pdf
   * Descargar PDF del estado de cuenta - PROPIETARIO
   */
  @Get(':id/pdf')
  @ApiOperation({
    summary: 'Descargar PDF de liquidación personal',
    description: 'El propietario descarga el PDF de su liquidación desde su portal',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del estado de cuenta' })
  @ApiQuery({ name: 'lang', enum: ['es', 'en'], required: false, description: 'Idioma del PDF' })
  async downloadPdfOwner(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('lang') lang?: 'es' | 'en',
    @Res() res?: Response,
  ) {
    const language = (lang === 'en' ? 'en' : 'es') as 'es' | 'en';

    try {
      const filePath = await this.ownerStatementsService.generatePdf(id, language);

      if (!res) {
        throw new BadRequestException('Response object unavailable');
      }

      res.download(filePath, `liquidacion_${id}.pdf`, (err) => {
        if (err) {
          this.logger.error('Error al descargar archivo', err);
        }
      });
    } catch (error) {
      throw new BadRequestException(
        `Error generando PDF: ${error instanceof Error ? error.message : 'Error desconocido'}`,
      );
    }
  }
}
