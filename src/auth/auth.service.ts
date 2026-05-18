import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantsService } from '../tenants/tenants.service';
import { TenantAdminIndexService } from '../tenants/tenant-admin-index.service';
import { Tenant } from '../tenants/metadata/tenant.entity';
import { TenantCountry } from '../tenants/dto/create-tenant.dto';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { BCRYPT_SALT_ROUNDS } from '../common/constants/security.constants';
import { generateSlug } from '../common/utils/slug-generator';
import { quoteIdent } from '../common/utils/sql-identifier';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { AuthLoginContext, AuthSecurityService } from './auth-security.service';

interface User {
  id: number;
  email: string;
  password: string;
  name: string;
  phone?: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AuthRequestUser {
  userId: number;
  email: string;
  role: string;
  tenantSlug: string;
  rentalOwnerId?: number | null;
}

export interface ContractSummary {
  id: number;
  contract_number: string;
  status: string;
  property_title: string | null;
}

export interface LoginResponse {
  access_token: string;
  user: {
    id: number;
    email: string;
    name: string;
    phone?: string;
    role: string;
    tenant_slug: string;
    contract: ContractSummary | null;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private tenantsService: TenantsService,
    private jwtService: JwtService,
    @InjectDataSource() private dataSource: DataSource,
    private notificationsService: NotificationsService,
    private readonly tenantAdminIndexService: TenantAdminIndexService,
    private readonly authSecurityService: AuthSecurityService,
  ) {}

  async validateUser(
    email: string,
    password: string,
    tenantSlug: string,
  ): Promise<User> {
    const tenant = await this.tenantsService.findActiveBySlug(tenantSlug);
    await this.authSecurityService.assertLoginAllowed(
      email,
      tenant.slug,
      AuthLoginContext.TENANT,
    );

    const user = await this.findUserByEmail(email, tenant.schema_name);

    if (!user) {
      await this.authSecurityService.recordFailure({
        email,
        tenantSlug: tenant.slug,
        context: AuthLoginContext.TENANT,
        reason: 'user_not_found',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.authSecurityService.recordFailure({
        email,
        tenantSlug: tenant.slug,
        context: AuthLoginContext.TENANT,
        reason: 'invalid_password',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      await this.authSecurityService.recordInactiveUserAttempt({
        email,
        tenantSlug: tenant.slug,
        context: AuthLoginContext.TENANT,
        userId: user.id,
      });
      throw new UnauthorizedException('User is inactive');
    }

    await this.authSecurityService.recordSuccess({
      email,
      tenantSlug: tenant.slug,
      context: AuthLoginContext.TENANT,
      userId: user.id,
    });

    return user;
  }

  async loginAdmin(email: string, password: string): Promise<LoginResponse> {
    const adminLoginScope = 'admin';
    await this.authSecurityService.assertLoginAllowed(
      email,
      adminLoginScope,
      AuthLoginContext.ADMIN,
    );

    // Buscar admin por email en todos los tenants
    const result = await this.findAdminByEmailAcrossTenants(email);

    if (!result) {
      await this.authSecurityService.recordFailure({
        email,
        tenantSlug: adminLoginScope,
        context: AuthLoginContext.ADMIN,
        reason: 'admin_not_found',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    const { user, tenant } = result;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.authSecurityService.recordFailure({
        email,
        tenantSlug: adminLoginScope,
        context: AuthLoginContext.ADMIN,
        reason: 'invalid_password',
      });
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      await this.authSecurityService.recordInactiveUserAttempt({
        email,
        tenantSlug: tenant.slug,
        context: AuthLoginContext.ADMIN,
        userId: user.id,
      });
      throw new UnauthorizedException('User is inactive');
    }

    // Verificar que sea admin
    if (user.role !== 'ADMIN') {
      await this.authSecurityService.recordFailure({
        email,
        tenantSlug: adminLoginScope,
        context: AuthLoginContext.ADMIN,
        reason: 'non_admin_role',
      });
      throw new UnauthorizedException('Access denied. Admin only.');
    }

    await this.authSecurityService.recordSuccess({
      email,
      tenantSlug: adminLoginScope,
      context: AuthLoginContext.ADMIN,
      userId: user.id,
    });

    const loginResponse = await this.login(user, tenant.slug);

    // Agregar tenant_slug al usuario en la respuesta
    return {
      ...loginResponse,
      user: {
        ...loginResponse.user,
        tenant_slug: tenant.slug,
      },
    };
  }

  /**
   * Autentica a un propietario (role = PROPIETARIO) en el contexto del tenant.
   * Resuelve el rental_owner_id desde rental_owners.primary_email para incluirlo en el JWT.
   */
  async loginOwner(email: string, password: string, tenantSlug: string) {
    const tenant = await this.tenantsService.findActiveBySlug(tenantSlug);
    await this.authSecurityService.assertLoginAllowed(
      email,
      tenant.slug,
      AuthLoginContext.OWNER,
    );

    const user = await this.findUserByEmail(email, tenant.schema_name);

    if (!user) {
      await this.authSecurityService.recordFailure({
        email,
        tenantSlug: tenant.slug,
        context: AuthLoginContext.OWNER,
        reason: 'user_not_found',
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.role !== 'PROPIETARIO') {
      await this.authSecurityService.recordFailure({
        email,
        tenantSlug: tenant.slug,
        context: AuthLoginContext.OWNER,
        reason: 'non_owner_role',
      });
      throw new UnauthorizedException(
        'Acceso denegado: se requiere rol PROPIETARIO',
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.authSecurityService.recordFailure({
        email,
        tenantSlug: tenant.slug,
        context: AuthLoginContext.OWNER,
        reason: 'invalid_password',
      });
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.is_active) {
      await this.authSecurityService.recordInactiveUserAttempt({
        email,
        tenantSlug: tenant.slug,
        context: AuthLoginContext.OWNER,
        userId: user.id,
      });
      throw new UnauthorizedException('Cuenta de propietario inactiva');
    }

    // Resolver rental_owner_id vinculado por email
    const q = quoteIdent(tenant.schema_name);
    const ownerRows: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM ${q}.rental_owners WHERE primary_email = $1 AND is_active = true LIMIT 1`,
      [user.email],
    );

    if (ownerRows.length === 0) {
      await this.authSecurityService.recordFailure({
        email,
        tenantSlug: tenant.slug,
        context: AuthLoginContext.OWNER,
        reason: 'owner_link_not_found',
      });
      throw new UnauthorizedException(
        'Este usuario no está vinculado a ningún propietario activo',
      );
    }

    const rentalOwnerId = ownerRows[0].id;

    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      tenantSlug: tenant.slug,
      rentalOwnerId,
    };

    const access_token = this.jwtService.sign(payload);

    await this.authSecurityService.recordSuccess({
      email,
      tenantSlug: tenant.slug,
      context: AuthLoginContext.OWNER,
      userId: user.id,
    });

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        tenant_slug: tenant.slug,
        rental_owner_id: rentalOwnerId,
      },
    };
  }

  async login(user: User, tenantSlug: string): Promise<LoginResponse> {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      tenantSlug: tenantSlug,
    };

    const access_token = this.jwtService.sign(payload);

    // Obtener contrato activo si el usuario es INQUILINO
    let contract: ContractSummary | null = null;
    if (user.role === 'INQUILINO') {
      const tenant = await this.tenantsService.findActiveBySlug(tenantSlug);
      const q = quoteIdent(tenant.schema_name);
      const contractResult = await this.dataSource.query<ContractSummary[]>(
        `SELECT
          c.id,
          c.contract_number,
          c.status,
          p.title as property_title
        FROM ${q}.contracts c
        LEFT JOIN ${q}.properties p ON c.property_id = p.id
        WHERE c.tenant_id = $1 AND c.status IN ('ACTIVO', 'POR_VENCER')
        ORDER BY c.created_at DESC
        LIMIT 1`,
        [user.id],
      );

      if (contractResult.length > 0) {
        contract = contractResult[0];
      }
    }

    return {
      access_token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        tenant_slug: tenantSlug,
        contract: contract,
      },
    };
  }

  async getMe(user: AuthRequestUser) {
    const tenant = await this.tenantsService.findActiveBySlug(user.tenantSlug);
    const q = quoteIdent(tenant.schema_name);

    // Obtener datos completos del usuario
    const userResult = await this.dataSource.query<
      Array<Pick<User, 'id' | 'name' | 'email' | 'phone' | 'role'>>
    >(`SELECT id, name, email, phone, role FROM ${q}."user" WHERE id = $1`, [
      user.userId,
    ]);

    if (userResult.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    const fullUser = userResult[0];

    // Obtener contrato activo si el usuario es INQUILINO
    let contract: ContractSummary | null = null;
    if (fullUser.role === 'INQUILINO') {
      const contractResult = await this.dataSource.query<ContractSummary[]>(
        `SELECT
          c.id,
          c.contract_number,
          c.status,
          p.title as property_title
        FROM ${q}.contracts c
        LEFT JOIN ${q}.properties p ON c.property_id = p.id
        WHERE c.tenant_id = $1 AND c.status IN ('ACTIVO', 'POR_VENCER', 'BORRADOR')
        ORDER BY c.created_at DESC
        LIMIT 1`,
        [fullUser.id],
      );

      if (contractResult.length > 0) {
        contract = contractResult[0];
      }
    }

    return {
      userId: fullUser.id,
      name: fullUser.name,
      email: fullUser.email,
      phone: fullUser.phone,
      role: fullUser.role,
      tenantSlug: user.tenantSlug,
      contract: contract,
    };
  }

  async register(
    name: string,
    email: string,
    password: string,
    tenantSlug: string,
    phone?: string,
  ) {
    const tenant = await this.tenantsService.findActiveBySlug(tenantSlug);

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const user = await this.createUser(
      {
        name,
        email,
        password: hashedPassword,
        phone,
        role: 'INQUILINO',
        is_active: true,
      },
      tenant.schema_name,
    );

    // Crear notificación para los admins sobre el nuevo usuario registrado
    try {
      const q = quoteIdent(tenant.schema_name);
      const admins = await this.dataSource.query<Array<{ id: number }>>(
        `SELECT id FROM ${q}."user" WHERE role = 'ADMIN'`,
      );

      for (const admin of admins) {
        await this.notificationsService.createForUserInSchema(
          tenant.schema_name,
          admin.id,
          NotificationEventType.USER_REGISTERED,
          'Nuevo usuario registrado',
          `${name} se ha registrado en el sistema`,
          {
            user_id: user.id,
            user_name: name,
            user_email: email,
            user_phone: phone,
            role: 'INQUILINO',
          },
          tenant.slug,
        );
      }
    } catch (error) {
      // No fallar si la notificación no se puede crear
      this.logger.error(
        'Error al crear notificación de registro',
        error instanceof Error ? error.stack : undefined,
      );
    }

    // Retornar sin el password
    const { password: _, ...userWithoutPassword } = user;
    void _;
    return userWithoutPassword;
  }

  async registerAdmin(data: {
    slug?: string;
    company_name: string;
    country: TenantCountry;
    name: string;
    email: string;
    password: string;
    currency?: string;
    locale?: string;
    phone?: string;
  }) {
    const {
      slug: providedSlug,
      company_name,
      country,
      name,
      email,
      password,
      currency = 'BOB',
      locale = 'es-BO',
      phone,
    } = data;

    // 1. Verificar que el email no exista en ningún tenant
    const emailExists = await this.checkEmailExistsAcrossTenants(email);
    if (emailExists) {
      throw new BadRequestException(
        'Email already registered. Please use a different email.',
      );
    }

    // 2. Generar o usar el slug proporcionado
    const slug = providedSlug || generateSlug(company_name);

    // 3. Verificar si ya existe un tenant con ese slug
    try {
      await this.tenantsService.findBySlug(slug);
      // Si no lanza error, ya existe, así que lanzamos excepción
      throw new BadRequestException(
        `Tenant with slug '${slug}' already exists. Please use a different company name or slug.`,
      );
    } catch (error) {
      // Si es NotFoundException, perfecto, no existe
      if (!this.isNotFoundError(error)) {
        throw error; // Si es otro error, relanzarlo
      }
    }

    // 4. Crear el tenant (esto también crea el schema y todas las tablas)
    const tenant = await this.tenantsService.create({
      slug,
      company_name,
      country,
      currency,
      locale,
      is_active: true,
    });

    // 5. Crear el usuario admin
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const user = await this.createUser(
      {
        name,
        email,
        password: hashedPassword,
        phone,
        role: 'ADMIN',
        is_active: true,
      },
      tenant.schema_name,
    );

    await this.tenantAdminIndexService.upsertAdmin(
      email,
      tenant.id,
      tenant.schema_name,
    );

    // 6. Generar token JWT
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      tenantSlug: tenant.slug,
    };

    const access_token = this.jwtService.sign(payload);

    // 7. Retornar todo junto
    const { password: _, ...userWithoutPassword } = user;
    void _;

    return {
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        company_name: tenant.company_name,
        currency: tenant.currency,
        locale: tenant.locale,
      },
      user: userWithoutPassword,
      access_token,
    };
  }

  // Métodos privados para manejar usuarios con queries SQL
  private async findUserByEmail(
    email: string,
    schemaName?: string,
  ): Promise<User | null> {
    const userTable = schemaName
      ? `${quoteIdent(schemaName)}."user"`
      : '"user"';
    const result = await this.dataSource.query<User[]>(
      `SELECT * FROM ${userTable} WHERE email = $1`,
      [email],
    );
    return result.length > 0 ? result[0] : null;
  }

  private async createUser(
    data: {
      name: string;
      email: string;
      password: string;
      phone?: string;
      role: string;
      is_active: boolean;
    },
    schemaName?: string,
  ): Promise<User> {
    const { name, email, password, phone, role, is_active } = data;
    const userTable = schemaName
      ? `${quoteIdent(schemaName)}."user"`
      : '"user"';

    const result = await this.dataSource.query<User[]>(
      `INSERT INTO ${userTable} (email, password, name, phone, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [email, password, name, phone || null, role, is_active],
    );

    return result[0];
  }

  /**
   * Busca un usuario admin por email en todos los tenants
   * Retorna el usuario y el tenant al que pertenece
   */
  private async findAdminByEmailAcrossTenants(
    email: string,
  ): Promise<{ user: User; tenant: Tenant } | null> {
    const indexedTenants = await this.dataSource.query<Tenant[]>(
      `SELECT t.*
       FROM public.admin_index ai
       JOIN public.tenant t ON t.id = ai.tenant_id
       WHERE ai.email = LOWER($1)
         AND t.is_active = true
       ORDER BY t.id ASC`,
      [email],
    );

    const tenants =
      indexedTenants.length > 0
        ? indexedTenants
        : await this.dataSource.query<Tenant[]>(
            'SELECT * FROM public.tenant WHERE is_active = true',
          );

    for (const tenant of tenants) {
      try {
        const users = await this.dataSource.query<User[]>(
          `SELECT *
           FROM ${quoteIdent(tenant.schema_name)}."user"
           WHERE LOWER(email) = LOWER($1)
             AND role = 'ADMIN'
           LIMIT 1`,
          [email],
        );
        const user = users[0] ?? null;

        if (user) {
          return { user, tenant };
        }
      } catch (error) {
        // El schema del tenant no existe o no está inicializado, se omite
        this.logger.warn(
          `No se pudo consultar admin en schema ${tenant.schema_name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    return null;
  }

  /**
   * Verifica si un email ya existe en cualquier tenant
   * Usado para validar que los emails sean únicos globalmente
   */
  private async checkEmailExistsAcrossTenants(email: string): Promise<boolean> {
    const tenants = await this.dataSource.query<
      Array<Pick<Tenant, 'schema_name'>>
    >('SELECT schema_name FROM tenant WHERE is_active = true');

    for (const tenant of tenants) {
      try {
        const user = await this.findUserByEmail(email, tenant.schema_name);
        if (user) {
          return true;
        }
      } catch {
        // El schema del tenant no existe o no está inicializado, se omite
      }
    }

    return false;
  }

  private isNotFoundError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('status' in error)) {
      return false;
    }

    return (error as { status?: unknown }).status === 404;
  }
}
