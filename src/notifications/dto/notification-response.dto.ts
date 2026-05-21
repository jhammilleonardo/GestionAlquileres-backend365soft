import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NotificationResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 12 })
  user_id: number;

  @ApiProperty({ example: 'payment.approved' })
  event_type: string;

  @ApiProperty({ example: 'Pago aprobado' })
  title: string;

  @ApiProperty({ example: 'Tu pago fue aprobado.' })
  message: string;

  @ApiProperty({ example: { payment_id: 10 } })
  metadata: Record<string, unknown>;

  @ApiProperty({ example: false })
  is_read: boolean;

  @ApiPropertyOptional({ example: null, nullable: true })
  read_at: Date | null;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  created_at: Date;
}

export class NotificationStatsResponseDto {
  @ApiProperty({ example: 20 })
  total: number;

  @ApiProperty({ example: 5 })
  unread: number;

  @ApiProperty({ example: { 'payment.approved': 3 } })
  by_type: Record<string, number>;
}

export class NotificationMessageResponseDto {
  @ApiProperty({ example: 'Notificación eliminada exitosamente' })
  message: string;
}

export class MarkAllNotificationsReadResponseDto {
  @ApiProperty({ example: 5 })
  updated_count: number;

  @ApiProperty({ example: '5 notificaciones marcadas como leídas' })
  message: string;
}
