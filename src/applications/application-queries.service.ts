import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { TenantsService } from '../tenants/tenants.service';
import type { ApplicationResult } from './applications.service';
import { ApplicationStatus } from './enums/application-status.enum';

@Injectable()
export class ApplicationQueriesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  async findAll(
    tenantSlug: string,
    status?: ApplicationStatus,
  ): Promise<ApplicationResult[]> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);
    let query = `
      SELECT ra.*, p.title as property_title, u.name as applicant_name, u.email as applicant_email
      FROM ${schemaPrefix}rental_applications ra
      JOIN ${schemaPrefix}properties p ON ra.property_id = p.id
      JOIN ${schemaPrefix}"user" u ON ra.applicant_id = u.id
      WHERE 1=1
    `;
    const params: (string | number)[] = [];

    if (status) {
      query += ' AND ra.status = $1';
      params.push(status);
    }

    query += ' ORDER BY ra.created_at DESC';

    return this.dataSource.query<ApplicationResult[]>(query, params);
  }

  async findOne(id: number, tenantSlug: string): Promise<ApplicationResult> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);
    const result = await this.dataSource.query<ApplicationResult[]>(
      `SELECT ra.*, p.title as property_title, u.name as applicant_name, u.email as applicant_email
       FROM ${schemaPrefix}rental_applications ra
       JOIN ${schemaPrefix}properties p ON ra.property_id = p.id
       JOIN ${schemaPrefix}"user" u ON ra.applicant_id = u.id
       WHERE ra.id = $1`,
      [id],
    );

    if (result.length === 0) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    return result[0];
  }

  async findByApplicant(
    userId: number,
    tenantSlug: string,
  ): Promise<ApplicationResult[]> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);
    return this.dataSource.query<ApplicationResult[]>(
      `SELECT ra.*, p.title as property_title
       FROM ${schemaPrefix}rental_applications ra
       JOIN ${schemaPrefix}properties p ON ra.property_id = p.id
       WHERE ra.applicant_id = $1
       ORDER BY ra.created_at DESC`,
      [userId],
    );
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
