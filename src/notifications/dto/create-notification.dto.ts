import {
  IsEnum,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsObject,
} from 'class-validator';

export enum NotificationEventType {
  // Mantenimiento
  MAINTENANCE_REQUEST_CREATED = 'maintenance.request.created',
  MAINTENANCE_STATUS_CHANGED = 'maintenance.status.changed',
  MAINTENANCE_MESSAGE_RECEIVED = 'maintenance.message.received',
  MAINTENANCE_ASSIGNED = 'maintenance.assigned',
  MAINTENANCE_COMPLETED = 'maintenance.completed',
  // Propiedades
  PROPERTY_STATUS_CHANGED = 'property.status.changed',
  PROPERTY_AVAILABLE = 'property.available',
  // Usuarios
  USER_REGISTERED = 'user.registered',
  USER_PASSWORD_CHANGED = 'user.password.changed',
  // Solicitudes de Alquiler
  APPLICATION_CREATED = 'application.created',
  APPLICATION_STATUS_CHANGED = 'application.status.changed',
}

export class CreateNotificationDto {
  @IsEnum(NotificationEventType)
  event_type: NotificationEventType;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;
}
