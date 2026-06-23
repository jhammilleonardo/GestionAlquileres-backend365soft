import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { quoteIdent } from '../common/utils/sql-identifier';
import { CreatePropertyContactDto } from './dto/create-property-contact.dto';

interface PropertyLeadPropertyRow {
  id: number;
  title: string;
}

export interface PropertyLeadRow {
  id: number;
  property_id: number;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  inquiry_type: string;
  availability: string | null;
  created_at: Date;
  status: string;
}

interface AdminRow {
  id: number;
}

@Injectable()
export class PropertyLeadsService {
  private readonly logger = new Logger(PropertyLeadsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createPropertyContact(
    propertyId: number,
    contactDto: CreatePropertyContactDto,
    tenantSlug: string,
    userIP?: string,
  ): Promise<PropertyLeadRow> {
    // Honeypot: si el campo señuelo viene relleno, es un bot. Devolvemos una
    // respuesta de éxito sin persistir nada ni notificar (no informar al bot).
    if (contactDto.website && contactDto.website.trim().length > 0) {
      this.logger.debug(`Lead honeypot descartado en sitio ${tenantSlug}`);
      return {
        id: 0,
        property_id: propertyId,
        name: contactDto.name,
        email: contactDto.email,
        phone: contactDto.phone ?? null,
        message: contactDto.message,
        inquiry_type: contactDto.inquiry_type || 'general',
        availability: contactDto.availability ?? null,
        created_at: new Date(),
        status: 'PENDING',
      };
    }

    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);

    const property = await this.findProperty(propertyId, schemaName);

    try {
      const result = await this.dataSource.query<PropertyLeadRow[]>(
        `INSERT INTO ${schemaPrefix}property_leads
         (property_id, name, email, phone, message, inquiry_type, availability, status, user_ip, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
         RETURNING id, property_id, name, email, phone, message, inquiry_type, availability, created_at, status`,
        [
          propertyId,
          contactDto.name,
          contactDto.email,
          contactDto.phone,
          contactDto.message,
          contactDto.inquiry_type || 'general',
          contactDto.availability || null,
          'PENDING',
          userIP,
        ],
      );

      const lead = result[0];
      await this.notifyAdmins(property, contactDto, tenantSlug, schemaName);

      return lead;
    } catch (error) {
      if (this.isForeignKeyViolation(error)) {
        throw new BadRequestException('Invalid property ID');
      }
      throw error;
    }
  }

  private async findProperty(
    propertyId: number,
    schemaName: string,
  ): Promise<PropertyLeadPropertyRow> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    const properties = await this.dataSource.query<PropertyLeadPropertyRow[]>(
      `SELECT id, title FROM ${schemaPrefix}properties WHERE id = $1`,
      [propertyId],
    );

    if (properties.length === 0) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }

    return properties[0];
  }

  private async notifyAdmins(
    property: PropertyLeadPropertyRow,
    contactDto: CreatePropertyContactDto,
    tenantSlug: string,
    schemaName: string,
  ): Promise<void> {
    try {
      const schemaPrefix = this.schemaPrefix(schemaName);
      const adminRows = await this.dataSource.query<AdminRow[]>(
        `SELECT id FROM ${schemaPrefix}"user" WHERE role = 'ADMIN' AND is_active = true`,
      );
      const adminIds = adminRows.map((row) => row.id);

      if (adminIds.length === 0) {
        return;
      }

      await Promise.all(
        adminIds.map((adminId) =>
          this.notificationsService.createForUserInSchema(
            schemaName,
            adminId,
            NotificationEventType.PROPERTY_LEAD_RECEIVED,
            `New Lead: ${contactDto.name}`,
            `New contact inquiry for ${property.title}: ${contactDto.message.substring(0, 50)}...`,
            {
              property_id: property.id,
              property_title: property.title,
              lead_name: contactDto.name,
              lead_email: contactDto.email,
              lead_phone: contactDto.phone,
              inquiry_type: contactDto.inquiry_type,
            },
            tenantSlug,
          ),
        ),
      );
    } catch (error) {
      this.logger.error(
        'Error sending property lead notification',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private isForeignKeyViolation(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === '23503'
    );
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenants = await this.dataSource.query<{ schema_name: string }[]>(
      'SELECT schema_name FROM public.tenant WHERE slug = $1',
      [tenantSlug],
    );

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant with slug '${tenantSlug}' not found`);
    }

    return tenants[0].schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
