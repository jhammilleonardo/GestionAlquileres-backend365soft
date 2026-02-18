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
}
