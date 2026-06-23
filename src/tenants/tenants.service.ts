import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './metadata/tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { schemaNameFromSlug } from '../common/utils/sql-identifier';
import { isValidTenantSlug } from '../common/utils/tenant-slug';
import { TenantMaintenanceService } from './tenant-maintenance.service';
import { TenantSchemaService } from './tenant-schema.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Injectable()
export class TenantsService implements OnModuleInit {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private readonly tenantMaintenanceService: TenantMaintenanceService,
    private readonly tenantSchemaService: TenantSchemaService,
    private readonly tenantProvisioningService: TenantProvisioningService,
  ) {}

  async onModuleInit() {
    await this.tenantProvisioningService.runStartupUpgrades();
    await this.tenantMaintenanceService.deactivateOrphanedActiveTenants();
  }

  async create(createTenantDto: CreateTenantDto) {
    // Defensa en profundidad: aunque el DTO valida el slug con class-validator,
    // rechazar aquí cualquier valor que no cumpla el formato o sea reservado.
    if (!isValidTenantSlug(createTenantDto.slug)) {
      throw new BadRequestException(
        `Invalid or reserved tenant slug: '${createTenantDto.slug}'`,
      );
    }

    // Verificar si ya existe el slug
    const existingSlug = await this.tenantRepository.findOne({
      where: { slug: createTenantDto.slug },
    });

    if (existingSlug) {
      // Código estable para que el frontend muestre un mensaje amigable y
      // traducido; el usuario final no entiende el concepto de "slug".
      throw new ConflictException({
        code: 'COMPANY_NAME_TAKEN',
        message: 'Ya existe una empresa con ese nombre. Elige otro nombre.',
      });
    }

    // Generar schema_name a partir del slug (usa el derivador canónico)
    const schema_name = schemaNameFromSlug(createTenantDto.slug);

    // Verificar si ya existe el schema_name
    const existingSchema = await this.tenantRepository.findOne({
      where: { schema_name },
    });

    if (existingSchema) {
      throw new BadRequestException(`Schema '${schema_name}' already exists`);
    }

    // rental_type no es columna de la entidad Tenant (vive en tenant_config),
    // se extrae para no propagarlo al repository.create.
    const { country, rental_type, ...tenantMetadata } = createTenantDto;
    const tenant = this.tenantRepository.create({
      ...tenantMetadata,
      schema_name,
      // Se crea inactivo hasta finalizar provisioning completo.
      is_active: false,
    });

    const savedTenant = await this.tenantRepository.save(tenant);

    // Crear el schema en PostgreSQL; si falla, limpiar el registro del tenant.
    // Al finalizar correctamente, activar según lo solicitado (default true).
    try {
      await this.tenantProvisioningService.provisionNewTenant(
        savedTenant,
        country,
        rental_type,
      );
      await this.tenantRepository.update(savedTenant.id, {
        is_active: createTenantDto.is_active ?? true,
      });
    } catch (error) {
      try {
        await this.tenantRepository.update(savedTenant.id, {
          is_active: false,
        });
      } finally {
        await this.tenantRepository
          .delete(savedTenant.id)
          .catch(() => undefined);
      }
      throw error;
    }

    return this.findOne(savedTenant.id);
  }

  async findAll() {
    return this.tenantRepository.find();
  }

  async findOne(id: number) {
    const tenant = await this.tenantRepository.findOne({ where: { id } });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.tenantRepository.findOne({ where: { slug } });

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug '${slug}' not found`);
    }

    return tenant;
  }

  async findActiveBySlug(slug: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { slug, is_active: true },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Active tenant with slug '${slug}' not found`,
      );
    }

    return tenant;
  }

  async update(id: number, updateTenantDto: UpdateTenantDto) {
    const tenant = await this.findOne(id);
    const updateData: Partial<Tenant> = {};

    if (updateTenantDto.slug) {
      if (!isValidTenantSlug(updateTenantDto.slug)) {
        throw new BadRequestException(
          `Invalid or reserved tenant slug: '${updateTenantDto.slug}'`,
        );
      }

      if (updateTenantDto.slug !== tenant.slug) {
        throw new BadRequestException(
          'Tenant slug cannot be changed after provisioning',
        );
      }

      updateData.slug = updateTenantDto.slug;
    }

    if (updateTenantDto.company_name !== undefined) {
      updateData.company_name = updateTenantDto.company_name;
    }

    if (updateTenantDto.logo_url !== undefined) {
      updateData.logo_url = updateTenantDto.logo_url;
    }

    if (updateTenantDto.currency !== undefined) {
      updateData.currency = updateTenantDto.currency;
    }

    if (updateTenantDto.locale !== undefined) {
      updateData.locale = updateTenantDto.locale;
    }

    if (updateTenantDto.is_active !== undefined) {
      updateData.is_active = updateTenantDto.is_active;
    }

    if (Object.keys(updateData).length === 0) {
      return tenant;
    }

    await this.tenantRepository.update(id, updateData);
    return this.findOne(id);
  }

  async remove(id: number) {
    const tenant = await this.findOne(id);

    // Opcional: Eliminar el schema de PostgreSQL
    await this.tenantSchemaService.dropSchema(tenant.schema_name);

    await this.tenantRepository.delete(id);

    return { message: 'Tenant deleted successfully' };
  }
}
