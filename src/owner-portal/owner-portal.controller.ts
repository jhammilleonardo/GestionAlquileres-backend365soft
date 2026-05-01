import {
  Controller,
  Get,
  Patch,
  Param,
  ParseIntPipe,
  UseGuards,
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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OwnerPortalService } from './owner-portal.service';

interface OwnerUser {
  userId: number;
  rentalOwnerId: number;
  role: string;
  tenantSlug: string;
}

@ApiTags('Owner Portal')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnerPortalGuard)
@Controller(':slug/owner')
export class OwnerPortalController {
  private readonly logger = new Logger(OwnerPortalController.name);

  constructor(private readonly ownerPortalService: OwnerPortalService) {}

  // ─── Dashboard ────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard del propietario' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Resumen del propietario' })
  @ApiForbiddenResponse({ description: 'Solo accesible con rol PROPIETARIO' })
  async getDashboard(@CurrentUser() user: OwnerUser) {
    return this.ownerPortalService.getDashboard(user.rentalOwnerId);
  }

  // ─── Propiedades ──────────────────────────────────────────────────────────

  @Get('properties')
  @ApiOperation({ summary: 'Propiedades del propietario' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Lista de propiedades del propietario' })
  async getProperties(@CurrentUser() user: OwnerUser) {
    return this.ownerPortalService.getProperties(user.rentalOwnerId);
  }

  // ─── Liquidaciones ────────────────────────────────────────────────────────

  @Get('statements')
  @ApiOperation({ summary: 'Historial de liquidaciones' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Lista de liquidaciones del propietario' })
  async getStatements(@CurrentUser() user: OwnerUser) {
    return this.ownerPortalService.getStatements(user.rentalOwnerId);
  }

  @Get('statements/:id/pdf')
  @ApiOperation({ summary: 'Descargar PDF de liquidación' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la liquidación' })
  @ApiQuery({ name: 'lang', enum: ['es', 'en'], required: false })
  @ApiOkResponse({ description: 'PDF de la liquidación' })
  @ApiNotFoundResponse({ description: 'Liquidación no encontrada' })
  @ApiForbiddenResponse({
    description: 'La liquidación no pertenece al propietario',
  })
  async downloadStatementPdf(
    @Param('id', ParseIntPipe) id: number,
    @Query('lang') lang: 'es' | 'en' | undefined,
    @CurrentUser() user: OwnerUser,
    @Res() res: Response,
  ) {
    const language = lang === 'en' ? 'en' : 'es';
    try {
      const filePath = await this.ownerPortalService.getStatementPdf(
        id,
        user.rentalOwnerId,
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
  @ApiOperation({ summary: 'Solicitudes de mantenimiento activas' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Solicitudes de mantenimiento activas' })
  async getMaintenance(@CurrentUser() user: OwnerUser) {
    return this.ownerPortalService.getMaintenance(user.rentalOwnerId);
  }

  @Patch('maintenance/:id/authorize')
  @ApiOperation({ summary: 'Autorizar gasto de mantenimiento (solo Bolivia)' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({
    name: 'id',
    type: Number,
    description: 'ID de la solicitud de mantenimiento',
  })
  @ApiOkResponse({ description: 'Gasto autorizado correctamente' })
  @ApiForbiddenResponse({
    description: 'La solicitud no pertenece al propietario o no es de Bolivia',
  })
  async authorizeMaintenance(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: OwnerUser,
  ) {
    await this.ownerPortalService.authorizeMaintenance(id, user.rentalOwnerId);
    return {
      message: 'Gasto autorizado. El técnico puede iniciar el trabajo.',
    };
  }

  // ─── Contratos ────────────────────────────────────────────────────────────

  @Get('contracts')
  @ApiOperation({ summary: 'Contratos firmados descargables' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Contratos firmados con PDF' })
  async getContracts(@CurrentUser() user: OwnerUser) {
    return this.ownerPortalService.getContracts(user.rentalOwnerId);
  }
}
