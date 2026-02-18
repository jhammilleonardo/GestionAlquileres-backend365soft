import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { TenantsService } from '../tenants/tenants.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { generateSlug } from '../common/utils/slug-generator';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';

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

@Injectable()
export class AuthService {
  constructor(
    private tenantsService: TenantsService,
    private jwtService: JwtService,
    @InjectDataSource() private dataSource: DataSource,
    private notificationsService: NotificationsService,
  ) {}

  async validateUser(email: string, password: string, tenantSlug: string) {
    // Obtener el tenant primero para setear el schema correcto
    const tenant = await this.tenantsService.findBySlug(tenantSlug);

    // Setear el schema para esta query
    await this.dataSource.query(`SET search_path TO ${tenant.schema_name}`);

    const user = await this.findUserByEmail(email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User is inactive');
    }

    return user;
  }

  async loginAdmin(email: string, password: string) {
    // Buscar admin por email en todos los tenants
    const result = await this.findAdminByEmailAcrossTenants(email);

    if (!result) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { user, tenant } = result;

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User is inactive');
    }

    // Verificar que sea admin
    if (user.role !== 'ADMIN') {
      throw new UnauthorizedException('Access denied. Admin only.');
    }

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

  async login(user: any, tenantSlug: string) {
    const payload = {
      email: user.email,
      sub: user.id,
      role: user.role,
      tenantSlug: tenantSlug,
    };

    const access_token = this.jwtService.sign(payload);

    // Obtener contrato activo si el usuario es INQUILINO
    let contract = null;
    if (user.role === 'INQUILINO') {
      const contractResult = await this.dataSource.query(
        `SELECT
          c.id,
          c.contract_number,
          c.status,
          p.title as property_title
        FROM contracts c
        LEFT JOIN properties p ON c.property_id = p.id
        WHERE c.tenant_id = $1 AND c.status IN ('ACTIVO', 'POR_VENCER')
        ORDER BY c.created_at DESC
        LIMIT 1`,
        [user.id]
      );

      if (contractResult && contractResult.length > 0) {
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

  async register(
    name: string,
    email: string,
    password: string,
    tenantSlug: string,
    phone?: string,
  ) {
    // Obtener el tenant primero para setear el schema correcto
    const tenant = await this.tenantsService.findBySlug(tenantSlug);

    // Setear el schema para esta query
    await this.dataSource.query(`SET search_path TO ${tenant.schema_name}`);

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await this.createUser({
      name,
      email,
      password: hashedPassword,
      phone,
      role: 'INQUILINO',
      is_active: true,
    });

    // Crear notificación para los admins sobre el nuevo usuario registrado
    try {
      // Obtener todos los admins del tenant
      await this.dataSource.query(`SET search_path TO ${tenant.schema_name}`);
      const admins = await this.dataSource.query(
        `SELECT id FROM "user" WHERE role = 'ADMIN'`,
      );

      for (const admin of admins) {
        await this.notificationsService.createForUser(
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
        );
      }
    } catch (error) {
      // No fallar si la notificación no se puede crear
      console.error('Error al crear notificación:', error.message);
    }

    // Retornar sin el password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async registerAdmin(data: {
    slug?: string;
    company_name: string;
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
      if (error.status !== 404) {
        throw error; // Si es otro error, relanzarlo
      }
    }

    // 4. Crear el tenant (esto también crea el schema y todas las tablas)
    const tenant = await this.tenantsService.create({
      slug,
      company_name,
      currency,
      locale,
      is_active: true,
    });

    // 4. Cambiar al schema del nuevo tenant
    await this.dataSource.query(`SET search_path TO ${tenant.schema_name}`);

    // 5. Crear el usuario admin
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await this.createUser({
      name,
      email,
      password: hashedPassword,
      phone,
      role: 'ADMIN',
      is_active: true,
    });

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
  private async findUserByEmail(email: string): Promise<User | null> {
    const result = await this.dataSource.query(
      'SELECT * FROM "user" WHERE email = $1',
      [email],
    );
    return result.length > 0 ? result[0] : null;
  }

  private async createUser(data: {
    name: string;
    email: string;
    password: string;
    phone?: string;
    role: string;
    is_active: boolean;
  }): Promise<User> {
    const { name, email, password, phone, role, is_active } = data;

    const result = await this.dataSource.query(
      `INSERT INTO "user" (email, password, name, phone, role, is_active, created_at, updated_at)
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
  ): Promise<{ user: User; tenant: any } | null> {
    // Obtener todos los tenants activos
    const tenants = await this.dataSource.query(
      'SELECT * FROM tenant WHERE is_active = true',
    );

    // Buscar el email en cada tenant
    for (const tenant of tenants) {
      await this.dataSource.query(`SET search_path TO ${tenant.schema_name}`);
      const user = await this.findUserByEmail(email);

      if (user && user.role === 'ADMIN') {
        return { user, tenant };
      }
    }

    return null;
  }

  /**
   * Verifica si un email ya existe en cualquier tenant
   * Usado para validar que los emails sean únicos globalmente
   */
  private async checkEmailExistsAcrossTenants(email: string): Promise<boolean> {
    const tenants = await this.dataSource.query(
      'SELECT schema_name FROM tenant WHERE is_active = true',
    );

    for (const tenant of tenants) {
      await this.dataSource.query(`SET search_path TO ${tenant.schema_name}`);
      const user = await this.findUserByEmail(email);
      if (user) {
        return true;
      }
    }

    return false;
  }
}
