import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Property } from './entities/property.entity';
import { PropertyType } from './entities/property-type.entity';
import { PropertySubtype } from './entities/property-subtype.entity';
import { PropertyAddress } from './entities/property-address.entity';
import { RentalOwner } from './entities/rental-owner.entity';
import { PropertyOwner } from './entities/property-owner.entity';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { UpdatePropertyDetailsDto } from './dto/update-property-details.dto';
import { FilterPropertiesDto } from './dto/filter-properties.dto';
import { FilterCatalogPropertiesDto } from './dto/filter-catalog-properties.dto';
import { CreatePropertyContactDto } from './dto/create-property-contact.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { quoteIdent } from '../common/utils/sql-identifier';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private notificationsService: NotificationsService,
  ) {}

  // Helper method para obtener repositorios que respetan el search_path actual
  private getPropertyRepository(): Repository<Property> {
    return this.dataSource.getRepository(Property);
  }

  private getPropertyTypeRepository(): Repository<PropertyType> {
    return this.dataSource.getRepository(PropertyType);
  }

  private getPropertySubtypeRepository(): Repository<PropertySubtype> {
    return this.dataSource.getRepository(PropertySubtype);
  }

  private getPropertyAddressRepository(): Repository<PropertyAddress> {
    return this.dataSource.getRepository(PropertyAddress);
  }

  private getRentalOwnerRepository(): Repository<RentalOwner> {
    return this.dataSource.getRepository(RentalOwner);
  }

  private getPropertyOwnerRepository(): Repository<PropertyOwner> {
    return this.dataSource.getRepository(PropertyOwner);
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

  // Helper method para establecer el schema del tenant
  private async setTenantSchema(tenantSlug: string) {
    const schemaName = await this.getTenantSchemaName(tenantSlug);

    // Establecer el search_path
    await this.dataSource.query(`SET search_path TO ${quoteIdent(schemaName)}`);
  }

  async create(tenantSlug: string, createPropertyDto: CreatePropertyDto) {
    await this.setTenantSchema(tenantSlug);

    // Validate property type and subtype using SQL queries (respetan search_path)
    const propertyTypes = await this.dataSource.query(
      'SELECT * FROM property_types WHERE id = $1',
      [createPropertyDto.property_type_id],
    );

    if (propertyTypes.length === 0) {
      throw new NotFoundException(
        `PropertyType with ID ${createPropertyDto.property_type_id} not found`,
      );
    }

    const propertySubtypes = await this.dataSource.query(
      'SELECT * FROM property_subtypes WHERE id = $1',
      [createPropertyDto.property_subtype_id],
    );

    if (propertySubtypes.length === 0) {
      throw new NotFoundException(
        `PropertySubtype with ID ${createPropertyDto.property_subtype_id} not found`,
      );
    }

    // Validate subtype belongs to type
    if (
      propertySubtypes[0].property_type_id !==
      createPropertyDto.property_type_id
    ) {
      throw new BadRequestException(
        'PropertySubtype does not belong to the specified PropertyType',
      );
    }

    // Validate at least one address
    if (
      !createPropertyDto.addresses ||
      createPropertyDto.addresses.length === 0
    ) {
      throw new BadRequestException('At least one address is required');
    }

    // Create property using SQL
    const insertResult = await this.dataSource.query(
      `INSERT INTO properties (title, property_type_id, property_subtype_id, description,
        security_deposit_amount, account_number, account_type, account_holder_name,
        monthly_rent, currency, square_meters, bedrooms, bathrooms, parking_spaces,
        year_built, is_furnished, latitude, longitude, images, amenities, included_items, property_rules,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::json, $20::json, $21::json, $22::jsonb, NOW(), NOW())
       RETURNING *`,
      [
        createPropertyDto.title,
        createPropertyDto.property_type_id,
        createPropertyDto.property_subtype_id,
        createPropertyDto.description || null,
        createPropertyDto.security_deposit_amount || null,
        createPropertyDto.account_number || null,
        createPropertyDto.account_type || null,
        createPropertyDto.account_holder_name || null,
        createPropertyDto.monthly_rent || null,
        createPropertyDto.currency || 'BOB',
        createPropertyDto.square_meters || null,
        createPropertyDto.bedrooms || null,
        createPropertyDto.bathrooms || null,
        createPropertyDto.parking_spaces || null,
        createPropertyDto.year_built || null,
        createPropertyDto.is_furnished ?? false,
        createPropertyDto.latitude || null,
        createPropertyDto.longitude || null,
        JSON.stringify([]),
        createPropertyDto.amenities
          ? JSON.stringify(createPropertyDto.amenities)
          : null,
        createPropertyDto.included_items
          ? JSON.stringify(createPropertyDto.included_items)
          : null,
        createPropertyDto.property_rules
          ? JSON.stringify(createPropertyDto.property_rules)
          : null,
      ],
    );

    const savedProperty = insertResult[0];

    // Create addresses
    for (const addressDto of createPropertyDto.addresses) {
      await this.dataSource.query(
        `INSERT INTO property_addresses (property_id, address_type, street_address, city, state, zip_code, country, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          savedProperty.id,
          addressDto.address_type,
          addressDto.street_address,
          addressDto.city || null,
          addressDto.state || null,
          addressDto.zip_code || null,
          addressDto.country,
        ],
      );
    }

    // Create new owners if provided
    if (
      createPropertyDto.new_owners &&
      createPropertyDto.new_owners.length > 0
    ) {
      for (let i = 0; i < createPropertyDto.new_owners.length; i++) {
        const ownerDto = createPropertyDto.new_owners[i];

        const ownerResult = await this.dataSource.query(
          `INSERT INTO rental_owners (name, company_name, is_company, primary_email, phone_number,
            secondary_email, secondary_phone, notes, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
           RETURNING *`,
          [
            ownerDto.name,
            ownerDto.company_name || null,
            ownerDto.is_company || null,
            ownerDto.primary_email,
            ownerDto.phone_number,
            ownerDto.secondary_email || null,
            ownerDto.secondary_phone || null,
            ownerDto.notes || null,
            true,
          ],
        );

        const savedOwner = ownerResult[0];

        await this.dataSource.query(
          `INSERT INTO property_owners (property_id, rental_owner_id, is_primary, ownership_percentage, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [savedProperty.id, savedOwner.id, i === 0, 0],
        );
      }
    }

    // Assign existing owners if provided
    if (
      createPropertyDto.existing_owners &&
      createPropertyDto.existing_owners.length > 0
    ) {
      for (const assignDto of createPropertyDto.existing_owners) {
        // Verify owner exists
        const owners = await this.dataSource.query(
          'SELECT * FROM rental_owners WHERE id = $1',
          [assignDto.rental_owner_id],
        );

        if (owners.length === 0) {
          throw new NotFoundException(
            `RentalOwner with ID ${assignDto.rental_owner_id} not found`,
          );
        }

        await this.dataSource.query(
          `INSERT INTO property_owners (property_id, rental_owner_id, is_primary, ownership_percentage, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [
            savedProperty.id,
            assignDto.rental_owner_id,
            assignDto.is_primary || false,
            assignDto.ownership_percentage || 0,
          ],
        );
      }
    }

    return this.findOne(savedProperty.id, tenantSlug);
  }

  async findAll(filters?: FilterPropertiesDto, tenantSlug?: string) {
    if (tenantSlug) {
      await this.setTenantSchema(tenantSlug);
    }

    // Build WHERE clause
    let whereSql = 'WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      whereSql += ` AND p.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters?.property_type_id) {
      whereSql += ` AND p.property_type_id = $${paramIndex++}`;
      params.push(filters.property_type_id);
    }

    if (filters?.property_subtype_id) {
      whereSql += ` AND p.property_subtype_id = $${paramIndex++}`;
      params.push(filters.property_subtype_id);
    }

    if (filters?.city) {
      whereSql += ` AND pa.city ILIKE $${paramIndex++}`;
      params.push(`%${filters.city}%`);
    }

    if (filters?.country) {
      whereSql += ` AND pa.country = $${paramIndex++}`;
      params.push(filters.country);
    }

    if (filters?.search) {
      whereSql += ` AND (p.title ILIKE $${paramIndex++} OR p.description ILIKE $${paramIndex++})`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    // Count total
    const countSql = `
      SELECT COUNT(DISTINCT p.id) as count
      FROM properties p
      LEFT JOIN property_addresses pa ON p.id = pa.property_id
      ${whereSql}
    `;

    const countResult = await this.dataSource.query(countSql, params);
    const total = parseInt(countResult[0].count);

    // Get properties - select specific columns instead of p.* to avoid DISTINCT with JSON columns
    const sortBy = filters?.sort_by || 'created_at';
    const sortOrder = filters?.sort_order || 'DESC';
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const offset = (page - 1) * limit;

    const sql = `
      SELECT DISTINCT ON (p.id) p.id, p.title, p.description, p.property_type_id, p.property_subtype_id,
        p.status, p.latitude, p.longitude, p.security_deposit_amount,
        p.account_number, p.account_type, p.account_holder_name,
        p.images, p.amenities, p.included_items,
        p.monthly_rent, p.currency, p.square_meters, p.bedrooms, p.bathrooms,
        p.parking_spaces, p.year_built, p.is_furnished, p.property_rules,
        p.created_at, p.updated_at,
        pt.name as property_type_name, pt.code as property_type_code,
        pst.name as property_subtype_name, pst.code as property_subtype_code,
        CASE WHEN p.status = 'DISPONIBLE' THEN true ELSE false END as active
      FROM properties p
      LEFT JOIN property_types pt ON p.property_type_id = pt.id
      LEFT JOIN property_subtypes pst ON p.property_subtype_id = pst.id
      LEFT JOIN property_addresses pa ON p.id = pa.property_id
      ${whereSql}
      ORDER BY p.id, p.${sortBy} ${sortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const items = await this.dataSource.query(sql, params);

    // Fetch addresses for each property separately to avoid DISTINCT issues
    for (const item of items) {
      const addresses = await this.dataSource.query(
        'SELECT * FROM property_addresses WHERE property_id = $1 ORDER BY id',
        [item.id],
      );
      item.addresses = addresses;
    }

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findAvailable(filters?: FilterPropertiesDto, tenantSlug?: string) {
    // Si se proporciona tenantSlug, establecer el search_path
    if (tenantSlug) {
      await this.setTenantSchema(tenantSlug);
    }
    return this.findAll({ ...filters, status: 'DISPONIBLE' }, tenantSlug);
  }

  async findOne(id: number, tenantSlug?: string) {
    // Si se proporciona tenantSlug, establecer el search_path
    if (tenantSlug) {
      await this.setTenantSchema(tenantSlug);
    }
    // Get property with all related data using SQL
    const properties = await this.dataSource.query(
      `SELECT p.*, pt.name as property_type_name, pt.code as property_type_code,
        pst.name as property_subtype_name, pst.code as property_subtype_code
       FROM properties p
       LEFT JOIN property_types pt ON p.property_type_id = pt.id
       LEFT JOIN property_subtypes pst ON p.property_subtype_id = pst.id
       WHERE p.id = $1`,
      [id],
    );

    if (properties.length === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    const property = properties[0];

    // Get addresses
    const addresses = await this.dataSource.query(
      'SELECT * FROM property_addresses WHERE property_id = $1',
      [id],
    );

    // Get owners
    const owners = await this.dataSource.query(
      `SELECT po.*, ro.name as rental_owner_name, ro.primary_email as rental_owner_email,
        ro.phone_number as rental_owner_phone
       FROM property_owners po
       LEFT JOIN rental_owners ro ON po.rental_owner_id = ro.id
       WHERE po.property_id = $1`,
      [id],
    );

    // Format response to match TypeORM entity structure
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
      addresses: addresses.map((a: any) => ({
        id: a.id,
        property_id: a.property_id,
        address_type: a.address_type,
        street_address: a.street_address,
        city: a.city,
        state: a.state,
        zip_code: a.zip_code,
        country: a.country,
        created_at: a.created_at,
      })),
      owners: owners.map((o: any) => ({
        id: o.id,
        property_id: o.property_id,
        rental_owner_id: o.rental_owner_id,
        ownership_percentage: o.ownership_percentage,
        is_primary: o.is_primary,
        name: o.rental_owner_name,
        primary_email: o.rental_owner_email,
        phone_number: o.rental_owner_phone || '',
        rental_owner: {
          id: o.rental_owner_id,
          name: o.rental_owner_name,
          primary_email: o.rental_owner_email,
          phone_number: o.rental_owner_phone || '',
        },
      })),
    };
  }

  async update(
    id: number,
    updatePropertyDto: UpdatePropertyDto,
    tenantSlug?: string,
  ) {
    if (tenantSlug) {
      await this.setTenantSchema(tenantSlug);
    }

    try {
      // Verify property exists
      const properties = await this.dataSource.query(
        'SELECT * FROM properties WHERE id = $1',
        [id],
      );

      if (properties.length === 0) {
        throw new NotFoundException(`Property with ID ${id} not found`);
      }

      const property = properties[0];

      if (updatePropertyDto.property_type_id) {
        const propertyTypes = await this.dataSource.query(
          'SELECT * FROM property_types WHERE id = $1',
          [updatePropertyDto.property_type_id],
        );

        if (propertyTypes.length === 0) {
          throw new NotFoundException(
            `PropertyType with ID ${updatePropertyDto.property_type_id} not found`,
          );
        }
      }

      if (updatePropertyDto.property_subtype_id) {
        const propertySubtypes = await this.dataSource.query(
          'SELECT * FROM property_subtypes WHERE id = $1',
          [updatePropertyDto.property_subtype_id],
        );

        if (propertySubtypes.length === 0) {
          throw new NotFoundException(
            `PropertySubtype with ID ${updatePropertyDto.property_subtype_id} not found`,
          );
        }

        // Validate subtype belongs to type
        const typeId =
          updatePropertyDto.property_type_id || property.property_type_id;
        if (+propertySubtypes[0].property_type_id !== +typeId) {
          throw new BadRequestException(
            'PropertySubtype does not belong to the specified PropertyType',
          );
        }
      }

      // Build dynamic update query
      const updateFields: string[] = [];
      const updateValues: any[] = [];
      let paramIndex = 1;

      const allowedFields = [
        'title',
        'description',
        'property_type_id',
        'property_subtype_id',
        'status',
        'latitude',
        'longitude',
        'security_deposit_amount',
        'account_number',
        'account_type',
        'account_holder_name',
        'monthly_rent',
        'currency',
        'square_meters',
        'bedrooms',
        'bathrooms',
        'parking_spaces',
        'year_built',
        'is_furnished',
      ];

      for (const field of allowedFields) {
        const value = (updatePropertyDto as any)[field];
        if (
          field in updatePropertyDto &&
          value !== undefined &&
          value !== null
        ) {
          updateFields.push(`${field} = $${paramIndex++}`);
          updateValues.push(value);
        }
      }

      // Handle JSON fields (amenities, included_items are json type)
      const jsonFields = ['amenities', 'included_items'];
      for (const field of jsonFields) {
        if (
          field in updatePropertyDto &&
          (updatePropertyDto as any)[field] != null
        ) {
          updateFields.push(`${field} = $${paramIndex++}::json`);
          updateValues.push(JSON.stringify((updatePropertyDto as any)[field]));
        }
      }

      // Handle property_rules (jsonb type)
      if (
        'property_rules' in updatePropertyDto &&
        updatePropertyDto.property_rules != null
      ) {
        updateFields.push(`property_rules = $${paramIndex++}::jsonb`);
        updateValues.push(JSON.stringify(updatePropertyDto.property_rules));
      }

      // Handle images (json column)
      if ('images' in updatePropertyDto && updatePropertyDto.images != null) {
        updateFields.push(`images = $${paramIndex++}::json`);
        updateValues.push(JSON.stringify(updatePropertyDto.images));
      }

      if (updateFields.length > 0) {
        updateFields.push(`updated_at = NOW()`);
        updateValues.push(id);

        const sql = `UPDATE properties SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`;
        console.log('📝 UPDATE SQL:', sql);
        console.log('📝 UPDATE VALUES:', updateValues);

        try {
          await this.dataSource.query(sql, updateValues);
        } catch (error) {
          console.error('❌ UPDATE ERROR:', error.message);
          console.error('❌ SQL:', sql);
          console.error('❌ VALUES:', updateValues);
          throw error;
        }
      }

      // Update addresses if provided
      if (updatePropertyDto.addresses) {
        // Delete existing addresses
        await this.dataSource.query(
          'DELETE FROM property_addresses WHERE property_id = $1',
          [id],
        );

        // Create new addresses
        for (const addressDto of updatePropertyDto.addresses) {
          await this.dataSource.query(
            `INSERT INTO property_addresses (property_id, address_type, street_address, city, state, zip_code, country, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              id,
              addressDto.address_type,
              addressDto.street_address,
              addressDto.city || null,
              addressDto.state || null,
              addressDto.zip_code || null,
              addressDto.country,
            ],
          );
        }
      }

      // Crear notificaciones por cambio de estado
      if (
        'status' in updatePropertyDto &&
        updatePropertyDto.status !== property.status
      ) {
        try {
          // Notificar a los admins sobre el cambio de estado
          const admins = await this.dataSource.query(
            `SELECT id FROM users WHERE role = 'ADMIN'`,
          );

          for (const admin of admins) {
            if (updatePropertyDto.status === 'DISPONIBLE') {
              await this.notificationsService.createForUser(
                admin.id,
                NotificationEventType.PROPERTY_AVAILABLE,
                'Propiedad disponible',
                `La propiedad ${property.title} ahora está disponible`,
                {
                  property_id: id,
                  property_title: property.title,
                  old_status: property.status,
                  new_status: updatePropertyDto.status,
                },
              );
            } else {
              await this.notificationsService.createForUser(
                admin.id,
                NotificationEventType.PROPERTY_STATUS_CHANGED,
                'Estado de propiedad actualizado',
                `La propiedad ${property.title} ha cambiado de ${property.status} a ${updatePropertyDto.status}`,
                {
                  property_id: id,
                  property_title: property.title,
                  old_status: property.status,
                  new_status: updatePropertyDto.status,
                },
              );
            }
          }
        } catch (error) {
          // No fallar si la notificación no se puede crear
          console.error('Error al crear notificación:', error.message);
        }
      }

      return this.findOne(id, tenantSlug);
    } catch (error) {
      if (error?.status && error.status < 500) throw error; // re-throw 4xx
      console.error('❌❌ UPDATE FULL ERROR:', error.message);
      console.error('❌❌ STACK:', error.stack);
      throw error;
    }
  }

  async updateDetails(
    id: number,
    updateDetailsDto: UpdatePropertyDetailsDto,
    tenantSlug?: string,
  ) {
    if (tenantSlug) {
      await this.setTenantSchema(tenantSlug);
    }

    // Verify property exists
    const properties = await this.dataSource.query(
      'SELECT id FROM properties WHERE id = $1',
      [id],
    );

    if (properties.length === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramIndex = 1;

    const scalarFields = [
      'title',
      'description',
      'latitude',
      'longitude',
      'security_deposit_amount',
      'account_number',
      'account_type',
      'account_holder_name',
      'status',
      'monthly_rent',
      'currency',
      'square_meters',
      'bedrooms',
      'bathrooms',
      'parking_spaces',
      'year_built',
      'is_furnished',
    ];

    for (const field of scalarFields) {
      if (field in updateDetailsDto) {
        updateFields.push(`${field} = $${paramIndex++}`);
        updateValues.push((updateDetailsDto as any)[field]);
      }
    }

    // Handle JSON fields (amenities, included_items are json type)
    const jsonFields = ['amenities', 'included_items'];
    for (const field of jsonFields) {
      if (
        field in updateDetailsDto &&
        (updateDetailsDto as any)[field] != null
      ) {
        updateFields.push(`${field} = $${paramIndex++}::json`);
        updateValues.push(JSON.stringify((updateDetailsDto as any)[field]));
      }
    }

    // Handle property_rules (jsonb type)
    if (
      'property_rules' in updateDetailsDto &&
      (updateDetailsDto as any)['property_rules'] != null
    ) {
      updateFields.push(`property_rules = $${paramIndex++}::jsonb`);
      updateValues.push(
        JSON.stringify((updateDetailsDto as any)['property_rules']),
      );
    }

    // Handle images (json column)
    if ('images' in updateDetailsDto && updateDetailsDto.images != null) {
      updateFields.push(`images = $${paramIndex++}::json`);
      updateValues.push(JSON.stringify(updateDetailsDto.images));
    }

    if (updateFields.length > 0) {
      updateFields.push(`updated_at = NOW()`);
      updateValues.push(id);

      await this.dataSource.query(
        `UPDATE properties SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
        updateValues,
      );
    }

    return this.findOne(id, tenantSlug);
  }

  async remove(id: number, tenantSlug?: string) {
    if (tenantSlug) {
      await this.setTenantSchema(tenantSlug);
    }

    // Verify property exists
    const properties = await this.dataSource.query(
      'SELECT id FROM properties WHERE id = $1',
      [id],
    );

    if (properties.length === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    // Delete property (CASCADE will handle addresses and property_owners)
    await this.dataSource.query('DELETE FROM properties WHERE id = $1', [id]);

    return { message: 'Property deleted successfully', id };
  }

  // Property Types and Subtypes management
  async getPropertyTypes(tenantSlug: string) {
    const schemaName = await this.getTenantSchemaName(tenantSlug);

    return this.dataSource.query(
      `SELECT * FROM ${quoteIdent(schemaName)}.property_types ORDER BY name ASC`,
    );
  }

  async getPropertySubtypes(tenantSlug: string, typeId?: number) {
    const schemaName = await this.getTenantSchemaName(tenantSlug);

    if (typeId) {
      return this.dataSource.query(
        `SELECT pst.*, pt.name as property_type_name, pt.code as property_type_code
         FROM ${quoteIdent(schemaName)}.property_subtypes pst
         LEFT JOIN ${quoteIdent(schemaName)}.property_types pt ON pst.property_type_id = pt.id
         WHERE pst.property_type_id = $1
         ORDER BY pst.name ASC`,
        [typeId],
      );
    }

    return this.dataSource.query(
      `SELECT pst.*, pt.name as property_type_name, pt.code as property_type_code
       FROM ${quoteIdent(schemaName)}.property_subtypes pst
       LEFT JOIN ${quoteIdent(schemaName)}.property_types pt ON pst.property_type_id = pt.id
       ORDER BY pst.name ASC`,
    );
  }

  // ==========================================
  // F2-BE-03: CATÁLOGO PÚBLICO CON FILTROS
  // ==========================================

  /**
   * Obtener catálogo de propiedades disponibles con filtros, paginación y ordenamiento
   * Endpoint público: GET /:slug/catalog/properties
   */
  async findCatalogProperties(
    filters: FilterCatalogPropertiesDto,
    tenantSlug: string,
  ) {
    await this.setTenantSchema(tenantSlug);

    // Construir WHERE clause dinámico
    let whereSql = 'WHERE p.status = $1'; // Solo propiedades disponibles por defecto
    const params: any[] = [filters.status || 'DISPONIBLE'];
    let paramIndex = 2;

    // Filtro por tipo de propiedad
    if (filters.type) {
      whereSql += ` AND LOWER(pt.code) = LOWER($${paramIndex++})`;
      params.push(filters.type);
    }

    // Filtro por precio mínimo
    if (filters.min_price !== undefined) {
      whereSql += ` AND p.monthly_rent >= $${paramIndex++}`;
      params.push(filters.min_price);
    }

    // Filtro por precio máximo
    if (filters.max_price !== undefined) {
      whereSql += ` AND p.monthly_rent <= $${paramIndex++}`;
      params.push(filters.max_price);
    }

    // Filtro por dormitorios
    if (filters.bedrooms !== undefined) {
      whereSql += ` AND p.bedrooms >= $${paramIndex++}`;
      params.push(filters.bedrooms);
    }

    // Filtro por ciudad
    if (filters.city) {
      whereSql += ` AND LOWER(pa.city) ILIKE LOWER($${paramIndex++})`;
      params.push(`%${filters.city}%`);
    }

    // Filtro por país
    if (filters.country) {
      whereSql += ` AND LOWER(pa.country) = LOWER($${paramIndex++})`;
      params.push(filters.country);
    }

    // Búsqueda de texto libre
    if (filters.search) {
      whereSql += ` AND (
        LOWER(p.title) ILIKE LOWER($${paramIndex++}) OR
        LOWER(p.description) ILIKE LOWER($${paramIndex++})
      )`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    // Filtro por tipo de alquiler
    if (filters.rental_type && filters.rental_type !== 'any') {
      whereSql += ` AND LOWER(p.rental_type) = LOWER($${paramIndex++})`;
      params.push(filters.rental_type);
    }

    // Contar total de resultados
    const countSql = `
      SELECT COUNT(DISTINCT p.id) as count
      FROM properties p
      LEFT JOIN property_types pt ON p.property_type_id = pt.id
      LEFT JOIN property_subtypes pst ON p.property_subtype_id = pst.id
      LEFT JOIN property_addresses pa ON p.id = pa.property_id
      ${whereSql}
    `;

    const countResult = await this.dataSource.query(
      countSql,
      params.slice(0, paramIndex - 1),
    );
    const total = parseInt(countResult[0].count);

    // Construir ORDER BY basado en sort param
    let orderBy = 'p.created_at DESC'; // default
    if (filters.sort === 'price_asc') {
      orderBy = 'p.monthly_rent ASC';
    } else if (filters.sort === 'price_desc') {
      orderBy = 'p.monthly_rent DESC';
    } else if (filters.sort === 'newest') {
      orderBy = 'p.created_at DESC';
    } else if (filters.sort === 'available') {
      orderBy = 'p.last_viewed_at DESC NULLS LAST';
    }

    // Paginación
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100); // Máximo 100 results por página
    const offset = (page - 1) * limit;

    // Query principal con DISTINCT ON para evitar duplicados
    const sql = `
      SELECT DISTINCT ON (p.id) 
        p.id, p.title, p.description,
        p.property_type_id, p.property_subtype_id,
        p.status, p.latitude, p.longitude,
        p.monthly_rent, p.currency,
        p.bedrooms, p.bathrooms, p.square_meters, p.parking_spaces,
        p.is_furnished, p.images, p.amenities, p.included_items,
        p.view_count, p.last_viewed_at,
        p.created_at, p.updated_at,
        pt.name as property_type_name, pt.code as property_type_code,
        pst.name as property_subtype_name, pst.code as property_subtype_code
      FROM properties p
      LEFT JOIN property_types pt ON p.property_type_id = pt.id
      LEFT JOIN property_subtypes pst ON p.property_subtype_id = pst.id
      LEFT JOIN property_addresses pa ON p.id = pa.property_id
      ${whereSql}
      ORDER BY p.id, ${orderBy}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const items = await this.dataSource.query(sql, params);

    // Obtener primera dirección para cada propiedad
    for (const item of items) {
      const addresses = await this.dataSource.query(
        `SELECT * FROM property_addresses 
         WHERE property_id = $1 AND address_type = 'address_1'
         LIMIT 1`,
        [item.id],
      );
      item.first_address = addresses.length > 0 ? addresses[0] : null;
    }

    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Obtener detalle de propiedad pública e incrementar contador de vistas
   * Endpoint público: GET /:slug/catalog/properties/:id
   */
  async findCatalogPropertyDetail(
    id: number,
    tenantSlug: string,
    userIP?: string,
  ) {
    await this.setTenantSchema(tenantSlug);

    // Obtener detalle de propiedad
    const properties = await this.dataSource.query(
      `SELECT p.*, 
        pt.name as property_type_name, pt.code as property_type_code,
        pst.name as property_subtype_name, pst.code as property_subtype_code
       FROM properties p
       LEFT JOIN property_types pt ON p.property_type_id = pt.id
       LEFT JOIN property_subtypes pst ON p.property_subtype_id = pst.id
       WHERE p.id = $1`,
      [id],
    );

    if (properties.length === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    const property = properties[0];

    // Incrementar contador de vistas de forma asíncrona (no esperar)
    this.recordPropertyView(id, userIP).catch((error) => {
      console.error(`Error recording property view for ID ${id}:`, error);
    });

    // Obtener direcciones completas
    const addresses = await this.dataSource.query(
      'SELECT * FROM property_addresses WHERE property_id = $1 ORDER BY id',
      [id],
    );

    // Obtener dueños
    const owners = await this.dataSource.query(
      `SELECT ro.id, ro.name, ro.company_name, ro.primary_email as email,
        ro.phone_number as phone, po.is_primary
       FROM property_owners po
       LEFT JOIN rental_owners ro ON po.rental_owner_id = ro.id
       WHERE po.property_id = $1`,
      [id],
    );

    return {
      ...property,
      addresses,
      owners,
    };
  }

  /**
   * Registrar la vista de una propiedad (incrementar contador y guardar timestamp)
   * Puede ejecutarse de forma asíncrona
   */
  async recordPropertyView(propertyId: number, userIP?: string) {
    try {
      // Actualizar contador y timestamp
      await this.dataSource.query(
        `UPDATE properties 
         SET view_count = view_count + 1,
             last_viewed_at = NOW()
         WHERE id = $1`,
        [propertyId],
      );

      // Opcional: Guardar log detallado en tabla de auditoría
      if (userIP) {
        try {
          await this.dataSource.query(
            `INSERT INTO property_view_logs (property_id, user_ip, viewed_at)
             VALUES ($1, $2, NOW())`,
            [propertyId, userIP],
          );
        } catch (error) {
          console.warn('Could not log property view:', error.message);
        }
      }
    } catch (error) {
      console.error('Error in recordPropertyView:', error);
    }
  }

  /**
   * Crear un contacto/lead para una propiedad
   * Endpoint público: POST /:slug/catalog/properties/:id/contact
   * Autenticación: NO requerida
   */
  async createPropertyContact(
    propertyId: number,
    contactDto: CreatePropertyContactDto,
    tenantSlug: string,
    userIP?: string,
  ) {
    await this.setTenantSchema(tenantSlug);

    // Verificar que la propiedad existe
    const properties = await this.dataSource.query(
      'SELECT id, title FROM properties WHERE id = $1',
      [propertyId],
    );

    if (properties.length === 0) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }

    const property = properties[0];

    // Guardar lead en tabla property_leads
    try {
      const result = await this.dataSource.query(
        `INSERT INTO property_leads
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

      // Enviar notificación a los admins del tenant (asíncrono)
      try {
        const adminRows: { id: number }[] = await this.dataSource.query(
          `SELECT id FROM "user" WHERE role = 'ADMIN' AND is_active = true`,
        );
        const adminIds = adminRows.map((r) => r.id);
        if (adminIds.length > 0) {
          await this.notificationsService.notifyAdmins(
            adminIds,
            NotificationEventType.PROPERTY_LEAD_RECEIVED,
            `New Lead: ${contactDto.name}`,
            `New contact inquiry for ${property.title}: ${contactDto.message.substring(0, 50)}...`,
            {
              property_id: propertyId,
              property_title: property.title,
              lead_name: contactDto.name,
              lead_email: contactDto.email,
              lead_phone: contactDto.phone,
              inquiry_type: contactDto.inquiry_type,
            },
          );
        }
      } catch (error) {
        console.error('Error sending notification:', error);
      }

      return lead;
    } catch (error) {
      if (error.code === '23506') {
        throw new BadRequestException('Invalid property ID');
      }
      throw error;
    }
  }

  async assignOwnerToProperty(
    propertyId: number,
    assignDto: any,
    tenantSlug?: string,
  ) {
    if (tenantSlug) {
      await this.setTenantSchema(tenantSlug);
    }

    const props = await this.dataSource.query(
      'SELECT id FROM properties WHERE id = $1',
      [propertyId],
    );
    if (props.length === 0) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }
    const result = await this.dataSource.query(
      `INSERT INTO property_owners (property_id, rental_owner_id, ownership_percentage, is_primary, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (property_id, rental_owner_id) DO UPDATE
         SET ownership_percentage = EXCLUDED.ownership_percentage,
             is_primary = EXCLUDED.is_primary
       RETURNING *`,
      [
        propertyId,
        assignDto.rental_owner_id,
        assignDto.ownership_percentage ?? null,
        assignDto.is_primary ?? false,
      ],
    );
    return result[0];
  }

  async removeOwnerFromProperty(
    propertyId: number,
    ownerRelationId: number,
    tenantSlug?: string,
  ) {
    if (tenantSlug) {
      await this.setTenantSchema(tenantSlug);
    }

    const rows = await this.dataSource.query(
      'SELECT id FROM property_owners WHERE id = $1 AND property_id = $2',
      [ownerRelationId, propertyId],
    );
    if (rows.length === 0) {
      throw new NotFoundException(
        `Owner relation with ID ${ownerRelationId} not found for property ${propertyId}`,
      );
    }
    await this.dataSource.query('DELETE FROM property_owners WHERE id = $1', [
      ownerRelationId,
    ]);
    return {
      message: 'Owner removed from property successfully',
      id: ownerRelationId,
    };
  }

  async getStats(tenantSlug?: string) {
    if (tenantSlug) {
      await this.setTenantSchema(tenantSlug);
    }

    const [total] = await this.dataSource.query(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'DISPONIBLE') AS available,
              COUNT(*) FILTER (WHERE status = 'OCUPADO') AS occupied,
              COUNT(*) FILTER (WHERE status = 'MANTENIMIENTO') AS maintenance,
              COUNT(*) FILTER (WHERE status = 'RESERVADO') AS reserved,
              COUNT(*) FILTER (WHERE status = 'INACTIVO') AS inactive
       FROM properties`,
    );
    return {
      total: +total.total,
      available: +total.available,
      occupied: +total.occupied,
      maintenance: +total.maintenance,
      reserved: +total.reserved,
      inactive: +total.inactive,
    };
  }

  async findByTenant(
    userId: number,
    filters?: FilterPropertiesDto,
    tenantSlug?: string,
  ) {
    if (tenantSlug) {
      await this.setTenantSchema(tenantSlug);
    }

    const rows = await this.dataSource.query(
      `SELECT DISTINCT p.*
       FROM properties p
       INNER JOIN contracts c ON c.property_id = p.id
       WHERE c.tenant_id = $1
         AND c.status IN ('ACTIVE', 'ACTIVO')
       ORDER BY p.id ASC`,
      [userId],
    );
    return rows;
  }
}
