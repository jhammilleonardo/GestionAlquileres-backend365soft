import {
  Controller,
  Get,
  UseGuards,
  Param,
  Query,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentTenant } from '../common/decorators/current-tenant.decorator';
import type { TenantContext } from '../common/middleware/tenant-context.middleware';

interface FindTenantsFilters {
  status?: 'approved' | 'pending' | 'active' | 'past' | 'none';
  hasActiveContract?: boolean;
  search?: string;
}

@ApiTags('Users')
@ApiBearerAuth()
@Controller(':slug/users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Obtener todos los usuarios del tenant' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async findAll(
    @Param('slug') _slug: string,
    @CurrentTenant() tenant: TenantContext | undefined,
  ) {
    if (!tenant) {
      throw new InternalServerErrorException(
        'Tenant no encontrado en el request',
      );
    }

    return await this.usersService.findAll(tenant.schema_name);
  }

  @Get('tenants')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Obtener todos los inquilinos',
    description:
      'Lista solo usuarios con rol INQUILINO. Incluye información sobre sus solicitudes y contratos.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['approved', 'pending', 'active', 'past', 'none', 'all'],
    description: 'Filtrar por estado de solicitud o contrato',
  })
  @ApiQuery({
    name: 'hasActiveContract',
    required: false,
    enum: ['true', 'false'],
    description: 'Filtrar por si tiene contrato activo',
  })
  async findTenants(
    @CurrentTenant() tenant: TenantContext | undefined,
    @Query('status')
    status?: 'approved' | 'pending' | 'active' | 'past' | 'none' | 'all',
    @Query('hasActiveContract') hasActiveContract?: string,
    @Query('search') search?: string,
  ) {
    if (!tenant) {
      throw new InternalServerErrorException(
        'Tenant no encontrado en el request',
      );
    }

    const filters: FindTenantsFilters = {};

    if (status && status !== 'all') {
      filters.status = status;
    }

    if (hasActiveContract !== undefined) {
      filters.hasActiveContract = hasActiveContract === 'true';
    }

    if (search) {
      filters.search = search;
    }

    return await this.usersService.findTenants(tenant.schema_name, filters);
  }

  @Get('tenants/:id')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Obtener un inquilino por ID' })
  async findTenantById(
    @CurrentTenant() currentTenant: TenantContext | undefined,
    @Param('id') id: string,
  ) {
    if (!currentTenant) {
      throw new InternalServerErrorException(
        'Tenant no encontrado en el request',
      );
    }

    const tenant = await this.usersService.findTenantById(
      currentTenant.schema_name,
      Number(id),
    );

    if (!tenant) {
      throw new NotFoundException('Inquilino no encontrado');
    }

    return tenant;
  }
}
