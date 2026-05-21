import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UpdateTenantWebsiteDto } from './dto/update-tenant-website.dto';
import { ContactFormDto } from './dto/contact-form.dto';
import { quoteIdent } from '../common/utils/sql-identifier';

export interface TenantWebsiteRow {
  id: number;
  subdomain: string | null;
  company_description: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  contact_email: string | null;
  contact_phone: string | null;
  social_links: Record<string, string>;
  meta_title: string | null;
  meta_description: string | null;
  is_published: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PublicWebsitePropertyRow {
  id: number;
  title: string;
  description: string | null;
  monthly_rent: string | number | null;
  currency: string;
  square_meters: string | number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  is_furnished: boolean;
  images: unknown;
  amenities: unknown;
  rental_type: string | null;
  property_type: string;
  city: string | null;
  street_address: string | null;
}

export type PublicWebsite = TenantWebsiteRow & {
  properties: PublicWebsitePropertyRow[];
};

interface PublicTenantRow {
  schema_name: string;
}

interface WebsiteContactRow {
  id: number;
}

@Injectable()
export class TenantWebsiteService {
  private readonly logger = new Logger(TenantWebsiteService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getOrCreate(schemaName: string): Promise<TenantWebsiteRow> {
    const rows = await this.dataSource.query<TenantWebsiteRow[]>(
      `SELECT * FROM ${quoteIdent(schemaName)}.tenant_website LIMIT 1`,
    );

    if (rows.length > 0) {
      return rows[0];
    }

    const created = await this.dataSource.query<TenantWebsiteRow[]>(
      `INSERT INTO ${quoteIdent(schemaName)}.tenant_website DEFAULT VALUES RETURNING *`,
    );

    return created[0];
  }

  async update(
    schemaName: string,
    dto: UpdateTenantWebsiteDto,
  ): Promise<TenantWebsiteRow> {
    const website = await this.getOrCreate(schemaName);

    if (dto.subdomain !== undefined) {
      await this.assertSubdomainUnique(schemaName, dto.subdomain, website.id);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.subdomain !== undefined) {
      fields.push(`subdomain = $${idx++}`);
      values.push(dto.subdomain);
    }
    if (dto.company_description !== undefined) {
      fields.push(`company_description = $${idx++}`);
      values.push(dto.company_description);
    }
    if (dto.logo_url !== undefined) {
      fields.push(`logo_url = $${idx++}`);
      values.push(dto.logo_url);
    }
    if (dto.primary_color !== undefined) {
      fields.push(`primary_color = $${idx++}`);
      values.push(dto.primary_color);
    }
    if (dto.secondary_color !== undefined) {
      fields.push(`secondary_color = $${idx++}`);
      values.push(dto.secondary_color);
    }
    if (dto.contact_email !== undefined) {
      fields.push(`contact_email = $${idx++}`);
      values.push(dto.contact_email);
    }
    if (dto.contact_phone !== undefined) {
      fields.push(`contact_phone = $${idx++}`);
      values.push(dto.contact_phone);
    }
    if (dto.social_links !== undefined) {
      fields.push(`social_links = $${idx++}`);
      values.push(JSON.stringify(dto.social_links));
    }
    if (dto.meta_title !== undefined) {
      fields.push(`meta_title = $${idx++}`);
      values.push(dto.meta_title);
    }
    if (dto.meta_description !== undefined) {
      fields.push(`meta_description = $${idx++}`);
      values.push(dto.meta_description);
    }

    if (fields.length === 0) {
      return website;
    }

    fields.push(`updated_at = now()`);
    values.push(website.id);

    const rows = await this.dataSource.query<TenantWebsiteRow[]>(
      `UPDATE ${quoteIdent(schemaName)}.tenant_website
       SET ${fields.join(', ')}
       WHERE id = $${idx}
       RETURNING *`,
      values,
    );

    return rows[0];
  }

  async togglePublish(schemaName: string): Promise<TenantWebsiteRow> {
    const website = await this.getOrCreate(schemaName);

    const rows = await this.dataSource.query<TenantWebsiteRow[]>(
      `UPDATE ${quoteIdent(schemaName)}.tenant_website
       SET is_published = NOT is_published, updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [website.id],
    );

    return rows[0];
  }

  async getPublicWebsite(subdomain: string): Promise<PublicWebsite> {
    const tenants = await this.dataSource.query<PublicTenantRow[]>(
      `SELECT * FROM public.tenant WHERE slug = $1`,
      [subdomain],
    );

    if (!tenants.length) {
      throw new NotFoundException(`Sitio '${subdomain}' no encontrado`);
    }

    const { schema_name: schemaName } = tenants[0];

    const [website] = await this.dataSource.query<TenantWebsiteRow[]>(
      `SELECT * FROM ${quoteIdent(schemaName)}.tenant_website LIMIT 1`,
    );

    if (!website || !website.is_published) {
      throw new NotFoundException(`Sitio '${subdomain}' no publicado`);
    }

    const properties = await this.dataSource.query<PublicWebsitePropertyRow[]>(
      `SELECT
         p.id,
         p.title,
         p.description,
         p.monthly_rent,
         p.currency,
         p.square_meters,
         p.bedrooms,
         p.bathrooms,
         p.parking_spaces,
         p.is_furnished,
         p.images,
         p.amenities,
         p.rental_type,
         pt.name AS property_type,
         pa.city,
         pa.street_address
       FROM ${quoteIdent(schemaName)}.properties p
       JOIN ${quoteIdent(schemaName)}.property_types pt ON pt.id = p.property_type_id
       LEFT JOIN ${quoteIdent(schemaName)}.property_addresses pa
         ON pa.property_id = p.id AND pa.address_type = 'address_1'
       WHERE p.status = 'DISPONIBLE'
       ORDER BY p.created_at DESC`,
    );

    return {
      ...website,
      properties,
    };
  }

  async submitContact(
    subdomain: string,
    dto: ContactFormDto,
    userIp: string,
  ): Promise<{ id: number; message: string }> {
    const tenants = await this.dataSource.query<PublicTenantRow[]>(
      `SELECT * FROM public.tenant WHERE slug = $1`,
      [subdomain],
    );

    if (!tenants.length) {
      throw new NotFoundException(`Sitio '${subdomain}' no encontrado`);
    }

    const { schema_name: schemaName } = tenants[0];

    const [website] = await this.dataSource.query<
      Pick<TenantWebsiteRow, 'id' | 'is_published'>[]
    >(
      `SELECT id, is_published FROM ${quoteIdent(schemaName)}.tenant_website LIMIT 1`,
    );

    if (!website || !website.is_published) {
      throw new BadRequestException('El sitio no está disponible');
    }

    const [contact] = await this.dataSource.query<WebsiteContactRow[]>(
      `INSERT INTO ${quoteIdent(schemaName)}.website_contacts
         (name, email, phone, message, user_ip)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [dto.name, dto.email, dto.phone ?? null, dto.message, userIp],
    );

    this.logger.log(`Nuevo contacto de ${dto.email} en sitio ${subdomain}`);

    return { id: contact.id, message: 'Mensaje enviado correctamente' };
  }

  private async assertSubdomainUnique(
    schemaName: string,
    subdomain: string,
    currentId: number,
  ): Promise<void> {
    const rows = await this.dataSource.query<Array<{ id: number }>>(
      `SELECT id FROM ${quoteIdent(schemaName)}.tenant_website
       WHERE subdomain = $1 AND id != $2`,
      [subdomain, currentId],
    );

    if (rows.length > 0) {
      throw new BadRequestException(
        `El subdominio '${subdomain}' ya está en uso`,
      );
    }
  }
}
