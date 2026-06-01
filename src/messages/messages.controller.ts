import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { BroadcastMessageDto } from './dto/broadcast-message.dto';

interface JwtUser {
  userId: number;
  role: string;
  tenantSlug: string;
}

@ApiTags('Mensajería interna')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(':slug/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('threads')
  @ApiOperation({ summary: 'Bandeja de entrada: hilos del usuario' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  getThreads(@CurrentUser() user: JwtUser) {
    return this.messagesService.getThreads(user.userId);
  }

  @Get('recipients')
  @ApiOperation({ summary: 'Destinatarios posibles según el rol' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  getRecipients(@CurrentUser() user: JwtUser) {
    return this.messagesService.getRecipients(user.role);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Cantidad de mensajes no leídos' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  unreadCount(@CurrentUser() user: JwtUser) {
    return this.messagesService.unreadCount(user.userId);
  }

  @Get('thread/:userId')
  @ApiOperation({ summary: 'Conversación con un usuario (marca como leído)' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'userId', type: Number })
  getThread(
    @CurrentUser() user: JwtUser,
    @Param('userId', ParseIntPipe) otherId: number,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ) {
    const parsedLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const parsedBefore = before ? Number(before) : undefined;
    return this.messagesService.getThread(
      user.userId,
      otherId,
      parsedLimit,
      parsedBefore,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Enviar un mensaje a un usuario' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  send(@CurrentUser() user: JwtUser, @Body() dto: SendMessageDto) {
    return this.messagesService.send(user.userId, dto.recipient_id, dto.body);
  }

  @Post('broadcast')
  @ApiOperation({
    summary: 'Enviar un mensaje a todos los inquilinos y propietarios',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  broadcast(@CurrentUser() user: JwtUser, @Body() dto: BroadcastMessageDto) {
    return this.messagesService.broadcast(user.userId, dto.body);
  }
}
