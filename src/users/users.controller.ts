import { Controller, Get, UseGuards, Param, Query } from '@nestjs/common';
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
  async findAll(@Param('slug') slug: string, @CurrentTenant() tenant: any) {
    if (!tenant) {
      throw new Error('Tenant no encontrado en el request');
    }

    return await this.usersService.findAll(tenant.schema_name);
  }

  @Get('tenants')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({
    summary: 'Obtener todos los inquilinos',
    description: 'Lista solo usuarios con rol INQUILINO. Incluye información sobre sus solicitudes y contratos.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['approved', 'pending', 'all'],
    description: 'Filtrar por estado de solicitud (approved = con solicitud aprobada)',
  })
  @ApiQuery({
    name: 'hasActiveContract',
    required: false,
    enum: ['true', 'false'],
    description: 'Filtrar por si tiene contrato activo',
  })
  async findTenants(
    @Query('status') status?: 'approved' | 'pending' | 'all',
    @Query('hasActiveContract') hasActiveContract?: string,
  ) {
    const filters: any = {};

    if (status && status !== 'all') {
      filters.status = status;
    }

    if (hasActiveContract !== undefined) {
      filters.hasActiveContract = hasActiveContract === 'true';
    }

    return await this.usersService.findTenants(filters);
  }

  @Get('tenants/:id')
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiOperation({ summary: 'Obtener un inquilino por ID' })
  async findTenantById(@Param('id') id: string) {
    const tenant = await this.usersService.findTenantById(Number(id));

    if (!tenant) {
      throw new Error('Inquilino no encontrado');
    }

    return tenant;
  }
}
