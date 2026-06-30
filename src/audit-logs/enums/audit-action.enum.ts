export enum AuditAction {
  CREATED = 'created',
  UPDATED = 'updated',
  DELETED = 'deleted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  STATUS_CHANGED = 'status_changed',
  SIGNED = 'signed',
  RENEWED = 'renewed',
  PERMISSIONS_UPDATED = 'permissions_updated',
  // Eventos de autenticación / acceso
  LOGGED_IN = 'logged_in',
  LOGIN_FAILED = 'login_failed',
  LOGGED_OUT = 'logged_out',
  PASSWORD_CHANGED = 'password_changed',
  // Invitación de acceso al portal (propietario/proveedor)
  INVITED = 'invited',
}
