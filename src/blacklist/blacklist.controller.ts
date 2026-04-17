import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiBody,
  ApiResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { BlacklistService } from './blacklist.service';
import {
  AddToBlacklistDto,
  CheckBlacklistDto,
  BlacklistCheckResponseDto,
  BlacklistAddResponseDto,
  BlacklistListResponseDto,
} from './dto/blacklist.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * ADMIN Endpoints - Gestión de lista negra
 * Solo ADMIN puede:
 * - Agregar inquilinos a la lista negra
 * - Listar completa la lista negra
 * - Eliminar de la lista negra
 * - Ver log de auditoría
 */
@ApiTags('Blacklist - Administración')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller(':slug/admin/blacklist')
export class AdminBlacklistController {
  private readonly logger = new Logger(AdminBlacklistController.name);

  constructor(private readonly blacklistService: BlacklistService) {}

  /**
   * POST /:slug/admin/blacklist
   * Agregar inquilino a la lista negra
   * Solo ADMIN con motivo obligatorio
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Agregar inquilino a lista negra',
    description:
      'Solo ADMIN puede agregar inquilinos a la lista negra. Requiere motivo obligatorio. Esta información es compartida entre TODOS los tenants en la plataforma.',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiBody({
    type: AddToBlacklistDto,
    description: 'Datos del inquilino a agregar',
  })
  @ApiResponse({
    status: 201,
    description: 'Inquilino agregado exitosamente',
    type: BlacklistAddResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Documento duplicado o datos inválidos',
  })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'No es ADMIN' })
  async addToBlacklist(
    @Param('slug') slug: string,
    @Body() dto: AddToBlacklistDto,
    @Request() req,
  ): Promise<BlacklistAddResponseDto> {
    this.logger.log(
      `[ADMIN BLACKLIST] Agregando inquilino: ${dto.full_name} (${dto.document_number})`,
    );

    return await this.blacklistService.addToBlacklist(
      dto,
      slug,
      req.user.userId,
      req.user.email,
      req.ip,
      req.get('user-agent'),
    );
  }

  /**
   * GET /:slug/admin/blacklist
   * Listar todos los inquilinos en lista negra
   * Solo ADMIN puede ver la lista completa
   */
  @Get()
  @ApiOperation({
    summary: 'Listar lista negra completa',
    description:
      'Solo ADMIN puede ver la lista completa de inquilinos vetados. Datos sensibles.',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiResponse({
    status: 200,
    description: 'Lista de inquilinos en blacklist',
    type: [BlacklistListResponseDto],
  })
  async listBlacklist(
    @Param('slug') slug: string,
    @Request() req,
  ): Promise<BlacklistListResponseDto[]> {
    this.logger.log(`[ADMIN BLACKLIST] Listando blacklist del tenant ${slug}`);

    return await this.blacklistService.listBlacklist(
      slug,
      req.user.userId,
      req.ip,
      req.get('user-agent'),
    );
  }

  /**
   * DELETE /:slug/admin/blacklist/:id
   * Eliminar un inquilino de la lista negra
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar inquilino de lista negra',
    description: 'Solo ADMIN puede eliminar registros de la lista negra',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number, description: 'ID del registro en blacklist' })
  @ApiResponse({
    status: 200,
    description: 'Inquilino eliminado exitosamente',
    type: BlacklistAddResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Registro no encontrado' })
  async removeFromBlacklist(
    @Param('slug') slug: string,
    @Param('id') id: number,
    @Request() req,
  ): Promise<BlacklistAddResponseDto> {
    this.logger.log(
      `[ADMIN BLACKLIST] Eliminando registro de blacklist: ${id}`,
    );

    return await this.blacklistService.removeFromBlacklist(
      id,
      slug,
      req.user.userId,
      req.user.email,
      req.ip,
      req.get('user-agent'),
    );
  }

  /**
   * GET /:slug/admin/blacklist/audit/log
   * Obtener registro de auditoría (quién, cuándo, qué)
   * Solo ADMIN - Datos muy sensibles
   */
  @Get('audit/log')
  @ApiOperation({
    summary: 'Obtener log de auditoría',
    description:
      'Solo ADMIN: registro de todas las operaciones en la lista negra (quién agregó, cuándo, motivo)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Cantidad de registros a retornar (máximo 500)',
  })
  @ApiResponse({
    status: 200,
    description: 'Log de auditoría',
  })
  async getAuditLog(
    @Param('slug') slug: string,
    @Request() req: any,
    @Query('limit') limit?: number,
  ): Promise<any[]> {
    this.logger.log(
      `[ADMIN BLACKLIST] Consultando audit log del tenant ${slug}`,
    );

    return await this.blacklistService.getAuditLog(
      slug,
      req.user.userId,
      limit || 100,
    );
  }
}

/**
 * PUBLIC Endpoints - Verificación de documento
 * Durante screening: verificación automática
 * Cualquier usuario autenticado puede verificar un documento
 */
@ApiTags('Blacklist - Verificación Pública')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(':slug/blacklist')
export class PublicBlacklistController {
  private readonly logger = new Logger(PublicBlacklistController.name);

  constructor(private readonly blacklistService: BlacklistService) {}

  /**
   * GET /:slug/blacklist/check?document=X
   * Verificar si un documento está en la lista negra
   * Se llama automáticamente durante screening
   * Acceso: ADMIN e INMOBILIARIA
   */
  @Get('check')
  @ApiOperation({
    summary: 'Verificar si un documento está en lista negra',
    description:
      'Endpoint para verificar automáticamente si un documento está vetado durante el screening. Se llama automáticamente al crear una solicitud.',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiQuery({
    name: 'document',
    required: true,
    description: 'Número de documento a verificar',
  })
  @ApiQuery({
    name: 'document_type',
    required: false,
    enum: ['CEDULA', 'PASAPORTE', 'CARNET'],
    description: 'Tipo de documento (por defecto CEDULA)',
  })
  @ApiResponse({
    status: 200,
    description: 'Resultado de verificación',
    type: BlacklistCheckResponseDto,
  })
  async checkBlacklist(
    @Param('slug') slug: string,
    @Query('document') document: string,
    @Request() req: any,
    @Query('document_type') documentType?: string,
  ): Promise<BlacklistCheckResponseDto> {
    this.logger.debug(
      `[BLACKLIST CHECK] Verificando documento: ${document} (tipo: ${documentType || 'CEDULA'})`,
    );

    const dto: CheckBlacklistDto = {
      document_number: document,
      document_type: (documentType as any) || 'CEDULA',
    };

    const isAdmin = req.user?.role === 'ADMIN';

    return await this.blacklistService.checkBlacklist(
      dto,
      slug,
      req.user?.userId,
      req.ip,
      req.get('user-agent'),
      isAdmin,
    );
  }

  /**
   * POST /:slug/blacklist/check
   * Verificar si un documento está en lista negra (versión POST)
   * Alternativa para clientes que prefieren POST
   */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar documento en lista negra (POST)',
    description: 'Verificación de documento - método POST como alternativa a GET',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiBody({ type: CheckBlacklistDto })
  @ApiResponse({
    status: 200,
    description: 'Resultado de verificación',
    type: BlacklistCheckResponseDto,
  })
  async checkBlacklistPost(
    @Param('slug') slug: string,
    @Body() dto: CheckBlacklistDto,
    @Request() req: any,
  ): Promise<BlacklistCheckResponseDto> {
    this.logger.debug(
      `[BLACKLIST CHECK POST] Verificando documento: ${dto.document_number}`,
    );

    const isAdmin = req.user?.role === 'ADMIN';

    return await this.blacklistService.checkBlacklist(
      dto,
      slug,
      req.user?.userId,
      req.ip,
      req.get('user-agent'),
      isAdmin,
    );
  }
}
