import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

interface PropertyDetailRow {
  id: number;
  title: string;
  description: string | null;
  property_type_id: number;
  property_subtype_id: number;
  status: string;
  latitude: number | null;
  longitude: number | null;
  images: string[] | null;
  security_deposit_amount: number | null;
  amenities: string[] | null;
  included_items: string[] | null;
  account_number: string | null;
  account_type: string | null;
  account_holder_name: string | null;
  monthly_rent: number | null;
  currency: string | null;
  square_meters: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  year_built: number | null;
  is_furnished: boolean;
  property_rules: unknown;
  created_at: Date;
  updated_at: Date;
  property_type_name: string | null;
  property_type_code: string | null;
  property_subtype_name: string | null;
  property_subtype_code: string | null;
}

interface PropertyAddressRow {
  id: number;
  property_id: number;
  address_type: string;
  street_address: string;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string;
  created_at: Date;
}

interface PropertyOwnerRow {
  id: number;
  property_id: number;
  rental_owner_id: number;
  ownership_percentage: number;
  is_primary: boolean;
  rental_owner_name: string;
  rental_owner_email: string;
  rental_owner_phone: string | null;
}

@Injectable()
export class PropertyLookupService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findOne(id: number, tenantSlug?: string) {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);

    const properties = await this.dataSource.query<PropertyDetailRow[]>(
      `SELECT p.*, pt.name as property_type_name, pt.code as property_type_code,
        pst.name as property_subtype_name, pst.code as property_subtype_code
       FROM ${schemaPrefix}properties p
       LEFT JOIN ${schemaPrefix}property_types pt ON p.property_type_id = pt.id
       LEFT JOIN ${schemaPrefix}property_subtypes pst ON p.property_subtype_id = pst.id
       WHERE p.id = $1`,
      [id],
    );

    if (properties.length === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    const property = properties[0];
    const [addresses, owners] = await Promise.all([
      this.dataSource.query<PropertyAddressRow[]>(
        `SELECT * FROM ${schemaPrefix}property_addresses WHERE property_id = $1`,
        [id],
      ),
      this.dataSource.query<PropertyOwnerRow[]>(
        `SELECT po.*, ro.name as rental_owner_name, ro.primary_email as rental_owner_email,
          ro.phone_number as rental_owner_phone
         FROM ${schemaPrefix}property_owners po
         LEFT JOIN ${schemaPrefix}rental_owners ro ON po.rental_owner_id = ro.id
         WHERE po.property_id = $1`,
        [id],
      ),
    ]);

    return {
      id: property.id,
      title: property.title,
      description: property.description,
      property_type_id: property.property_type_id,
      property_subtype_id: property.property_subtype_id,
      status: property.status,
      latitude: property.latitude,
      longitude: property.longitude,
      images: property.images || [],
      security_deposit_amount: property.security_deposit_amount,
      amenities: property.amenities || [],
      included_items: property.included_items || [],
      account_number: property.account_number,
      account_type: property.account_type,
      account_holder_name: property.account_holder_name,
      monthly_rent: property.monthly_rent,
      currency: property.currency,
      square_meters: property.square_meters,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      parking_spaces: property.parking_spaces,
      year_built: property.year_built,
      is_furnished: property.is_furnished,
      property_rules: property.property_rules,
      created_at: property.created_at,
      updated_at: property.updated_at,
      property_type: {
        id: property.property_type_id,
        name: property.property_type_name,
        code: property.property_type_code,
      },
      property_subtype: {
        id: property.property_subtype_id,
        name: property.property_subtype_name,
        code: property.property_subtype_code,
      },
      addresses: addresses.map((address) => ({
        id: address.id,
        property_id: address.property_id,
        address_type: address.address_type,
        street_address: address.street_address,
        city: address.city,
        state: address.state,
        zip_code: address.zip_code,
        country: address.country,
        created_at: address.created_at,
      })),
      owners: owners.map((owner) => ({
        id: owner.id,
        property_id: owner.property_id,
        rental_owner_id: owner.rental_owner_id,
        ownership_percentage: owner.ownership_percentage,
        is_primary: owner.is_primary,
        name: owner.rental_owner_name,
        primary_email: owner.rental_owner_email,
        phone_number: owner.rental_owner_phone || '',
        rental_owner: {
          id: owner.rental_owner_id,
          name: owner.rental_owner_name,
          primary_email: owner.rental_owner_email,
          phone_number: owner.rental_owner_phone || '',
        },
      })),
    };
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
