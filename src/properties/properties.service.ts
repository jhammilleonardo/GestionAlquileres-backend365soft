import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AssignOwnerDto, CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { UpdatePropertyDetailsDto } from './dto/update-property-details.dto';
import { FilterPropertiesDto } from './dto/filter-properties.dto';
import { FilterCatalogPropertiesDto } from './dto/filter-catalog-properties.dto';
import { CreatePropertyContactDto } from './dto/create-property-contact.dto';
import { quoteIdent } from '../common/utils/sql-identifier';
import { PropertySearchService } from './property-search.service';
import { PropertyOwnersService } from './property-owners.service';
import { PropertyLeadsService } from './property-leads.service';
import { PropertyDetailsService } from './property-details.service';
import { PropertyStatsService } from './property-stats.service';
import { PropertyLookupService } from './property-lookup.service';
import { PropertyCatalogService } from './property-catalog.service';
import { PropertyCreationService } from './property-creation.service';
import { PropertyUpdateService } from './property-update.service';
import { PropertyPublicCatalogService } from './property-public-catalog.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';

interface PropertyTypeIdRow {
  id: number;
}

@Injectable()
export class PropertiesService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private readonly propertySearchService: PropertySearchService,
    private readonly propertyOwnersService: PropertyOwnersService,
    private readonly propertyLeadsService: PropertyLeadsService,
    private readonly propertyDetailsService: PropertyDetailsService,
    private readonly propertyStatsService: PropertyStatsService,
    private readonly propertyLookupService: PropertyLookupService,
    private readonly propertyCatalogService: PropertyCatalogService,
    private readonly propertyCreationService: PropertyCreationService,
    private readonly propertyUpdateService: PropertyUpdateService,
    private readonly propertyPublicCatalogService: PropertyPublicCatalogService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

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

  async create(tenantSlug: string, createPropertyDto: CreatePropertyDto) {
    const property = await this.propertyCreationService.create(
      tenantSlug,
      createPropertyDto,
    );
    await this.auditLogsService.log({
      action: AuditAction.CREATED,
      entityType: 'property',
      entityId: (property as { id: number }).id,
      newValues: { title: createPropertyDto.title },
    });
    return property;
  }

  async findAll(filters?: FilterPropertiesDto, tenantSlug?: string) {
    return this.propertySearchService.findAll(filters, tenantSlug);
  }

  async findAvailable(filters?: FilterPropertiesDto, tenantSlug?: string) {
    return this.propertySearchService.findAvailable(filters, tenantSlug);
  }

  async findOne(id: number, tenantSlug?: string) {
    return this.propertyLookupService.findOne(id, tenantSlug);
  }

  async update(
    id: number,
    updatePropertyDto: UpdatePropertyDto,
    tenantSlug?: string,
  ) {
    const result = await this.propertyUpdateService.update(
      id,
      updatePropertyDto,
      tenantSlug,
    );
    await this.auditLogsService.log({
      action: AuditAction.UPDATED,
      entityType: 'property',
      entityId: id,
      newValues: { ...updatePropertyDto },
    });
    return result;
  }

  async updateDetails(
    id: number,
    updateDetailsDto: UpdatePropertyDetailsDto,
    tenantSlug?: string,
  ) {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    await this.propertyDetailsService.updateDetails(
      id,
      updateDetailsDto,
      schemaName,
    );
    return this.findOne(id, tenantSlug);
  }

  async remove(id: number, tenantSlug?: string) {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);

    // Verify property exists
    const properties = await this.dataSource.query<PropertyTypeIdRow[]>(
      `SELECT id FROM ${schemaPrefix}properties WHERE id = $1`,
      [id],
    );

    if (properties.length === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    // Delete property (CASCADE will handle addresses and property_owners)
    await this.dataSource.query(
      `DELETE FROM ${schemaPrefix}properties WHERE id = $1`,
      [id],
    );

    await this.auditLogsService.log({
      action: AuditAction.DELETED,
      entityType: 'property',
      entityId: id,
    });

    return { message: 'Property deleted successfully', id };
  }

  // Property Types and Subtypes management
  async getPropertyTypes(tenantSlug: string) {
    return this.propertyCatalogService.getPropertyTypes(tenantSlug);
  }

  async getPropertySubtypes(tenantSlug: string, typeId?: number) {
    return this.propertyCatalogService.getPropertySubtypes(tenantSlug, typeId);
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
    allowUnpublished = false,
  ) {
    return this.propertyPublicCatalogService.findCatalogProperties(
      filters,
      tenantSlug,
      allowUnpublished,
    );
  }

  /**
   * Obtener detalle de propiedad pública e incrementar contador de vistas
   * Endpoint público: GET /:slug/catalog/properties/:id
   */
  async findCatalogPropertyDetail(
    id: number,
    tenantSlug: string,
    userIP?: string,
    allowUnpublished = false,
  ) {
    return this.propertyPublicCatalogService.findCatalogPropertyDetail(
      id,
      tenantSlug,
      userIP,
      allowUnpublished,
    );
  }

  /**
   * Registrar la vista de una propiedad (incrementar contador y guardar timestamp)
   * Puede ejecutarse de forma asíncrona
   */
  async recordPropertyView(propertyId: number, userIP?: string) {
    return this.propertyPublicCatalogService.recordPropertyView(
      propertyId,
      userIP,
    );
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
    return this.propertyLeadsService.createPropertyContact(
      propertyId,
      contactDto,
      tenantSlug,
      userIP,
    );
  }

  async assignOwnerToProperty(
    propertyId: number,
    assignDto: AssignOwnerDto,
    tenantSlug?: string,
  ) {
    return this.propertyOwnersService.assignOwnerToProperty(
      propertyId,
      assignDto,
      tenantSlug,
    );
  }

  async removeOwnerFromProperty(
    propertyId: number,
    ownerRelationId: number,
    tenantSlug?: string,
  ) {
    return this.propertyOwnersService.removeOwnerFromProperty(
      propertyId,
      ownerRelationId,
      tenantSlug,
    );
  }

  async getStats(tenantSlug?: string) {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    return this.propertyStatsService.getStats(schemaName);
  }

  async findByTenant(
    userId: number,
    filters?: FilterPropertiesDto,
    tenantSlug?: string,
  ) {
    return this.propertySearchService.findByTenant(userId, filters, tenantSlug);
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
