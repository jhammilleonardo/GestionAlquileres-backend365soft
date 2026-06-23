import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { TenantWebsiteService } from './tenant-website.service';
import { OptionalJwtAuthGuard } from '../common/guards/optional-jwt-auth.guard';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';

/**
 * Branding público del portal (`/:slug/publico/*`). Lo consume el portal anónimo
 * para tematizarse (logo, colores, contacto, redes, SEO). Auth opcional: un
 * sitio no publicado solo es visible para el staff autenticado del tenant.
 */
@ApiTags('Public Website')
@Controller(':slug/catalog')
@UseGuards(OptionalJwtAuthGuard)
export class PublicBrandingController {
  constructor(private readonly tenantWebsiteService: TenantWebsiteService) {}

  @Get('website')
  @ApiOperation({ summary: 'Branding público del portal del tenant' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getBranding(@Param('slug') slug: string, @Req() req: TenantRequest) {
    const allowUnpublished = this.tenantWebsiteService.isStaffOfTenant(
      req.user,
      slug,
    );
    const branding = await this.tenantWebsiteService.getBranding(
      slug,
      allowUnpublished,
    );
    if (!branding) {
      throw new NotFoundException(`Sitio '${slug}' no encontrado`);
    }
    return branding;
  }
}
