import { Controller, Get, Post, Param, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TenantWebsiteService } from './tenant-website.service';
import { ContactFormDto } from './dto/contact-form.dto';
import type { Request } from 'express';

@ApiTags('Public Website')
@Controller('public')
export class PublicWebsiteController {
  constructor(private readonly tenantWebsiteService: TenantWebsiteService) {}

  @Get(':subdomain')
  @ApiOperation({
    summary: 'Obtener información pública del sitio de un tenant',
  })
  getPublicWebsite(@Param('subdomain') subdomain: string) {
    return this.tenantWebsiteService.getPublicWebsite(subdomain);
  }

  @Post(':subdomain/contact')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({
    summary: 'Enviar formulario de contacto desde el sitio público',
  })
  submitContact(
    @Param('subdomain') subdomain: string,
    @Body() dto: ContactFormDto,
    @Req() req: Request,
  ) {
    const userIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ??
      req.socket.remoteAddress ??
      'unknown';

    return this.tenantWebsiteService.submitContact(subdomain, dto, userIp);
  }
}
