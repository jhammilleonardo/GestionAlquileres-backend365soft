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
import { NotificationsService } from '../notifications/notifications.service';
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

  // Helper method para establecer el schema del tenant
  private async setTenantSchema(tenantSlug: string) {
    // Obtener el tenant desde la tabla pública
    const tenants = await this.dataSource.query(
      'SELECT schema_name FROM public.tenant WHERE slug = $1',
      [tenantSlug],
    );

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant with slug '${tenantSlug}' not found`);
    }

    // Establecer el search_path
    await this.dataSource.query(`SET search_path TO ${tenants[0].schema_name}`);
  }

  async create(createPropertyDto: CreatePropertyDto) {
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
        createPropertyDto.amenities ? JSON.stringify(createPropertyDto.amenities) : null,
        createPropertyDto.included_items ? JSON.stringify(createPropertyDto.included_items) : null,
        createPropertyDto.property_rules ? JSON.stringify(createPropertyDto.property_rules) : null,
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

    return this.findOne(savedProperty.id);
  }

  async findAll(filters?: FilterPropertiesDto) {
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
        [item.id]
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
    return this.findAll({ ...filters, status: 'DISPONIBLE' });
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

  async update(id: number, updatePropertyDto: UpdatePropertyDto) {
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
      if (field in updatePropertyDto && value !== undefined && value !== null) {
        updateFields.push(`${field} = $${paramIndex++}`);
        updateValues.push(value);
      }
    }

    // Handle JSON fields (amenities, included_items are json type)
    const jsonFields = ['amenities', 'included_items'];
    for (const field of jsonFields) {
      if (field in updatePropertyDto && (updatePropertyDto as any)[field] != null) {
        updateFields.push(`${field} = $${paramIndex++}::json`);
        updateValues.push(JSON.stringify((updatePropertyDto as any)[field]));
      }
    }

    // Handle property_rules (jsonb type)
    if ('property_rules' in updatePropertyDto && updatePropertyDto.property_rules != null) {
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

    return this.findOne(id);
    } catch (error) {
      if (error?.status && error.status < 500) throw error; // re-throw 4xx
      console.error('❌❌ UPDATE FULL ERROR:', error.message);
      console.error('❌❌ STACK:', error.stack);
      throw error;
    }
  }

  async updateDetails(id: number, updateDetailsDto: UpdatePropertyDetailsDto) {
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
      if (field in updateDetailsDto && (updateDetailsDto as any)[field] != null) {
        updateFields.push(`${field} = $${paramIndex++}::json`);
        updateValues.push(JSON.stringify((updateDetailsDto as any)[field]));
      }
    }

    // Handle property_rules (jsonb type)
    if ('property_rules' in updateDetailsDto && (updateDetailsDto as any)['property_rules'] != null) {
      updateFields.push(`property_rules = $${paramIndex++}::jsonb`);
      updateValues.push(JSON.stringify((updateDetailsDto as any)['property_rules']));
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

    return this.findOne(id);
  }

  async remove(id: number) {
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
  async getPropertyTypes() {
    return this.dataSource.query(
      'SELECT * FROM property_types ORDER BY name ASC',
    );
  }

  async getPropertySubtypes(typeId?: number) {
    if (typeId) {
      return this.dataSource.query(
        `SELECT pst.*, pt.name as property_type_name, pt.code as property_type_code
         FROM property_subtypes pst
         LEFT JOIN property_types pt ON pst.property_type_id = pt.id
         WHERE pst.property_type_id = $1
         ORDER BY pst.name ASC`,
        [typeId],
      );
    }

    return this.dataSource.query(
      `SELECT pst.*, pt.name as property_type_name, pt.code as property_type_code
       FROM property_subtypes pst
       LEFT JOIN property_types pt ON pst.property_type_id = pt.id
       ORDER BY pst.name ASC`,
    );
  }

  // Rental Owners management
  async createRentalOwner(ownerDto: any) {
    const result = await this.dataSource.query(
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

    return result[0];
  }

  async getRentalOwners() {
    return this.dataSource.query(
      'SELECT * FROM rental_owners ORDER BY name ASC',
    );
  }

  async getRentalOwner(id: number) {
    const owners = await this.dataSource.query(
      'SELECT * FROM rental_owners WHERE id = $1',
      [id],
    );

    if (owners.length === 0) {
      throw new NotFoundException(`RentalOwner with ID ${id} not found`);
    }

    return owners[0];
  }

  async updateRentalOwner(id: number, updateDto: any) {
    const owners = await this.dataSource.query(
      'SELECT id FROM rental_owners WHERE id = $1',
      [id],
    );
    if (owners.length === 0) {
      throw new NotFoundException(`RentalOwner with ID ${id} not found`);
    }

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    const allowed = [
      'name', 'company_name', 'is_company', 'primary_email',
      'phone_number', 'secondary_email', 'secondary_phone', 'notes', 'is_active',
    ];
    for (const field of allowed) {
      if (field in updateDto) {
        fields.push(`${field} = $${idx++}`);
        values.push((updateDto as any)[field]);
      }
    }
    if (fields.length === 0) {
      return this.getRentalOwner(id);
    }
    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.dataSource.query(
      `UPDATE rental_owners SET ${fields.join(', ')} WHERE id = $${idx}`,
      values,
    );
    return this.getRentalOwner(id);
  }

  async removeRentalOwner(id: number) {
    const owners = await this.dataSource.query(
      'SELECT id FROM rental_owners WHERE id = $1',
      [id],
    );
    if (owners.length === 0) {
      throw new NotFoundException(`RentalOwner with ID ${id} not found`);
    }
    await this.dataSource.query('DELETE FROM rental_owners WHERE id = $1', [id]);
    return { message: 'RentalOwner deleted successfully', id };
  }

  async assignOwnerToProperty(propertyId: number, assignDto: any) {
    // Check property exists
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

  async removeOwnerFromProperty(propertyId: number, ownerRelationId: number) {
    const rows = await this.dataSource.query(
      'SELECT id FROM property_owners WHERE id = $1 AND property_id = $2',
      [ownerRelationId, propertyId],
    );
    if (rows.length === 0) {
      throw new NotFoundException(`Owner relation with ID ${ownerRelationId} not found for property ${propertyId}`);
    }
    await this.dataSource.query(
      'DELETE FROM property_owners WHERE id = $1',
      [ownerRelationId],
    );
    return { message: 'Owner removed from property successfully', id: ownerRelationId };
  }

  async getStats() {
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

  async findByTenant(userId: number, filters?: FilterPropertiesDto) {
    // Returns properties where the tenant (user) has an active contract
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

