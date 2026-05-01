import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../common/constants/security.constants';
import {
  CreateEmployeeDto,
  ModulePermissionsDto,
} from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { quoteIdent } from '../common/utils/sql-identifier';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private notificationsService: NotificationsService,
    private auditLogsService: AuditLogsService,
  ) {}

  /**
   * Lista todos los empleados del tenant con su rol, permisos y última conexión
   */
  async findAll(schemaName: string): Promise<any[]> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const employees = await this.dataSource.query(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.phone,
         u.role,
         u.is_active,
         u.last_connection,
         u.created_at,
         u.updated_at,
         COALESCE(
           json_agg(
             json_build_object(
               'module', ep.module,
               'can_view', ep.can_view,
               'can_create', ep.can_create,
               'can_edit', ep.can_edit,
               'can_delete', ep.can_delete
             ) ORDER BY ep.module
           ) FILTER (WHERE ep.id IS NOT NULL),
           '[]'::json
         ) AS permissions
       FROM ${quoteIdent(schemaName)}."user" u
       LEFT JOIN ${quoteIdent(schemaName)}.employee_permissions ep ON ep.user_id = u.id
       WHERE u.role = 'EMPLEADO'
       GROUP BY u.id
       ORDER BY u.created_at DESC`,
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return employees;
  }

  /**
   * Crea un nuevo empleado con sus permisos iniciales y envía notificación interna
   */
  async create(
    schemaName: string,
    createEmployeeDto: CreateEmployeeDto,
    adminId: number,
  ): Promise<any> {
    const { name, email, password, phone, permissions } = createEmployeeDto;

    // Verificar que el email no esté ya en uso
    const existing = await this.dataSource.query(
      `SELECT id FROM ${quoteIdent(schemaName)}."user" WHERE email = $1`,
      [email],
    );
    if (existing.length > 0) {
      throw new ConflictException('El email ya está registrado en este tenant');
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    // Crear el usuario con rol EMPLEADO
    const result = await this.dataSource.query(
      `INSERT INTO ${quoteIdent(schemaName)}."user" (email, password, name, phone, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'EMPLEADO', true, NOW(), NOW())
       RETURNING id, email, name, phone, role, is_active, created_at, updated_at`,
      [email, hashedPassword, name, phone || null],
    );

    const employee = result[0];

    // Crear permisos iniciales si se proporcionaron
    if (permissions && permissions.length > 0) {
      await this.upsertPermissions(schemaName, employee.id, permissions);
    }

    // Obtener el empleado completo con permisos
    const fullEmployee = await this.findOne(schemaName, employee.id);

    // Enviar notificación interna al empleado con sus credenciales
    try {
      await this.notificationsService.createForUser(
        employee.id,
        NotificationEventType.EMPLOYEE_CREATED,
        'Bienvenido al sistema',
        'Tu cuenta ha sido creada exitosamente. El administrador te proporcionará tus credenciales de acceso.',
        {
          employee_id: employee.id,
          employee_name: name,
          created_by: adminId,
        },
      );

      // Notificar al admin que creó al empleado
      await this.notificationsService.createForUser(
        adminId,
        NotificationEventType.EMPLOYEE_CREATED,
        'Empleado creado exitosamente',
        `Se ha creado la cuenta del empleado ${name} (${email})`,
        {
          employee_id: employee.id,
          employee_name: name,
          employee_email: email,
        },
      );
    } catch (error) {
      // No fallar si la notificación no se puede crear
      console.error(
        'Error al crear notificación de empleado:',
        (error as Error).message,
      );
    }

    await this.auditLogsService.log({
      userId: adminId,
      action: AuditAction.CREATED,
      entityType: 'employee',
      entityId: employee.id as number,
      newValues: { email, name, role: 'EMPLEADO' },
    });

    return fullEmployee;
  }

  /**
   * Obtiene un empleado por ID
   */
  async findOne(schemaName: string, id: number): Promise<any> {
    const result = await this.dataSource.query(
      `SELECT
         u.id,
         u.email,
         u.name,
         u.phone,
         u.role,
         u.is_active,
         u.last_connection,
         u.created_at,
         u.updated_at,
         COALESCE(
           json_agg(
             json_build_object(
               'module', ep.module,
               'can_view', ep.can_view,
               'can_create', ep.can_create,
               'can_edit', ep.can_edit,
               'can_delete', ep.can_delete
             ) ORDER BY ep.module
           ) FILTER (WHERE ep.id IS NOT NULL),
           '[]'::json
         ) AS permissions
       FROM ${quoteIdent(schemaName)}."user" u
       LEFT JOIN ${quoteIdent(schemaName)}.employee_permissions ep ON ep.user_id = u.id
       WHERE u.id = $1 AND u.role = 'EMPLEADO'
       GROUP BY u.id`,
      [id],
    );

    if (result.length === 0) {
      throw new NotFoundException(`Empleado con ID ${id} no encontrado`);
    }

    return result[0];
  }

  /**
   * Actualiza los datos básicos del empleado
   */
  async update(
    schemaName: string,
    id: number,
    updateEmployeeDto: UpdateEmployeeDto,
  ): Promise<any> {
    await this.findOne(schemaName, id);

    const { name, phone, is_active } = updateEmployeeDto;

    const setClauses: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (phone !== undefined) {
      setClauses.push(`phone = $${paramIndex++}`);
      params.push(phone);
    }
    if (is_active !== undefined) {
      setClauses.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }

    if (setClauses.length === 0) {
      return this.findOne(schemaName, id);
    }

    setClauses.push(`updated_at = NOW()`);
    params.push(id);

    await this.dataSource.query(
      `UPDATE ${quoteIdent(schemaName)}."user"
       SET ${setClauses.join(', ')}
       WHERE id = $${paramIndex}`,
      params,
    );

    return this.findOne(schemaName, id);
  }

  /**
   * Actualiza los permisos del empleado por módulo
   */
  async updatePermissions(
    schemaName: string,
    id: number,
    permissions: ModulePermissionsDto[],
    performedBy: number = 0,
  ): Promise<any> {
    await this.findOne(schemaName, id);
    await this.upsertPermissions(schemaName, id, permissions);

    await this.auditLogsService.log({
      userId: performedBy,
      action: AuditAction.PERMISSIONS_UPDATED,
      entityType: 'employee',
      entityId: id,
      newValues: {
        permissions: permissions as unknown as Record<string, unknown>[],
      },
    });

    return this.findOne(schemaName, id);
  }

  /**
   * Desactiva el acceso del empleado (soft delete)
   */
  async remove(
    schemaName: string,
    id: number,
    performedBy: number = 0,
  ): Promise<{ message: string }> {
    await this.findOne(schemaName, id);

    await this.dataSource.query(
      `UPDATE ${quoteIdent(schemaName)}."user"
       SET is_active = false, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );

    await this.auditLogsService.log({
      userId: performedBy,
      action: AuditAction.DELETED,
      entityType: 'employee',
      entityId: id,
      newValues: { is_active: false },
    });

    return {
      message: `Acceso del empleado con ID ${id} desactivado correctamente`,
    };
  }

  /**
   * Retorna los módulos que el usuario logueado puede ver.
   * Usado por el frontend para construir el sidebar dinámico.
   */
  async getMyPermissions(
    schemaName: string,
    user: { userId: number; role: string },
  ): Promise<{ role: string; allowedModules: string[] }> {
    const ALL_MODULES = [
      'properties',
      'users',
      'contracts',
      'payments',
      'maintenance',
      'reports',
      'config',
      'employees',
    ];
    const TECNICO_MODULES = ['maintenance'];

    if (user.role === 'ADMIN' || user.role === 'SUPERADMIN') {
      return { role: user.role, allowedModules: ALL_MODULES };
    }

    if (user.role === 'TECNICO') {
      return { role: user.role, allowedModules: TECNICO_MODULES };
    }

    if (user.role === 'EMPLEADO') {
      const rows: Array<{ module: string }> = await this.dataSource.query(
        `SELECT module FROM ${quoteIdent(schemaName)}.employee_permissions
         WHERE user_id = $1 AND can_view = true`,
        [user.userId],
      );
      return { role: user.role, allowedModules: rows.map((r) => r.module) };
    }

    return { role: user.role, allowedModules: [] };
  }

  /**
   * Inserta o actualiza permisos (upsert) para un empleado
   */
  private async upsertPermissions(
    schemaName: string,
    userId: number,
    permissions: ModulePermissionsDto[],
  ): Promise<void> {
    for (const perm of permissions) {
      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schemaName)}.employee_permissions
           (user_id, module, can_view, can_create, can_edit, can_delete, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (user_id, module)
         DO UPDATE SET
           can_view = EXCLUDED.can_view,
           can_create = EXCLUDED.can_create,
           can_edit = EXCLUDED.can_edit,
           can_delete = EXCLUDED.can_delete,
           updated_at = NOW()`,
        [
          userId,
          perm.module,
          perm.can_view ?? false,
          perm.can_create ?? false,
          perm.can_edit ?? false,
          perm.can_delete ?? false,
        ],
      );
    }
  }
}
