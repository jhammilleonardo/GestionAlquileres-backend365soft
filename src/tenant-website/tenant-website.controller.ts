import { Controller, Get, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantWebsiteService } from './tenant-website.service';
import { UpdateTenantWebsiteDto } from './dto/update-tenant-website.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';

@ApiTags('Tenant Website')
@ApiBearerAuth()
@Controller(':slug/admin/website')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class TenantWebsiteController {
  constructor(private readonly tenantWebsiteService: TenantWebsiteService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener configuración del sitio público' })
  getWebsite(@Req() req: TenantRequest) {
    return this.tenantWebsiteService.getOrCreate(req.tenant!.schema_name);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar configuración del sitio público' })
  updateWebsite(
    @Req() req: TenantRequest,
    @Body() dto: UpdateTenantWebsiteDto,
  ) {
    return this.tenantWebsiteService.update(req.tenant!.schema_name, dto);
  }

  @Patch('publish')
  @ApiOperation({ summary: 'Publicar o despublicar el sitio' })
  togglePublish(@Req() req: TenantRequest) {
    return this.tenantWebsiteService.togglePublish(req.tenant!.schema_name);
  }
}
