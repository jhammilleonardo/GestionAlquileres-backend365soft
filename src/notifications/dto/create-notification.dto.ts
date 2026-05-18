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
  // Pagos
  PAYMENT_CREATED = 'payment.created',
  PAYMENT_APPROVED = 'payment.approved',
  PAYMENT_REJECTED = 'payment.rejected',
  // Contratos
  CONTRACT_CREATED = 'contract.created',
  CONTRACT_SIGNED = 'contract.signed',
  CONTRACT_EXPIRING = 'contract.expiring',
  CONTRACT_ACTIVATED = 'contract.activated',
  CONTRACT_EXPIRING_60 = 'contract.expiring.60',
  CONTRACT_EXPIRING_30 = 'contract.expiring.30',
  CONTRACT_EXPIRING_15 = 'contract.expiring.15',
  // Empleados
  EMPLOYEE_CREATED = 'employee.created',
  // Leads de Propiedades
  PROPERTY_LEAD_RECEIVED = 'property.lead.received',
  // Infracciones
  VIOLATION_NOTIFIED = 'violation.notified',
  // Ciclo de vida
  INSPECTION_MOVE_OUT_COMPLETED = 'inspection.move_out.completed',
  MAINTENANCE_UNASSIGNED_REMINDER = 'maintenance.unassigned_reminder',
  // Facturación automática
  PAYMENT_REMINDER = 'payment.reminder',
  LATE_FEE_APPLIED = 'payment.late_fee_applied',
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
  metadata?: Record<string, unknown>;
}
