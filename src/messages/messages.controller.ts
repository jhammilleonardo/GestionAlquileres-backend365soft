import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MessagesService } from './messages.service';
import { SendMessageDto } from './dto/send-message.dto';
import { BroadcastMessageDto } from './dto/broadcast-message.dto';
import { messageMulterConfig } from '../common/utils/multer.config';

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
      user.role,
      otherId,
      parsedLimit,
      parsedBefore,
    );
  }

  @Post('upload')
  @ApiOperation({ summary: 'Subir adjuntos (imágenes, video, PDF) del chat' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FilesInterceptor('files', 3, messageMulterConfig))
  uploadFiles(
    @CurrentUser() user: JwtUser,
    @Param('slug') slug: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No se enviaron archivos');
    }
    return this.messagesService.saveUploadedFiles(files, user.userId, slug);
  }

  @Post()
  @ApiOperation({ summary: 'Enviar un mensaje a un usuario' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  send(
    @CurrentUser() user: JwtUser,
    @Param('slug') slug: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.messagesService.send(
      user.userId,
      user.role,
      dto.recipient_id,
      dto.body ?? '',
      dto.files ?? [],
      slug,
    );
  }

  @Post('broadcast')
  @ApiOperation({
    summary: 'Enviar un mensaje a todos los inquilinos y propietarios',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  broadcast(@CurrentUser() user: JwtUser, @Body() dto: BroadcastMessageDto) {
    return this.messagesService.broadcast(user.userId, user.role, dto.body);
  }
}
