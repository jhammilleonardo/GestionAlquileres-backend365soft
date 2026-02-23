import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface User {
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

export type UserWithoutPassword = Omit<User, 'password'>;

@Injectable()
export class UsersService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async findAll(schemaName: string): Promise<UserWithoutPassword[]> {
    const result = await this.dataSource.query(
      `SELECT id, email, name, phone, role, is_active, created_at, updated_at
       FROM "${schemaName}"."user"
       ORDER BY created_at DESC`,
    );

    return result;
  }

  async findAdmins(): Promise<UserWithoutPassword[]> {
    // Nota: El schema se maneja por el search_path en el middleware
    const result = await this.dataSource.query(
      `SELECT id, email, name, role
       FROM "user"
       WHERE role = 'ADMIN' AND is_active = true`,
    );
    return result;
  }

  async findTenants(filters?: {
    status?: 'approved' | 'pending' | 'all';
    hasActiveContract?: boolean;
  }): Promise<UserWithoutPassword[]> {
    let query = `
      SELECT u.id, u.email, u.name, u.phone, u.role, u.is_active, u.created_at,
             COUNT(DISTINCT ra.id) as application_count,
             COUNT(DISTINCT CASE WHEN ra.status = 'APROBADA' THEN ra.id END) as approved_applications,
             COUNT(DISTINCT CASE WHEN c.status = 'ACTIVO' THEN c.id END) as active_contracts
      FROM "user" u
      LEFT JOIN rental_applications ra ON u.id = ra.applicant_id
      LEFT JOIN contracts c ON u.id = c.tenant_id AND c.status = 'ACTIVO'
      WHERE u.role = 'INQUILINO' AND u.is_active = true
    `;

    if (filters?.status === 'approved') {
      query += ` AND EXISTS (SELECT 1 FROM rental_applications ra2 WHERE ra2.applicant_id = u.id AND ra2.status = 'APROBADA')`;
    } else if (filters?.status === 'pending') {
      query += ` AND EXISTS (SELECT 1 FROM rental_applications ra2 WHERE ra2.applicant_id = u.id AND ra2.status = 'PENDIENTE')`;
    }

    if (filters?.hasActiveContract === true) {
      query += ` AND EXISTS (SELECT 1 FROM contracts c2 WHERE c2.tenant_id = u.id AND c2.status = 'ACTIVO')`;
    } else if (filters?.hasActiveContract === false) {
      query += ` AND NOT EXISTS (SELECT 1 FROM contracts c2 WHERE c2.tenant_id = u.id AND c2.status = 'ACTIVO')`;
    }

    query += ` GROUP BY u.id ORDER BY u.created_at DESC`;

    const result = await this.dataSource.query(query);
    return result;
  }

  async findTenantById(id: number): Promise<UserWithoutPassword | null> {
    const result = await this.dataSource.query(
      `SELECT id, email, name, phone, role, is_active, created_at, updated_at
       FROM "user"
       WHERE id = $1 AND role = 'INQUILINO'`,
      [id],
    );

    return result.length > 0 ? result[0] : null;
  }
}
