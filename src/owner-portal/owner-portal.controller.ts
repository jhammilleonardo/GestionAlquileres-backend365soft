import {
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  UseGuards,
  Request,
  Res,
  Query,
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
  ApiNotFoundResponse,
  ApiForbiddenResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { OwnerPortalGuard } from '../common/guards/owner-portal.guard';
import { OwnerPortalService } from './owner-portal.service';

@ApiTags('Owner Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnerPortalGuard)
@Controller(':slug/owner')
export class OwnerPortalController {
  private readonly logger = new Logger(OwnerPortalController.name);

  constructor(private readonly ownerPortalService: OwnerPortalService) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard del propietario',
    description:
      'Resumen con cantidad de propiedades, inquilinos activos, saldo pendiente de liquidaciones y mantenimientos activos.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Resumen del propietario' })
  @ApiForbiddenResponse({ description: 'Solo accesible con rol PROPIETARIO' })
  async getDashboard(@Request() req) {
    return this.ownerPortalService.getDashboard(req.user.rentalOwnerId);
  }

  // ─── Propiedades ──────────────────────────────────────────────────────────

  @Get('properties')
  @ApiOperation({
    summary: 'Propiedades del propietario',
    description:
      'Lista sus propiedades con estado actual, porcentaje de participación e inquilino actual.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Lista de propiedades del propietario' })
  async getProperties(@Request() req) {
    return this.ownerPortalService.getProperties(req.user.rentalOwnerId);
  }

  // ─── Liquidaciones ────────────────────────────────────────────────────────

  @Get('statements')
  @ApiOperation({
    summary: 'Historial de liquidaciones',
    description:
      'Lista todas las liquidaciones del propietario ordenadas por período descendente. Incluye monto bruto, deducciones y monto neto.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Lista de liquidaciones del propietario' })
  async getStatements(@Request() req) {
    return this.ownerPortalService.getStatements(req.user.rentalOwnerId);
  }

  @Get('statements/:id/pdf')
  @ApiOperation({
    summary: 'Descargar PDF de liquidación',
    description:
      'Descarga el PDF de una liquidación específica. Solo se permite si la liquidación pertenece al propietario autenticado.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la liquidación' })
  @ApiQuery({ name: 'lang', enum: ['es', 'en'], required: false })
  @ApiOkResponse({ description: 'PDF de la liquidación' })
  @ApiNotFoundResponse({ description: 'Liquidación no encontrada' })
  @ApiForbiddenResponse({ description: 'La liquidación no pertenece al propietario' })
  async downloadStatementPdf(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Query('lang') lang: 'es' | 'en' | undefined,
    @Request() req,
    @Res() res: Response,
  ) {
    const language = lang === 'en' ? 'en' : 'es';
    try {
      const filePath = await this.ownerPortalService.getStatementPdf(
        id,
        req.user.rentalOwnerId,
        language,
      );
      res.download(filePath, `liquidacion_${id}.pdf`, (err) => {
        if (err) {
          this.logger.error(`Error al descargar PDF de liquidación ${id}`, err);
        }
      });
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(
        `Error generando PDF: ${error instanceof Error ? error.message : 'Error desconocido'}`,
      );
    }
  }

  // ─── Mantenimiento ────────────────────────────────────────────────────────

  @Get('maintenance')
  @ApiOperation({
    summary: 'Solicitudes de mantenimiento activas',
    description:
      'Lista las solicitudes de mantenimiento activas (NEW | IN_PROGRESS) en propiedades del propietario.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Solicitudes de mantenimiento activas' })
  async getMaintenance(@Request() req) {
    return this.ownerPortalService.getMaintenance(req.user.rentalOwnerId);
  }

  @Patch('maintenance/:id/authorize')
  @ApiOperation({
    summary: 'Autorizar gasto de mantenimiento (solo Bolivia)',
    description:
      'El propietario autoriza el costo estimado de una solicitud de mantenimiento. ' +
      'Solo aplica para propiedades de Bolivia. ' +
      'Lanza 403 si la solicitud no pertenece a una de sus propiedades.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la solicitud de mantenimiento' })
  @ApiOkResponse({ description: 'Gasto autorizado correctamente' })
  @ApiForbiddenResponse({ description: 'La solicitud no pertenece al propietario' })
  async authorizeMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
    await this.ownerPortalService.authorizeMaintenance(id, req.user.rentalOwnerId);
    return { message: 'Gasto autorizado. El técnico puede iniciar el trabajo.' };
  }

  // ─── Contratos ────────────────────────────────────────────────────────────

  @Get('contracts')
  @ApiOperation({
    summary: 'Contratos firmados descargables',
    description:
      'Lista los contratos firmados (is_signed = true) con PDF disponible para descargar en propiedades del propietario.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Contratos firmados con PDF' })
  async getContracts(@Request() req) {
    return this.ownerPortalService.getContracts(req.user.rentalOwnerId);
  }
}
