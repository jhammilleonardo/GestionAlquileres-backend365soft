import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Request,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';
import {
  MarkAllNotificationsReadResponseDto,
  NotificationMessageResponseDto,
  NotificationResponseDto,
  NotificationStatsResponseDto,
} from './dto/notification-response.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(':slug/notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Obtener todas las notificaciones del usuario autenticado
   * El rol (ADMIN o USER) se detecta automáticamente desde el JWT
   */
  @Get()
  @ApiOperation({ summary: 'Obtener mis notificaciones' })
  @ApiParam({ name: 'slug', description: 'Tenant slug', example: 'mi-empresa' })
  @ApiQuery({
    name: 'is_read',
    required: false,
    description: 'Filtrar por leídas/no leídas',
  })
  @ApiQuery({
    name: 'event_type',
    required: false,
    description: 'Filtrar por tipo de evento',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Cantidad de resultados',
    example: 20,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    description: 'Para paginación',
    example: 0,
  })
  @ApiOkResponse({ type: NotificationResponseDto, isArray: true })
  async findAll(
    @Param('slug') _slug: string,
    @Request() req: TenantRequest,
    @Query('is_read') isRead?: string,
    @Query('event_type') eventType?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    const userId = req.user!.userId;
    const safeLimit = Math.min(Math.max(limit ?? 20, 1), 100);
    const safeOffset = Math.max(offset ?? 0, 0);

    return await this.notificationsService.findAll(userId, {
      is_read: isRead !== undefined ? isRead === 'true' : undefined,
      event_type: eventType,
      limit: safeLimit,
      offset: safeOffset,
    });
  }

  /**
   * Obtener estadísticas de notificaciones
   * IMPORTANTE: Esta ruta debe ir ANTES de @Get(':id') para evitar conflictos
   */
  @Get('stats')
  @ApiOperation({ summary: 'Obtener estadísticas de notificaciones' })
  @ApiOkResponse({ type: NotificationStatsResponseDto })
  async getStats(@Request() req: TenantRequest) {
    const userId = req.user!.userId;
    return await this.notificationsService.getStats(userId);
  }

  /**
   * Marcar todas las notificaciones como leídas
   * IMPORTANTE: Esta ruta debe ir ANTES de @Patch(':id/read') para evitar conflictos
   */
  @Patch('read-all')
  @ApiOperation({ summary: 'Marcar todas las notificaciones como leídas' })
  @ApiOkResponse({ type: MarkAllNotificationsReadResponseDto })
  async markAllAsRead(@Request() req: TenantRequest) {
    const userId = req.user!.userId;
    const result = await this.notificationsService.markAllAsRead(userId);
    return {
      ...result,
      message: `${result.updated_count} notificaciones marcadas como leídas`,
    };
  }

  /**
   * Obtener una notificación por ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener detalle de notificación' })
  @ApiParam({ name: 'id', description: 'ID de notificación', example: 1 })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiNotFoundResponse({ description: 'Notificación no encontrada' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    const userId = req.user!.userId;
    return await this.notificationsService.findOne(id, userId);
  }

  /**
   * Marcar una notificación como leída
   */
  @Patch(':id/read')
  @ApiOperation({ summary: 'Marcar notificación como leída' })
  @ApiParam({ name: 'id', description: 'ID de notificación', example: 1 })
  @ApiOkResponse({ type: NotificationResponseDto })
  @ApiNotFoundResponse({ description: 'Notificación no encontrada' })
  async markAsRead(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    const userId = req.user!.userId;
    const notification = await this.notificationsService.markAsRead(id, userId);
    return {
      ...notification,
      message: 'Notificación marcada como leída',
    };
  }

  /**
   * Eliminar una notificación
   */
  @Delete(':id')
  @ApiOperation({ summary: 'Eliminar notificación' })
  @ApiParam({ name: 'id', description: 'ID de notificación', example: 1 })
  @ApiOkResponse({ type: NotificationMessageResponseDto })
  @ApiNotFoundResponse({ description: 'Notificación no encontrada' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    const userId = req.user!.userId;
    await this.notificationsService.remove(id, userId);
    return { message: 'Notificación eliminada exitosamente' };
  }
}
