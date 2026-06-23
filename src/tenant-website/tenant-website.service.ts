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
import { isStaffOfTenant } from '../common/utils/tenant-access';

export interface FaqItem {
  question: string;
  answer: string;
}

export interface SectionCard {
  title: string;
  description: string;
}

export interface TenantWebsiteRow {
  id: number;
  subdomain: string | null;
  company_description: string | null;
  logo_url: string | null;
  hero_image_url: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  about_content: string | null;
  faq_items: FaqItem[];
  home_features: SectionCard[];
  about_values: SectionCard[];
  cta_title: string | null;
  cta_subtitle: string | null;
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

export interface PublicBranding {
  company_name: string;
  logo_url: string | null;
  hero_image_url: string | null;
  hero_title: string | null;
  hero_subtitle: string | null;
  about_content: string | null;
  faq_items: FaqItem[];
  home_features: SectionCard[];
  about_values: SectionCard[];
  cta_title: string | null;
  cta_subtitle: string | null;
  primary_color: string;
  secondary_color: string;
  company_description: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  social_links: Record<string, string>;
  meta_title: string | null;
  meta_description: string | null;
  is_published: boolean;
}

interface PublicTenantRow {
  schema_name: string;
}

interface WebsiteContactRow {
  id: number;
}

/** Datos mínimos del usuario autenticado para decidir el acceso a contenido no publicado. */
export interface RequesterContext {
  role?: string;
  tenantSlug?: string;
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
    if (dto.hero_title !== undefined) {
      fields.push(`hero_title = $${idx++}`);
      values.push(dto.hero_title);
    }
    if (dto.hero_subtitle !== undefined) {
      fields.push(`hero_subtitle = $${idx++}`);
      values.push(dto.hero_subtitle);
    }
    if (dto.about_content !== undefined) {
      fields.push(`about_content = $${idx++}`);
      values.push(dto.about_content);
    }
    if (dto.home_features !== undefined) {
      fields.push(`home_features = $${idx++}`);
      values.push(JSON.stringify(dto.home_features));
    }
    if (dto.about_values !== undefined) {
      fields.push(`about_values = $${idx++}`);
      values.push(JSON.stringify(dto.about_values));
    }
    if (dto.cta_title !== undefined) {
      fields.push(`cta_title = $${idx++}`);
      values.push(dto.cta_title);
    }
    if (dto.cta_subtitle !== undefined) {
      fields.push(`cta_subtitle = $${idx++}`);
      values.push(dto.cta_subtitle);
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

  /**
   * Establece el valor de una columna de imagen (logo o hero) directamente.
   * Se usa tras subir un archivo: el path lo genera el servidor, por lo que no
   * pasa por la validación del DTO.
   */
  async setImageField(
    schemaName: string,
    field: 'logo_url' | 'hero_image_url',
    value: string | null,
  ): Promise<TenantWebsiteRow> {
    const website = await this.getOrCreate(schemaName);

    const rows = await this.dataSource.query<TenantWebsiteRow[]>(
      `UPDATE ${quoteIdent(schemaName)}.tenant_website
       SET ${field} = $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [value, website.id],
    );

    return rows[0];
  }

  /** True si el usuario es staff (admin/empleado) del propio tenant del slug. */
  isStaffOfTenant(user: RequesterContext | undefined, slug: string): boolean {
    return isStaffOfTenant(user, slug);
  }

  /** Lectura de la fila de configuración SIN crearla (no escribe en GET anónimo). */
  private async readWebsiteRow(
    schemaName: string,
  ): Promise<TenantWebsiteRow | null> {
    const rows = await this.dataSource.query<TenantWebsiteRow[]>(
      `SELECT * FROM ${quoteIdent(schemaName)}.tenant_website LIMIT 1`,
    );
    return rows[0] ?? null;
  }

  /**
   * Branding público del portal por slug. Respeta el estado de publicación: un
   * sitio no publicado solo es visible para el staff autenticado del propio
   * tenant (preview del editor). Para anónimos devuelve `null` (el controller
   * responde 404), de modo que un sitio no publicado y uno inexistente son
   * indistinguibles (evita enumeración y fuga de datos de contacto).
   */
  async getBranding(
    slug: string,
    allowUnpublished = false,
  ): Promise<PublicBranding | null> {
    const tenants = await this.dataSource.query<
      Array<{ schema_name: string; company_name: string }>
    >(`SELECT schema_name, company_name FROM public.tenant WHERE slug = $1`, [
      slug,
    ]);

    if (!tenants.length) {
      return null;
    }

    const { schema_name: schemaName, company_name: companyName } = tenants[0];
    const website = await this.readWebsiteRow(schemaName);

    if (!website || (!website.is_published && !allowUnpublished)) {
      return null;
    }

    return {
      company_name: companyName,
      logo_url: website.logo_url,
      hero_image_url: website.hero_image_url,
      hero_title: website.hero_title,
      hero_subtitle: website.hero_subtitle,
      about_content: website.about_content,
      faq_items: website.faq_items ?? [],
      home_features: website.home_features ?? [],
      about_values: website.about_values ?? [],
      cta_title: website.cta_title,
      cta_subtitle: website.cta_subtitle,
      primary_color: website.primary_color,
      secondary_color: website.secondary_color,
      company_description: website.company_description,
      contact_email: website.contact_email,
      contact_phone: website.contact_phone,
      social_links: website.social_links ?? {},
      meta_title: website.meta_title,
      meta_description: website.meta_description,
      is_published: website.is_published,
    };
  }

  /**
   * Publica o despublica el sitio. Idempotente: si `published` viene definido se
   * fija ese estado (publicar siempre publica, despublicar siempre despublica);
   * si se omite, alterna el estado actual (compatibilidad).
   */
  async setPublished(
    schemaName: string,
    published?: boolean,
  ): Promise<TenantWebsiteRow> {
    const website = await this.getOrCreate(schemaName);
    const target = published ?? !website.is_published;

    const rows = await this.dataSource.query<TenantWebsiteRow[]>(
      `UPDATE ${quoteIdent(schemaName)}.tenant_website
       SET is_published = $1, updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [target, website.id],
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
    // Honeypot: un humano nunca rellena este campo oculto. Si llega con
    // contenido, lo descartamos en silencio devolviendo éxito para no informar
    // al bot de que fue detectado.
    if (dto.website && dto.website.trim().length > 0) {
      this.logger.debug(`Contacto honeypot descartado en sitio ${subdomain}`);
      return { id: 0, message: 'Mensaje enviado correctamente' };
    }

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
