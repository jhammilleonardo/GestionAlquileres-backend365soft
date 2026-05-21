import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { TenantConfigService } from './tenant-config.service';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';
import { TenantConfigResponseDto } from './dto/tenant-config-response.dto';

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
  @ApiOkResponse({ type: TenantConfigResponseDto })
  @ApiNotFoundResponse({
    description: 'Configuración del tenant no encontrada',
  })
  getConfig(@Param('slug') _slug: string, @Req() req: TenantRequest) {
    return this.tenantConfigService.getConfig(req.tenant!.schema_name);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar configuración del tenant' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiBody({ type: UpdateTenantConfigDto })
  @ApiOkResponse({ type: TenantConfigResponseDto })
  @ApiNotFoundResponse({
    description: 'Configuración del tenant no encontrada',
  })
  updateConfig(
    @Param('slug') _slug: string,
    @Req() req: TenantRequest,
    @Body() dto: UpdateTenantConfigDto,
  ) {
    return this.tenantConfigService.updateConfig(req.tenant!.schema_name, dto);
  }

  @Patch('setup-complete')
  @ApiOperation({ summary: 'Marcar wizard de configuración como completado' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: TenantConfigResponseDto })
  @ApiNotFoundResponse({
    description: 'Configuración del tenant no encontrada',
  })
  markSetupComplete(@Param('slug') _slug: string, @Req() req: TenantRequest) {
    return this.tenantConfigService.markSetupComplete(req.tenant!.schema_name);
  }
}
