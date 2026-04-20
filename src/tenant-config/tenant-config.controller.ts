import { Controller, Get, Patch, Body, Param, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TenantConfigService } from './tenant-config.service';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Tenant Config')
@ApiBearerAuth()
@Controller(':slug/admin/config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class TenantConfigController {
  constructor(private readonly tenantConfigService: TenantConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener configuración actual del tenant' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  getConfig(@Param('slug') _slug: string) {
    return this.tenantConfigService.getConfig();
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar configuración del tenant' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  updateConfig(
    @Param('slug') _slug: string,
    @Body() dto: UpdateTenantConfigDto,
  ) {
    return this.tenantConfigService.updateConfig(dto);
  }

  @Patch('setup-complete')
  @ApiOperation({ summary: 'Marcar wizard de configuración como completado' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  markSetupComplete(@Param('slug') _slug: string) {
    return this.tenantConfigService.markSetupComplete();
  }
}
